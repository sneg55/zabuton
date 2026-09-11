import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { applicationContext, applicationRows } from "./applications";
import { acknowledgementSubject, type ApplicationContext } from "./lib/drafting";
import { requireClerk } from "./users";

export type ApplicationMail = {
  email: string;
  context: ApplicationContext;
  inboxId: string | null;
  inboxAddress: string | null;
  threadId: Id<"threads"> | null;
  subject: string;
  lastMessageId: string | null;
  pendingOutboundId: string | null;
  pendingMessageRowId: Id<"messages"> | null;
};

export type NoticeMail = {
  subject: string;
  body: string;
  email: string;
  inboxId: string | null;
  inboxAddress: string | null;
  threadId: Id<"threads"> | null;
  lastMessageId: string | null;
};

export type SendRecord = { threadId: Id<"threads">; messageRowId: Id<"messages"> };

export const cityForInbox = internalQuery({
  args: { cityId: v.id("cities") },
  handler: async (ctx, { cityId }) => {
    await requireClerk(ctx);
    return ctx.db.get(cityId);
  },
});

export const saveInbox = internalMutation({
  args: { cityId: v.id("cities"), inboxId: v.string(), address: v.string() },
  handler: async (ctx, { cityId, inboxId, address }) => {
    await ctx.db.patch(cityId, { inboxId, inboxAddress: address });
    return null;
  },
});

export const applicationMail = internalQuery({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, { applicationId }): Promise<ApplicationMail | null> => {
    const rows = await applicationRows(ctx, applicationId);
    if (!rows) return null;
    const context = applicationContext(rows);
    const thread = rows.application.threadId ? await ctx.db.get(rows.application.threadId) : null;
    const events = await ctx.db
      .query("applicationEvents")
      .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
      .order("desc")
      .collect();
    const pending = events.find((event) => event.outboundId !== undefined) ?? null;
    let pendingMessageRowId: Id<"messages"> | null = null;
    if (thread) {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
        .collect();
      const outbound = messages.filter((message) => message.direction === "outbound").sort((a, b) => b.at - a.at);
      pendingMessageRowId = outbound[0]?._id ?? null;
    }
    return {
      email: rows.application.email,
      context,
      inboxId: rows.city.inboxId ?? null,
      inboxAddress: rows.city.inboxAddress ?? null,
      threadId: thread?._id ?? null,
      subject: thread?.subject ?? acknowledgementSubject(context),
      lastMessageId: thread?.lastMessageId ?? null,
      pendingOutboundId: pending?.outboundId ?? null,
      pendingMessageRowId,
    };
  },
});

export const noteOnApplication = internalMutation({
  args: { applicationId: v.id("applications"), note: v.string() },
  handler: async (ctx, { applicationId, note }) => {
    const application = await ctx.db.get(applicationId);
    if (!application) return null;
    await ctx.db.insert("applicationEvents", { applicationId, state: application.state, note, at: Date.now() });
    return null;
  },
});

export const recordApplicationSend = internalMutation({
  args: {
    applicationId: v.id("applications"),
    inboxId: v.string(),
    from: v.string(),
    to: v.string(),
    subject: v.string(),
    text: v.string(),
    outboundId: v.string(),
  },
  handler: async (ctx, args): Promise<SendRecord | null> => {
    const application = await ctx.db.get(args.applicationId);
    if (!application) return null;
    const at = Date.now();
    let threadId = application.threadId ?? null;
    if (!threadId) {
      threadId = await ctx.db.insert("threads", {
        cityId: application.cityId,
        kind: "application",
        applicationId: args.applicationId,
        inboxId: args.inboxId,
        counterpartEmail: args.to,
        subject: args.subject,
        lastMessageAt: at,
      });
      await ctx.db.patch(args.applicationId, { threadId, updatedAt: at });
    } else {
      await ctx.db.patch(threadId, { lastMessageAt: at });
      await ctx.db.patch(args.applicationId, { updatedAt: at });
    }
    const messageRowId = await ctx.db.insert("messages", {
      threadId,
      direction: "outbound",
      from: args.from,
      to: args.to,
      subject: args.subject,
      text: args.text,
      at,
    });
    await ctx.db.insert("applicationEvents", {
      applicationId: args.applicationId,
      state: application.state,
      note: "Email sent",
      outboundId: args.outboundId,
      at,
    });
    return { threadId, messageRowId };
  },
});

