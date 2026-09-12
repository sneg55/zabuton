import { AgentMail, vOutboundId, type OutboundId } from "@agentmail/convex";
import { ConvexError, v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation, query, type ActionCtx } from "./_generated/server";
import { acknowledgementSubject, acknowledgementText } from "./lib/drafting";
import type { ApplicationMail, NoticeMail, SendRecord } from "./mailStore";

export const agentMail = new AgentMail(components.agentmail, {
  onMessageReceived: internal.mail.onMessageReceived,
});

const RECONCILE_DELAY_MS = 8_000;
const RECONCILE_RETRY_MS = 60_000;
const RECONCILE_MAX_ATTEMPTS = 3;
const APPLICATION_LABELS = ["application"];
const NOTICE_LABELS = ["notice"];

export function inboxDisplayName(cityName: string): string {
  return `${cityName.replace(/[^A-Za-z0-9 .'-]/g, "").replace(/\s+/g, " ").trim()} City Clerk`;
}

function mailCtx<T>(ctx: ActionCtx): T {
  return ctx as unknown as T;
}

function failureNote(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("AGENTMAIL_API_KEY")) return "email not configured";
  return `email not sent: ${message}`;
}

function inboundAt(timestamp: unknown): number {
  if (typeof timestamp === "string") {
    const parsed = Date.parse(timestamp);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) return timestamp;
  return Date.now();
}

function recipients(to: unknown): string | undefined {
  if (typeof to === "string") return to;
  if (Array.isArray(to)) {
    const joined = to.filter((entry): entry is string => typeof entry === "string").join(", ");
    return joined.length > 0 ? joined : undefined;
  }
  return undefined;
}

async function syncOutbound(
  ctx: ActionCtx,
  args: { threadId: Id<"threads">; messageRowId: Id<"messages"> | null; outboundId: string },
): Promise<string | null> {
  try {
    const outbound = await agentMail.status(mailCtx(ctx), args.outboundId as OutboundId);
    if (!outbound?.agentmailMessageId) return null;
    await ctx.runMutation(internal.mailStore.applyOutboundStatus, {
      threadId: args.threadId,
      messageRowId: args.messageRowId ?? undefined,
      agentmailMessageId: outbound.agentmailMessageId,
      agentmailThreadId: outbound.threadId ?? undefined,
    });
    return outbound.agentmailMessageId;
  } catch {
    return null;
  }
}

async function scheduleReconcile(ctx: ActionCtx, recorded: SendRecord | null, outboundId: OutboundId) {
  if (!recorded) return;
  await ctx.scheduler.runAfter(RECONCILE_DELAY_MS, internal.mail.reconcileOutbound, {
    threadId: recorded.threadId,
    messageRowId: recorded.messageRowId,
    outboundId,
  });
}

export const status = action({
  args: {},
  handler: async () => ({ configured: Boolean(process.env.AGENTMAIL_API_KEY) }),
});

export const isConfigured = query({
  args: {},
  handler: async () => Boolean(process.env.AGENTMAIL_API_KEY),
});

export const threadMessages = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, { threadId }) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .collect();
    messages.sort((a, b) => a.at - b.at);
    return messages;
  },
});

export const ensureInbox = action({
  args: { cityId: v.id("cities") },
  handler: async (ctx, { cityId }): Promise<{ inboxId: string; address: string }> => {
    const city = await ctx.runQuery(internal.mailStore.cityForInbox, { cityId });
    if (!city) throw new ConvexError("City not found");
    if (city.inboxId) return { inboxId: city.inboxId, address: city.inboxAddress ?? city.inboxId };
    const inbox = (await agentMail.createInbox(mailCtx(ctx), {
      username: city.slug,
      displayName: inboxDisplayName(city.name),
    })) as { inbox_id?: string; email?: string } | null;
    const inboxId = inbox?.inbox_id;
    if (!inboxId) throw new ConvexError("AgentMail did not return an inbox");
    const address = inbox.email ?? inboxId;
    await ctx.runMutation(internal.mailStore.saveInbox, { cityId, inboxId, address });
    return { inboxId, address };
  },
});

export const reconcileOutbound = internalAction({
  args: {
    threadId: v.id("threads"),
    messageRowId: v.optional(v.id("messages")),
    outboundId: vOutboundId,
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, { threadId, messageRowId, outboundId, attempt }) => {
    const resolved = await syncOutbound(ctx, { threadId, messageRowId: messageRowId ?? null, outboundId });
    const tries = attempt ?? 1;
    if (resolved === null && tries < RECONCILE_MAX_ATTEMPTS) {
      await ctx.scheduler.runAfter(RECONCILE_RETRY_MS, internal.mail.reconcileOutbound, {
        threadId,
        messageRowId,
        outboundId,
        attempt: tries + 1,
      });
    }
    return null;
  },
});

