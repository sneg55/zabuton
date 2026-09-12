import { vResultValidator, vWorkflowId } from "@convex-dev/workflow";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { insertDrafts } from "./drafts";
import { csvToDrafts } from "./lib/csv";
import { BOOTSTRAP_RUN_CAP, CITY_RUN_CAP, IN_PROGRESS_STATUSES, normalizeCityUrl, overRunCap } from "./lib/discover";
import { requireClerk } from "./users";
import { workflow } from "./workflow";

export type StartedRun = { cityId: Id<"cities">; crawlRunId: Id<"crawlRuns">; websiteUrl: string; domain: string };

export async function ensureCity(ctx: MutationCtx, url: string): Promise<Doc<"cities">> {
  const ref = normalizeCityUrl(url);
  const existing = await ctx.db
    .query("cities")
    .withIndex("by_domain", (q) => q.eq("domain", ref.domain))
    .unique();
  if (existing) return existing;
  const clash = await ctx.db
    .query("cities")
    .withIndex("by_slug", (q) => q.eq("slug", ref.slug))
    .unique();
  const slug = clash ? `${ref.slug}-${ref.domain.split(".").pop()}` : ref.slug;
  const cityId = await ctx.db.insert("cities", {
    name: ref.name,
    domain: ref.domain,
    slug,
    websiteUrl: ref.websiteUrl,
    status: "draft",
  });
  return (await ctx.db.get(cityId))!;
}

export async function createBootstrapRun(ctx: MutationCtx, url: string, now: number): Promise<StartedRun> {
  const bootstrapRuns = await ctx.db
    .query("crawlRuns")
    .filter((q) => q.eq(q.field("purpose"), "bootstrap"))
    .collect();
  if (overRunCap(bootstrapRuns.map((run) => run.startedAt), now)) {
    throw new ConvexError(`Zabuton has started ${BOOTSTRAP_RUN_CAP} crawls in the last 24 hours. Try again later.`);
  }
  const city = await ensureCity(ctx, url);
  const cityRuns = await ctx.db
    .query("crawlRuns")
    .withIndex("by_city", (q) => q.eq("cityId", city._id))
    .collect();
  const running = cityRuns.find((run) => IN_PROGRESS_STATUSES.includes(run.status as (typeof IN_PROGRESS_STATUSES)[number]));
  if (running) throw new ConvexError(`A crawl of ${city.name} is already running`);
  const cityBootstraps = cityRuns.filter((run) => run.purpose === "bootstrap").map((run) => run.startedAt);
  if (overRunCap(cityBootstraps, now, CITY_RUN_CAP)) {
    throw new ConvexError(`${city.name} has been crawled ${CITY_RUN_CAP} times in the last 24 hours. Try again tomorrow, or import a spreadsheet from the clerk desk.`);
  }
  const crawlRunId = await ctx.db.insert("crawlRuns", {
    cityId: city._id,
    purpose: "bootstrap",
    source: "firecrawl",
    status: "queued",
    startedAt: now,
    pageCount: 0,
    documentCount: 0,
    draftCount: 0,
    log: [{ at: now, message: `Queued a crawl of ${city.domain}` }],
  });
  return { cityId: city._id, crawlRunId, websiteUrl: city.websiteUrl, domain: city.domain };
}

