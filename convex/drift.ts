import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { publishedRosterFor } from "./extract";
import { canonicalName } from "./lib/draftTypes";
import { legistarRefFromUrl } from "./legistar";
import { diffRoster, type TrackedMember } from "./lib/driftDiff";
import { normalizeTermEnd } from "./lib/termDates";
import { driftStatusValidator } from "./schema";
import { requireClerk } from "./users";
import { workflow } from "./workflow";

const publishedValidator = v.object({ name: v.string(), termEnd: v.union(v.string(), v.null()), snippet: v.string() });

export async function trackedForBody(ctx: QueryCtx, bodyId: Id<"bodies">): Promise<TrackedMember[]> {
  const seats = await ctx.db
    .query("seats")
    .withIndex("by_body", (q) => q.eq("bodyId", bodyId))
    .collect();
  const tracked: TrackedMember[] = [];
  for (const seat of seats) {
    const terms = await ctx.db
      .query("terms")
      .withIndex("by_seat", (q) => q.eq("seatId", seat._id))
      .collect();
    const term = terms.find((row) => row.current);
    if (!term) continue;
    const member = await ctx.db.get(term.memberId);
    if (!member) continue;
    tracked.push({
      seatId: seat._id,
      name: member.name,
      endsAt: term.endsAt ?? null,
      rawEnd: term.rawEnd ?? null,
    });
  }
  return tracked;
}

export const confirmedSources = internalQuery({
  args: { cityId: v.id("cities") },
  handler: async (ctx, { cityId }): Promise<string[]> => {
    const bodies = await ctx.db
      .query("bodies")
      .withIndex("by_city", (q) => q.eq("cityId", cityId))
      .collect();
    const urls = new Set<string>();
    for (const body of bodies) if (body.confirmed) urls.add(body.sourceUrl);
    return [...urls];
  },
});

export const bodiesForSource = internalQuery({
  args: { cityId: v.id("cities"), sourceUrl: v.string() },
  handler: async (ctx, { cityId, sourceUrl }): Promise<Array<{ bodyId: Id<"bodies">; name: string }>> => {
    const bodies = await ctx.db
      .query("bodies")
      .withIndex("by_city", (q) => q.eq("cityId", cityId))
      .collect();
    return bodies.filter((body) => body.confirmed && body.sourceUrl === sourceUrl).map((body) => ({ bodyId: body._id, name: body.name }));
  },
});

export const recordDiff = internalMutation({
  args: {
    cityId: v.id("cities"),
    crawlRunId: v.id("crawlRuns"),
    bodyId: v.id("bodies"),
    sourceUrl: v.string(),
    published: v.array(publishedValidator),
  },
  handler: async (ctx, { cityId, crawlRunId, bodyId, sourceUrl, published }) => {
    const differences = diffRoster(published, await trackedForBody(ctx, bodyId));
    const open = await ctx.db
      .query("driftFlags")
      .withIndex("by_city_status", (q) => q.eq("cityId", cityId).eq("status", "open"))
      .collect();
    const seen = new Set(
      open
        .filter((flag) => flag.bodyId === bodyId)
        .map((flag) => flagKey(flag.seatId ?? null, flag.field, flag.published)),
    );
    let opened = 0;
    for (const difference of differences) {
      const key = flagKey(difference.seatId, difference.field, difference.published);
      if (seen.has(key)) continue;
      seen.add(key);
      await ctx.db.insert("driftFlags", {
        cityId,
        crawlRunId,
        bodyId,
        seatId: (difference.seatId as Id<"seats"> | null) ?? undefined,
        field: difference.field,
        published: difference.published,
        tracked: difference.tracked,
        sourceUrl,
        snippet: difference.snippet === "" ? undefined : difference.snippet,
        status: "open",
      });
      opened += 1;
    }
    return { opened, differences: differences.length };
  },
});

function flagKey(seatId: string | null, field: string, published: string): string {
  return field === "member_added" ? `${field}|${published}` : `${field}|${seatId ?? ""}`;
}

export const refreshSource = internalAction({
  args: { cityId: v.id("cities"), crawlRunId: v.id("crawlRuns"), sourceUrl: v.string() },
  handler: async (ctx, { cityId, crawlRunId, sourceUrl }): Promise<number> => {
    const bodies = await ctx.runQuery(internal.drift.bodiesForSource, { cityId, sourceUrl });
    if (bodies.length === 0) return 0;
    try {
      const published = await publishedRosterFor(ctx, sourceUrl);
      let opened = 0;
      for (const body of bodies) {
        const sole = legistarRefFromUrl(sourceUrl) !== null && published.size === 1 ? [...published.values()][0] : null;
        const rows = published.get(canonicalName(body.name)) ?? sole;
        if (rows === undefined || rows === null) continue;
        const result = await ctx.runMutation(internal.drift.recordDiff, {
          cityId,
          crawlRunId,
          bodyId: body.bodyId,
          sourceUrl,
          published: rows,
        });
        opened += result.opened;
      }
      await ctx.runMutation(internal.crawl.setRunStatus, {
        crawlRunId,
        message: `${sourceUrl}: ${opened} new flags`,
      });
      return opened;
    } catch (error) {
      await ctx.runMutation(internal.crawl.setRunStatus, {
        crawlRunId,
        message: `${sourceUrl}: ${error instanceof Error ? error.message : String(error)}`,
      });
      return 0;
    }
  },
});