export const openApplicationThread = internalAction({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, { applicationId }) => {
    const mail: ApplicationMail | null = await ctx.runQuery(internal.mailStore.applicationMail, { applicationId });
    if (!mail) return null;
    if (!mail.inboxId) {
      await ctx.runMutation(internal.mailStore.noteOnApplication, { applicationId, note: "email not configured" });
      return null;
    }
    const inboxId = mail.inboxId;
    const subject = acknowledgementSubject(mail.context);
    const text = acknowledgementText(mail.context);
    try {
      const outboundId = await agentMail.sendMessage(mailCtx(ctx), inboxId, {
        to: mail.email,
        subject,
        text,
        labels: APPLICATION_LABELS,
      });
      const recorded: SendRecord | null = await ctx.runMutation(internal.mailStore.recordApplicationSend, {
        applicationId,
        inboxId,
        from: mail.inboxAddress ?? inboxId,
        to: mail.email,
        subject,
        text,
        outboundId,
      });
      await scheduleReconcile(ctx, recorded, outboundId);
    } catch (error) {
      await ctx.runMutation(internal.mailStore.noteOnApplication, { applicationId, note: failureNote(error) });
    }
    return null;
  },
});

export const replyOnThread = internalAction({
  args: { applicationId: v.id("applications"), text: v.string() },
  handler: async (ctx, { applicationId, text }) => {
    const mail: ApplicationMail | null = await ctx.runQuery(internal.mailStore.applicationMail, { applicationId });
    if (!mail) return null;
    if (!mail.inboxId) {
      await ctx.runMutation(internal.mailStore.noteOnApplication, { applicationId, note: "email not configured" });
      return null;
    }
    const inboxId = mail.inboxId;
    let parentMessageId = mail.lastMessageId;
    if (mail.threadId && !parentMessageId && mail.pendingOutboundId) {
      parentMessageId = await syncOutbound(ctx, {
        threadId: mail.threadId,
        messageRowId: mail.pendingMessageRowId,
        outboundId: mail.pendingOutboundId,
      });
    }
    try {
      const outboundId =
        mail.threadId && parentMessageId
          ? await agentMail.replyToMessage(mailCtx(ctx), inboxId, parentMessageId, { text })
          : await agentMail.sendMessage(mailCtx(ctx), inboxId, {
              to: mail.email,
              subject: mail.subject,
              text,
              labels: APPLICATION_LABELS,
            });
      const recorded: SendRecord | null = await ctx.runMutation(internal.mailStore.recordApplicationSend, {
        applicationId,
        inboxId,
        from: mail.inboxAddress ?? inboxId,
        to: mail.email,
        subject: mail.subject,
        text,
        outboundId,
      });
      await scheduleReconcile(ctx, recorded, outboundId);
    } catch (error) {
      await ctx.runMutation(internal.mailStore.noteOnApplication, { applicationId, note: failureNote(error) });
    }
    return null;
  },
});

export const sendNotice = internalAction({
  args: { noticeId: v.id("notices") },
  handler: async (ctx, { noticeId }) => {
    const mail: NoticeMail | null = await ctx.runQuery(internal.mailStore.noticeMail, { noticeId });
    if (!mail) {
      await ctx.runMutation(internal.mailStore.recordNoticeFailure, { noticeId, error: "Member has no email" });
      return null;
    }
    if (!mail.inboxId) {
      await ctx.runMutation(internal.mailStore.recordNoticeFailure, { noticeId, error: "email not configured" });
      return null;
    }
    const inboxId = mail.inboxId;
    try {
      const outboundId =
        mail.threadId && mail.lastMessageId
          ? await agentMail.replyToMessage(mailCtx(ctx), inboxId, mail.lastMessageId, { text: mail.body })
          : await agentMail.sendMessage(mailCtx(ctx), inboxId, {
              to: mail.email,
              subject: mail.subject,
              text: mail.body,
              labels: NOTICE_LABELS,
            });
      const recorded: SendRecord | null = await ctx.runMutation(internal.mailStore.recordNoticeSend, {
        noticeId,
        inboxId,
        from: mail.inboxAddress ?? inboxId,
        to: mail.email,
        outboundId,
      });
      await scheduleReconcile(ctx, recorded, outboundId);
    } catch (error) {
      await ctx.runMutation(internal.mailStore.recordNoticeFailure, { noticeId, error: failureNote(error) });
    }
    return null;
  },
});

export const onMessageReceived = internalMutation({
  args: { message: v.any(), thread: v.any(), eventId: v.string() },
  handler: async (ctx, { message }): Promise<Id<"messages"> | null> => {
    const inbound = message as Record<string, unknown> | null;
    const agentmailThreadId = typeof inbound?.thread_id === "string" ? inbound.thread_id : null;
    if (!agentmailThreadId) return null;
    return ctx.runMutation(internal.mailStore.appendInbound, {
      agentmailThreadId,
      agentmailMessageId: typeof inbound?.message_id === "string" ? inbound.message_id : undefined,
      from: typeof inbound?.from === "string" ? inbound.from : undefined,
      to: recipients(inbound?.to),
      subject: typeof inbound?.subject === "string" ? inbound.subject : undefined,
      text: typeof inbound?.text === "string" ? inbound.text : "",
      at: inboundAt(inbound?.timestamp),
    });
  },
});
