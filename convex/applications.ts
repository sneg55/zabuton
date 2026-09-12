import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import {
  applicationReplyPrompt,
  applicationReplyTemplate,
  DRAFT_INSTRUCTIONS,
  isoDate,
  requestDraft,
  termEndFrom,
  type ApplicationContext,
  type ApplicationState,
} from "./lib/drafting";
import { applicationStateValidator } from "./schema";
import { requireClerk } from "./users";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ApplicationRows = {
  application: Doc<"applications">;
  city: Doc<"cities">;
  body: Doc<"bodies"> | null;
  seat: Doc<"seats"> | null;
};

export async function applicationRows(
  ctx: QueryCtx,
  applicationId: Id<"applications">,
): Promise<ApplicationRows | null> {
  const application = await ctx.db.get(applicationId);
  if (!application) return null;
  const city = await ctx.db.get(application.cityId);
  if (!city) return null;
  const seat = application.seatId ? await ctx.db.get(application.seatId) : null;
  const bodyId = application.bodyId ?? seat?.bodyId ?? null;
  const body = bodyId ? await ctx.db.get(bodyId) : null;
  return { application, city, body, seat };
}

export function applicationContext(rows: ApplicationRows): ApplicationContext {
  return {
    cityName: rows.city.name,
    bodyName: rows.body?.name ?? null,
    seatLabel: rows.seat?.label ?? null,
    applicantName: rows.application.applicantName,
    statement: rows.application.statement,
    termLength: rows.body?.termLength ?? null,
    meetingCadence: rows.body?.meetingCadence ?? null,
  };
}

async function lastEventOf(ctx: QueryCtx, applicationId: Id<"applications">) {
  return ctx.db
    .query("applicationEvents")
    .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
    .order("desc")
    .first();
}

export const APPLICATION_CITY_CAP = 50;
export const APPLICATION_EMAIL_CAP = 3;
export const APPLICATION_WINDOW_MS = 24 * 60 * 60 * 1000;

export const submit = mutation({
  args: {
    citySlug: v.string(),
    bodyId: v.optional(v.id("bodies")),
    seatId: v.optional(v.id("seats")),
    applicantName: v.string(),
    email: v.string(),
    statement: v.string(),
  },
  handler: async (ctx, args) => {
    const city = await ctx.db
      .query("cities")
      .withIndex("by_slug", (q) => q.eq("slug", args.citySlug))
      .unique();
    if (!city) throw new ConvexError("City not found");
    const applicantName = args.applicantName.trim();
    const email = args.email.trim();
    const statement = args.statement.trim();
    if (applicantName.length === 0) throw new ConvexError("Enter your name");
    if (!EMAIL.test(email)) throw new ConvexError("Enter a valid email address");
    if (statement.length === 0) throw new ConvexError("Tell the clerk why you want to serve");
    const seat = args.seatId ? await ctx.db.get(args.seatId) : null;
    const bodyId = args.bodyId ?? seat?.bodyId;
    const now = Date.now();
    const recent = (await ctx.db.query("applications").withIndex("by_city", (q) => q.eq("cityId", city._id)).collect()).filter(
      (row) => row._creationTime >= now - APPLICATION_WINDOW_MS,
    );
    if (recent.length >= APPLICATION_CITY_CAP) {
      throw new ConvexError(`${city.name} has received as many applications as it accepts in a day. Try again tomorrow.`);
    }
    if (recent.filter((row) => row.email.toLowerCase() === email.toLowerCase()).length >= APPLICATION_EMAIL_CAP) {
      throw new ConvexError(`That email address has already sent ${APPLICATION_EMAIL_CAP} applications today.`);
    }
    const applicationId = await ctx.db.insert("applications", {
      cityId: city._id,
      bodyId,
      seatId: args.seatId,
      applicantName,
      email,
      statement,
      state: "received",
      updatedAt: now,
    });
    await ctx.db.insert("applicationEvents", {
      applicationId,
      state: "received",
      note: "Application received",
      at: now,
    });
    await ctx.scheduler.runAfter(0, internal.mail.openApplicationThread, { applicationId });
    return applicationId;
  },
});