export const applyOutboundStatus = internalMutation({
  args: {
    threadId: v.id("threads"),
    messageRowId: v.optional(v.id("messages")),
    agentmailMessageId: v.string(),
    agentmailThreadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) return null;
    await ctx.db.patch(args.threadId, {
      lastMessageId: args.agentmailMessageId,
      agentmailThreadId: args.agentmailThreadId ?? thread.agentmailThreadId,
    });
    if (args.messageRowId) {
      const message = await ctx.db.get(args.messageRowId);
      if (message) await ctx.db.patch(args.messageRowId, { agentmailMessageId: args.agentmailMessageId });
    }
    return null;
  },
});

export const noticeMail = internalQuery({
  args: { noticeId: v.id("notices") },
  handler: async (ctx, { noticeId }): Promise<NoticeMail | null> => {
    const notice = await ctx.db.get(noticeId);
    if (!notice) return null;
    const member = await ctx.db.get(notice.memberId);
    if (!member || !member.email) return null;
    const city = await ctx.db.get(notice.cityId);
    if (!city) return null;
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_city", (q) => q.eq("cityId", notice.cityId))
      .collect();
    const thread =
      (notice.threadId ? await ctx.db.get(notice.threadId) : null) ??
      threads.find((row) => row.kind === "member" && row.memberId === notice.memberId) ??
      null;
    return {
      subject: notice.subject,
      body: notice.body,
      email: member.email,
      inboxId: city.inboxId ?? null,
      inboxAddress: city.inboxAddress ?? null,
      threadId: thread?._id ?? null,
      lastMessageId: thread?.lastMessageId ?? null,
    };
  },
});

export const recordNoticeSend = internalMutation({
  args: {
    noticeId: v.id("notices"),
    inboxId: v.string(),
    from: v.string(),
    to: v.string(),
    outboundId: v.string(),
  },
  handler: async (ctx, args): Promise<SendRecord | null> => {
    const notice = await ctx.db.get(args.noticeId);
    if (!notice) return null;
    const at = Date.now();
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_city", (q) => q.eq("cityId", notice.cityId))
      .collect();
    let threadId =
      notice.threadId ?? threads.find((row) => row.kind === "member" && row.memberId === notice.memberId)?._id ?? null;
    if (!threadId) {
      threadId = await ctx.db.insert("threads", {
        cityId: notice.cityId,
        kind: "member",
        memberId: notice.memberId,
        inboxId: args.inboxId,
        counterpartEmail: args.to,
        subject: notice.subject,
        lastMessageAt: at,
      });
    } else {
      await ctx.db.patch(threadId, { lastMessageAt: at });
    }
    const messageRowId = await ctx.db.insert("messages", {
      threadId,
      direction: "outbound",
      from: args.from,
      to: args.to,
      subject: notice.subject,
      text: notice.body,
      at,
    });
    await ctx.db.patch(args.noticeId, {
      status: "sent",
      sentAt: at,
      outboundId: args.outboundId,
      threadId,
      error: undefined,
    });
    return { threadId, messageRowId };
  },
});

export const recordNoticeFailure = internalMutation({
  args: { noticeId: v.id("notices"), error: v.string() },
  handler: async (ctx, { noticeId, error }) => {
    const notice = await ctx.db.get(noticeId);
    if (!notice) return null;
    await ctx.db.patch(noticeId, { status: "failed", error });
    return null;
  },
});

export const appendInbound = internalMutation({
  args: {
    agentmailThreadId: v.string(),
    agentmailMessageId: v.optional(v.string()),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    subject: v.optional(v.string()),
    text: v.string(),
    at: v.number(),
  },
  handler: async (ctx, args): Promise<Id<"messages"> | null> => {
    const thread = await ctx.db
      .query("threads")
      .withIndex("by_agentmail_thread", (q) => q.eq("agentmailThreadId", args.agentmailThreadId))
      .first();
    if (!thread) return null;
    if (args.agentmailMessageId) {
      const seen = await ctx.db
        .query("messages")
        .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
        .collect();
      if (seen.some((row) => row.agentmailMessageId === args.agentmailMessageId)) return null;
    }
    const messageRowId = await ctx.db.insert("messages", {
      threadId: thread._id,
      direction: "inbound",
      agentmailMessageId: args.agentmailMessageId,
      from: args.from ?? thread.counterpartEmail,
      to: args.to ?? thread.inboxId,
      subject: args.subject ?? thread.subject,
      text: args.text,
      at: args.at,
    });
    await ctx.db.patch(thread._id, {
      lastMessageAt: args.at,
      lastMessageId: args.agentmailMessageId ?? thread.lastMessageId,
    });
    if (thread.applicationId) {
      const application = await ctx.db.get(thread.applicationId);
      if (application) await ctx.db.patch(thread.applicationId, { updatedAt: args.at });
    }
    return messageRowId;
  },
});