export const driftWorkflow = workflow.define({
  args: { cityId: v.id("cities"), crawlRunId: v.id("crawlRuns") },
  handler: async (step, { cityId, crawlRunId }): Promise<void> => {
    try {
      await step.runMutation(internal.crawl.setRunStatus, {
        crawlRunId,
        status: "fetching",
        message: "Re-reading the confirmed source pages",
      });
      const sources = await step.runQuery(internal.drift.confirmedSources, { cityId });
      await step.runMutation(internal.crawl.setRunStatus, {
        crawlRunId,
        status: "extracting",
        message: `${sources.length} source pages to compare`,
      });
      await Promise.all(sources.map((sourceUrl) => step.runAction(internal.drift.refreshSource, { cityId, crawlRunId, sourceUrl })));
      await step.runMutation(internal.crawl.finishRun, { crawlRunId });
    } catch (error) {
      await step.runMutation(internal.crawl.failRun, {
        crawlRunId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
});

export async function createDriftRun(ctx: MutationCtx, cityId: Id<"cities">, now: number): Promise<Id<"crawlRuns">> {
  const city = await ctx.db.get(cityId);
  if (!city) throw new Error("That city is gone");
  return ctx.db.insert("crawlRuns", {
    cityId,
    purpose: "drift",
    source: "firecrawl",
    status: "queued",
    startedAt: now,
    pageCount: 0,
    documentCount: 0,
    draftCount: 0,
    log: [{ at: now, message: `Queued a drift check of ${city.name}` }],
  });
}

export const runNow = mutation({
  args: { cityId: v.id("cities") },
  handler: async (ctx, { cityId }): Promise<Id<"crawlRuns">> => {
    await requireClerk(ctx);
    const crawlRunId = await createDriftRun(ctx, cityId, Date.now());
    const workflowId = await workflow.start(
      ctx,
      internal.drift.driftWorkflow,
      { cityId, crawlRunId },
      { onComplete: internal.bootstrap.onRunComplete, context: { crawlRunId } },
    );
    await ctx.db.patch(crawlRunId, { workflowId });
    return crawlRunId;
  },
});

export const list = query({
  args: { cityId: v.id("cities"), status: v.optional(driftStatusValidator) },
  handler: async (ctx, { cityId, status }) => {
    const flags = await ctx.db
      .query("driftFlags")
      .withIndex("by_city_status", (q) => q.eq("cityId", cityId).eq("status", status ?? "open"))
      .collect();
    const rows = [];
    for (const flag of flags) {
      const body = flag.bodyId ? await ctx.db.get(flag.bodyId) : null;
      const seat = flag.seatId ? await ctx.db.get(flag.seatId) : null;
      let memberName: string | null = null;
      if (seat) {
        const terms = await ctx.db
          .query("terms")
          .withIndex("by_seat", (q) => q.eq("seatId", seat._id))
          .collect();
        const term = terms.find((row) => row.current) ?? terms[0];
        const member = term ? await ctx.db.get(term.memberId) : null;
        memberName = member?.name ?? null;
      }
      rows.push({ ...flag, bodyName: body?.name ?? null, memberName });
    }
    return rows.sort((a, b) => b._creationTime - a._creationTime);
  },
});

export async function resolveFlag(
  ctx: MutationCtx,
  flagId: Id<"driftFlags">,
  action: "accept_published" | "keep_tracked",
): Promise<null> {
  const flag = await ctx.db.get(flagId);
  if (!flag) throw new Error("That flag is gone");
  if (flag.status === "resolved") throw new Error("That flag is already resolved");
  if (action === "accept_published" && flag.seatId) {
    const terms = await ctx.db
      .query("terms")
      .withIndex("by_seat", (q) => q.eq("seatId", flag.seatId!))
      .collect();
    const term = terms.find((row) => row.current);
    if (term && flag.field === "term_end") {
      await ctx.db.patch(term._id, { rawEnd: flag.published, endsAt: normalizeTermEnd(flag.published) ?? undefined });
    }
    if (term && flag.field === "member_missing") {
      await ctx.db.patch(term._id, { current: false });
    }
  }
  await ctx.db.patch(flagId, { status: "resolved", resolvedAt: Date.now() });
  return null;
}

export const resolve = mutation({
  args: { flagId: v.id("driftFlags"), action: v.union(v.literal("accept_published"), v.literal("keep_tracked")) },
  handler: async (ctx, { flagId, action }) => {
    await requireClerk(ctx);
    return resolveFlag(ctx, flagId, action);
  },
});
