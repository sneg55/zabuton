import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { canonicalName, cleanRole, isGenericBodyName, mergeDrafts, type DraftInput } from "./lib/draftTypes";
import { isVacancyName } from "./lib/seatStatus";
import { normalizeTermEnd } from "./lib/termDates";
import { draftMemberValidator, draftStatusValidator } from "./schema";
import { requireCityWriter } from "./users";

export const draftInputValidator = v.object({
  name: v.string(),
  meetingCadence: v.union(v.string(), v.null()),
  termLength: v.union(v.string(), v.null()),
  termLimit: v.union(v.string(), v.null()),
  seatCount: v.union(v.number(), v.null()),
  members: v.array(draftMemberValidator),
  snippet: v.string(),
  sourceUrl: v.string(),
});

export async function insertDrafts(
  ctx: MutationCtx,
  {
    cityId,
    crawlRunId,
    documentId,
    drafts,
  }: {
    cityId: Id<"cities">;
    crawlRunId: Id<"crawlRuns">;
    documentId?: Id<"documents">;
    drafts: DraftInput[];
  },
): Promise<{ draftCount: number; mergedCount: number; trackedCount: number }> {
  let inserted = 0;
  let merged = 0;
  let tracked = 0;
  const bodies = await ctx.db
    .query("bodies")
    .withIndex("by_city", (q) => q.eq("cityId", cityId))
    .collect();
  const trackedNames = new Set(bodies.map((body) => canonicalName(body.name)));
  const rows = await ctx.db
    .query("drafts")
    .withIndex("by_run", (q) => q.eq("crawlRunId", crawlRunId))
    .collect();
  const pendingByName = new Map<string, { id: Id<"drafts">; draft: DraftInput; documentId?: Id<"documents"> }>();
  for (const row of rows) {
    if (row.status !== "pending") continue;
    pendingByName.set(canonicalName(row.name), { id: row._id, draft: row as DraftInput, documentId: row.documentId });
  }
  for (const raw of drafts) {
    const draft: DraftInput = { ...raw, members: raw.members.map((member) => ({ ...member, role: cleanRole(member.role) })) };
    if (isGenericBodyName(draft.name)) continue;
    const key = canonicalName(draft.name);
    if (trackedNames.has(key)) {
      tracked += 1;
      continue;
    }
    const existing = pendingByName.get(key);
    if (existing) {
      const combined = mergeDrafts(existing.draft, draft);
      await ctx.db.patch(existing.id, {
        name: combined.name,
        meetingCadence: combined.meetingCadence,
        termLength: combined.termLength,
        termLimit: combined.termLimit,
        seatCount: combined.seatCount,
        members: combined.members,
        snippet: combined.snippet,
        sourceUrl: combined.sourceUrl,
        documentId: existing.documentId ?? documentId,
      });
      pendingByName.set(key, { id: existing.id, draft: combined, documentId: existing.documentId ?? documentId });
      merged += 1;
      continue;
    }
    const id = await ctx.db.insert("drafts", { cityId, crawlRunId, documentId, ...draft, status: "pending" });
    pendingByName.set(key, { id, draft, documentId });
    inserted += 1;
  }
  if (tracked > 0) {
    const run = await ctx.db.get(crawlRunId);
    if (run) await ctx.db.patch(crawlRunId, { log: [...run.log, { at: Date.now(), message: `${tracked} bodies already tracked for this city, skipped` }] });
  }
  return { draftCount: inserted, mergedCount: merged, trackedCount: tracked };
}

export const recordExtraction = internalMutation({
  args: {
    cityId: v.id("cities"),
    crawlRunId: v.id("crawlRuns"),
    documentId: v.optional(v.id("documents")),
    drafts: v.array(draftInputValidator),
  },
  handler: async (ctx, args) => insertDrafts(ctx, args),
});

export function invalidTermEnds(members: DraftInput["members"]): string[] {
  return members.filter((member) => member.termEnd !== null && member.termEnd.trim() !== "" && normalizeTermEnd(member.termEnd) === null).map((member) => member.termEnd as string);
}

export const saveEdits = mutation({
  args: {
    draftId: v.id("drafts"),
    edits: v.object({
      name: v.optional(v.string()),
      termLength: v.optional(v.union(v.string(), v.null())),
      termLimit: v.optional(v.union(v.string(), v.null())),
      members: v.optional(v.array(draftMemberValidator)),
    }),
  },
  handler: async (ctx, { draftId, edits }) => {
    const draft = await ctx.db.get(draftId);
    if (!draft) throw new ConvexError("That draft is gone");
    await requireCityWriter(ctx, draft.cityId);
    if (draft.status !== "pending") throw new ConvexError("Only pending drafts can be edited");
    await ctx.db.patch(draftId, {
      ...(edits.name === undefined ? {} : { name: edits.name }),
      ...(edits.termLength === undefined ? {} : { termLength: edits.termLength }),
      ...(edits.termLimit === undefined ? {} : { termLimit: edits.termLimit }),
      ...(edits.members === undefined ? {} : { members: edits.members }),
    });
    return null;
  },
});