export const list = query({
  args: { cityId: v.id("cities") },
  handler: async (ctx, { cityId }) => {
    const applications = await ctx.db
      .query("applications")
      .withIndex("by_city", (q) => q.eq("cityId", cityId))
      .collect();
    applications.sort((a, b) => b.updatedAt - a.updatedAt);
    const rows = [];
    for (const application of applications) {
      const seat = application.seatId ? await ctx.db.get(application.seatId) : null;
      const bodyId = application.bodyId ?? seat?.bodyId ?? null;
      const body = bodyId ? await ctx.db.get(bodyId) : null;
      rows.push({
        ...application,
        bodyName: body?.name ?? null,
        seatLabel: seat?.label ?? null,
        lastEvent: await lastEventOf(ctx, application._id),
      });
    }
    return rows;
  },
});

export const get = query({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, { applicationId }) => {
    const rows = await applicationRows(ctx, applicationId);
    if (!rows) return null;
    const events = await ctx.db
      .query("applicationEvents")
      .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
      .collect();
    events.sort((a, b) => a.at - b.at);
    const messages = rows.application.threadId
      ? await ctx.db
          .query("messages")
          .withIndex("by_thread", (q) => q.eq("threadId", rows.application.threadId!))
          .collect()
      : [];
    messages.sort((a, b) => a.at - b.at);
    return { application: rows.application, body: rows.body, seat: rows.seat, events, messages };
  },
});

export const replyContext = internalQuery({
  args: { applicationId: v.id("applications") },
  handler: async (ctx, { applicationId }) => {
    await requireClerk(ctx);
    const rows = await applicationRows(ctx, applicationId);
    return rows === null ? null : applicationContext(rows);
  },
});

export const draftReply = action({
  args: { applicationId: v.id("applications"), state: applicationStateValidator },
  handler: async (ctx, { applicationId, state }): Promise<{ text: string }> => {
    const context: ApplicationContext | null = await ctx.runQuery(internal.applications.replyContext, {
      applicationId,
    });
    if (!context) throw new ConvexError("Application not found");
    const drafted = await requestDraft(DRAFT_INSTRUCTIONS, applicationReplyPrompt(context, state));
    return { text: drafted ?? applicationReplyTemplate(context, state as ApplicationState) };
  },
});

export const setState = mutation({
  args: {
    applicationId: v.id("applications"),
    state: applicationStateValidator,
    replyText: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { applicationId, state, replyText, note }) => {
    await requireClerk(ctx);
    const application = await ctx.db.get(applicationId);
    if (!application) throw new ConvexError("Application not found");
    const now = Date.now();
    await ctx.db.patch(applicationId, { state, updatedAt: now });
    const reply = replyText?.trim();
    await ctx.db.insert("applicationEvents", {
      applicationId,
      state,
      note,
      replyText: reply && reply.length > 0 ? reply : undefined,
      at: now,
    });
    if (state === "appointed" && application.seatId) {
      const seatId = application.seatId;
      const terms = await ctx.db
        .query("terms")
        .withIndex("by_seat", (q) => q.eq("seatId", seatId))
        .collect();
      for (const term of terms) {
        if (term.current) await ctx.db.patch(term._id, { current: false });
      }
      const seat = await ctx.db.get(seatId);
      const body = seat ? await ctx.db.get(seat.bodyId) : null;
      const memberId = await ctx.db.insert("members", {
        cityId: application.cityId,
        name: application.applicantName,
        email: application.email,
      });
      await ctx.db.insert("terms", {
        seatId,
        memberId,
        startsAt: now,
        endsAt: termEndFrom(now, body?.termLength ?? null),
        sourceUrl: `application:${applicationId}`,
        snippet: `Appointed via application on ${isoDate(now)}`,
        current: true,
      });
    }
    if (reply && reply.length > 0) {
      await ctx.scheduler.runAfter(0, internal.mail.replyOnThread, { applicationId, text: reply });
    }
    return null;
  },
});
