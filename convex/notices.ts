import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import {
  DRAFT_INSTRUCTIONS,
  isoDate,
  noticePrompt,
  noticeTemplate,
  NOTICE_SCHEMA,
  parseNoticeDraft,
  requestDraft,
  type Draft,
  type NoticeContext,
} from "./lib/drafting";
import { noticeKindValidator } from "./schema";
import { requireClerk } from "./users";

type SeatContext = {
  cityId: Id<"cities">;
  bodyId: Id<"bodies">;
  seatId: Id<"seats">;
  memberId: Id<"members">;
  context: NoticeContext;
};

export const list = query({
  args: { cityId: v.id("cities") },
  handler: async (ctx, { cityId }) => {
    const notices = await ctx.db
      .query("notices")
      .withIndex("by_city", (q) => q.eq("cityId", cityId))
      .collect();
    notices.sort((a, b) => b._creationTime - a._creationTime);
    const rows = [];
    for (const notice of notices) {
      const body = await ctx.db.get(notice.bodyId);
      const member = await ctx.db.get(notice.memberId);
      rows.push({
        ...notice,
        bodyName: body?.name ?? null,
        memberName: member?.name ?? null,
        memberEmail: member?.email ?? null,
      });
    }
    return rows;
  },
});

export const seatContext = internalQuery({
  args: { seatId: v.id("seats"), kind: noticeKindValidator },
  handler: async (ctx, { seatId, kind }): Promise<SeatContext | null> => {
    await requireClerk(ctx);
    const seat = await ctx.db.get(seatId);
    if (!seat) return null;
    const body = await ctx.db.get(seat.bodyId);
    if (!body) return null;
    const city = await ctx.db.get(body.cityId);
    if (!city) return null;
    const terms = await ctx.db
      .query("terms")
      .withIndex("by_seat", (q) => q.eq("seatId", seatId))
      .collect();
    const term = terms.find((row) => row.current);
    if (!term) return null;
    const member = await ctx.db.get(term.memberId);
    if (!member) return null;
    return {
      cityId: city._id,
      bodyId: body._id,
      seatId,
      memberId: member._id,
      context: {
        cityName: city.name,
        bodyName: body.name,
        seatLabel: seat.label ?? null,
        memberName: member.name,
        termEnd: term.rawEnd ?? (term.endsAt ? isoDate(term.endsAt) : null),
        termLength: body.termLength ?? null,
        meetingCadence: body.meetingCadence ?? null,
        kind,
      },
    };
  },
});

export const insertDraft = internalMutation({
  args: {
    cityId: v.id("cities"),
    bodyId: v.id("bodies"),
    seatId: v.id("seats"),
    memberId: v.id("members"),
    kind: noticeKindValidator,
    subject: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) =>
    ctx.db.insert("notices", {
      cityId: args.cityId,
      bodyId: args.bodyId,
      seatId: args.seatId,
      memberId: args.memberId,
      kind: args.kind,
      subject: args.subject,
      body: args.body,
      status: "draft",
    }),
});

export const draft = action({
  args: { seatId: v.id("seats"), kind: noticeKindValidator },
  handler: async (ctx, { seatId, kind }): Promise<Id<"notices">> => {
    const seat: SeatContext | null = await ctx.runQuery(internal.notices.seatContext, { seatId, kind });
    if (!seat) throw new Error("This seat has no current member to write to");
    const raw = await requestDraft(DRAFT_INSTRUCTIONS, noticePrompt(seat.context), {
      name: "notice",
      schema: NOTICE_SCHEMA,
    });
    const drafted: Draft = parseNoticeDraft(raw) ?? noticeTemplate(seat.context);
    return ctx.runMutation(internal.notices.insertDraft, {
      cityId: seat.cityId,
      bodyId: seat.bodyId,
      seatId: seat.seatId,
      memberId: seat.memberId,
      kind,
      subject: drafted.subject,
      body: drafted.body,
    });
  },
});

export const approve = mutation({
  args: { noticeId: v.id("notices") },
  handler: async (ctx, { noticeId }) => {
    const clerk = await requireClerk(ctx);
    const notice = await ctx.db.get(noticeId);
    if (!notice) throw new Error("Notice not found");
    if (notice.status === "sent") throw new Error("Notice already sent");
    if (notice.status === "approved") throw new Error("Notice already approved and queued");
    const member = await ctx.db.get(notice.memberId);
    if (!member) throw new Error("Member not found");
    if (!member.email) throw new Error("Member has no email");
    await ctx.db.patch(noticeId, {
      status: "approved",
      approvedBy: clerk._id,
      approvedAt: Date.now(),
      error: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.mail.sendNotice, { noticeId });
    return null;
  },
});

export const discard = mutation({
  args: { noticeId: v.id("notices") },
  handler: async (ctx, { noticeId }) => {
    await requireClerk(ctx);
    const notice = await ctx.db.get(noticeId);
    if (!notice) return null;
    if (notice.status === "sent") throw new Error("A sent notice cannot be discarded");
    await ctx.db.delete(noticeId);
    return null;
  },
});