export const bootstrapWorkflow = workflow.define({
  args: { cityId: v.id("cities"), crawlRunId: v.id("crawlRuns"), websiteUrl: v.string(), domain: v.string() },
  handler: async (step, args): Promise<void> => {
    const { cityId, crawlRunId, websiteUrl, domain } = args;
    try {
      await step.runMutation(internal.crawl.setRunStatus, {
        crawlRunId,
        status: "discovering",
        message: `Looking for boards and commissions on ${domain}`,
      });
      const discovered = await step.runAction(internal.crawl.discover, { cityId, crawlRunId, websiteUrl, domain });
      if (discovered.source === "firecrawl") {
        await step.runMutation(internal.crawl.setRunStatus, {
          crawlRunId,
          status: "fetching",
          message: `Fetching ${discovered.candidates} documents`,
        });
        const candidates = await step.runQuery(internal.crawl.runDocuments, { crawlRunId });
        const fetches = await Promise.allSettled(
          candidates.map((candidate) => step.runAction(internal.crawl.fetchDocument, { documentId: candidate.documentId })),
        );
        const fetchFailures = fetches.filter((result) => result.status === "rejected").length;
        if (fetchFailures > 0) {
          await step.runMutation(internal.crawl.setRunStatus, {
            crawlRunId,
            message: `${fetchFailures} documents could not be read and were skipped`,
          });
        }
        const fetched = await step.runQuery(internal.crawl.runDocuments, { crawlRunId });
        const readable = fetched.filter((document) => document.fetched);
        await step.runMutation(internal.crawl.setRunStatus, {
          crawlRunId,
          status: "extracting",
          message: `Classifying and extracting ${readable.length} documents`,
        });
        const extractions = await Promise.allSettled(
          readable.map((document) => step.runAction(internal.extract.processDocument, { documentId: document.documentId })),
        );
        const extractFailures = extractions.filter((result) => result.status === "rejected").length;
        if (extractFailures > 0) {
          await step.runMutation(internal.crawl.setRunStatus, {
            crawlRunId,
            message: `${extractFailures} documents could not be extracted and were skipped`,
          });
        }
      }
      await step.runMutation(internal.crawl.finishRun, { crawlRunId });
    } catch (error) {
      await step.runMutation(internal.crawl.failRun, {
        crawlRunId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
});

export const onRunComplete = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object({ crawlRunId: v.id("crawlRuns") }),
  },
  handler: async (ctx, { result, context }) => {
    if (result.kind === "success") return null;
    const run = await ctx.db.get(context.crawlRunId);
    if (!run || run.status === "failed" || run.status === "review" || run.status === "done") return null;
    const message = result.kind === "canceled" ? "The run was canceled" : result.error;
    await ctx.db.patch(context.crawlRunId, {
      status: "failed",
      error: message,
      finishedAt: Date.now(),
      log: [...run.log, { at: Date.now(), message }],
    });
    return null;
  },
});

export const start = mutation({
  args: { url: v.string() },
  handler: async (ctx, { url }): Promise<{ cityId: Id<"cities">; crawlRunId: Id<"crawlRuns"> }> => {
    const run = await createBootstrapRun(ctx, url, Date.now());
    const workflowId = await workflow.start(
      ctx,
      internal.bootstrap.bootstrapWorkflow,
      {
        cityId: run.cityId,
        crawlRunId: run.crawlRunId,
        websiteUrl: run.websiteUrl,
        domain: run.domain,
      },
      { onComplete: internal.bootstrap.onRunComplete, context: { crawlRunId: run.crawlRunId } },
    );
    await ctx.db.patch(run.crawlRunId, { workflowId });
    return { cityId: run.cityId, crawlRunId: run.crawlRunId };
  },
});

export const status = query({
  args: { crawlRunId: v.id("crawlRuns") },
  handler: async (ctx, { crawlRunId }) => {
    const run = await ctx.db.get(crawlRunId);
    if (!run) return null;
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_run", (q) => q.eq("crawlRunId", crawlRunId))
      .collect();
    const drafts = await ctx.db
      .query("drafts")
      .withIndex("by_run", (q) => q.eq("crawlRunId", crawlRunId))
      .collect();
    return { run, documents, drafts: drafts.length, city: await ctx.db.get(run.cityId) };
  },
});

export const latestRun = query({
  args: { cityId: v.id("cities"), purpose: v.union(v.literal("bootstrap"), v.literal("drift")) },
  handler: async (ctx, { cityId, purpose }) => {
    const runs = await ctx.db
      .query("crawlRuns")
      .withIndex("by_city_purpose", (q) => q.eq("cityId", cityId).eq("purpose", purpose))
      .collect();
    return runs.sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
  },
});

export const importCsv = mutation({
  args: { cityId: v.id("cities"), csv: v.string() },
  handler: async (ctx, { cityId, csv }) => {
    await requireClerk(ctx);
    const city = await ctx.db.get(cityId);
    if (!city) throw new ConvexError("That city is gone");
    const drafts = csvToDrafts(csv, city.websiteUrl);
    if (drafts.length === 0) throw new ConvexError("The CSV has no body rows");
    const now = Date.now();
    const crawlRunId = await ctx.db.insert("crawlRuns", {
      cityId,
      purpose: "bootstrap",
      source: "csv",
      status: "review",
      startedAt: now,
      finishedAt: now,
      pageCount: 0,
      documentCount: 0,
      draftCount: drafts.length,
      log: [{ at: now, message: `Imported ${drafts.length} bodies from a CSV` }],
    });
    const { draftCount } = await insertDrafts(ctx, { cityId, crawlRunId, drafts });
    await ctx.db.patch(crawlRunId, { draftCount });
    return { draftCount };
  },
});