export const dismissMany = mutation({
  args: { draftIds: v.array(v.id("drafts")) },
  handler: async (ctx, { draftIds }) => {
    for (const draftId of draftIds) {
      const draft = await ctx.db.get(draftId);
      if (!draft || draft.status !== "pending") continue;
      await requireCityWriter(ctx, draft.cityId);
      await ctx.db.patch(draftId, { status: "dismissed" });
    }
    return null;
  },
});

export const list = query({
  args: { cityId: v.id("cities"), status: v.optional(draftStatusValidator) },
  handler: async (ctx, { cityId, status }) => {
    const rows = await ctx.db
      .query("drafts")
      .withIndex("by_city", (q) => q.eq("cityId", cityId))
      .collect();
    const wanted = status ?? "pending";
    return rows.filter((row) => row.status === wanted).sort((a, b) => a.name.localeCompare(b.name));
  },
});

const editsValidator = v.object({
  name: v.optional(v.string()),
  meetingCadence: v.optional(v.union(v.string(), v.null())),
  termLength: v.optional(v.union(v.string(), v.null())),
  termLimit: v.optional(v.union(v.string(), v.null())),
  seatCount: v.optional(v.union(v.number(), v.null())),
  members: v.optional(v.array(draftMemberValidator)),
});

export async function confirmDraft(
  ctx: MutationCtx,
  draftId: Id<"drafts">,
  edits?: {
    name?: string;
    meetingCadence?: string | null;
    termLength?: string | null;
    termLimit?: string | null;
    seatCount?: number | null;
    members?: DraftInput["members"];
  },
): Promise<Id<"bodies">> {
  const draft = await ctx.db.get(draftId);
  if (!draft) throw new ConvexError("That draft is gone");
  if (draft.status === "confirmed") throw new ConvexError("That draft is already confirmed");
  const name = edits?.name ?? draft.name;
  if (name.trim() === "") throw new ConvexError("A body needs a name");
  const members = edits?.members ?? draft.members;
  const bad = invalidTermEnds(members);
  if (bad.length > 0) throw new ConvexError(`Not a date: ${bad.join(", ")}. Use a month and year, or leave it blank.`);
  const seatCount = edits?.seatCount === undefined ? draft.seatCount : edits.seatCount;
  const bodyId = await ctx.db.insert("bodies", {
    cityId: draft.cityId,
    name,
    meetingCadence: (edits?.meetingCadence === undefined ? draft.meetingCadence : edits.meetingCadence) ?? undefined,
    termLength: (edits?.termLength === undefined ? draft.termLength : edits.termLength) ?? undefined,
    termLimit: (edits?.termLimit === undefined ? draft.termLimit : edits.termLimit) ?? undefined,
    seatCount: seatCount ?? undefined,
    sourceUrl: draft.sourceUrl,
    confirmed: true,
  });
  let ordinal = 0;
  for (const member of members) {
    ordinal += 1;
    const label = cleanRole(member.role) ?? undefined;
    if (isVacancyName(member.name)) {
      await ctx.db.insert("seats", { bodyId, ordinal, label, vacant: true });
      continue;
    }
    const memberId = await ctx.db.insert("members", { cityId: draft.cityId, name: member.name.trim() });
    const seatId = await ctx.db.insert("seats", { bodyId, ordinal, label });
    await ctx.db.insert("terms", {
      seatId,
      memberId,
      endsAt: normalizeTermEnd(member.termEnd) ?? undefined,
      rawEnd: member.termEnd ?? undefined,
      rawStart: member.appointed ?? undefined,
      sourceUrl: draft.sourceUrl,
      snippet: member.snippet,
      current: true,
    });
  }
  const openSeats = (seatCount ?? 0) - ordinal;
  for (let i = 0; i < openSeats; i += 1) {
    ordinal += 1;
    await ctx.db.insert("seats", { bodyId, ordinal });
  }
  await ctx.db.patch(draftId, { status: "confirmed", confirmedBodyId: bodyId });
  return bodyId;
}

export const confirm = mutation({
  args: { draftId: v.id("drafts"), edits: v.optional(editsValidator) },
  handler: async (ctx, { draftId, edits }) => {
    const draft = await ctx.db.get(draftId);
    if (!draft) throw new ConvexError("That draft is gone");
    await requireCityWriter(ctx, draft.cityId);
    return confirmDraft(ctx, draftId, edits);
  },
});

export const dismiss = mutation({
  args: { draftId: v.id("drafts") },
  handler: async (ctx, { draftId }) => {
    const draft = await ctx.db.get(draftId);
    if (!draft) throw new ConvexError("That draft is gone");
    await requireCityWriter(ctx, draft.cityId);
    if (draft.status === "confirmed") throw new ConvexError("That draft is already confirmed");
    await ctx.db.patch(draftId, { status: "dismissed" });
    return null;
  },
});
