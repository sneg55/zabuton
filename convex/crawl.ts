import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { firecrawl } from "./firecrawl";
import {
  CANDIDATE_URL_CAP,
  FIRECRAWL_FALLBACK_CAP,
  SCRAPED_CONTENT_TYPE,
  filterCandidateUrls,
  legistarClientGuesses,
  previewOf,
  titleFromUrl,
} from "./lib/discover";
import type { DraftInput } from "./lib/draftTypes";
import { fetchWithBrowserUa } from "./lib/httpFetch";
import {
  bodyToDraft,
  fetchOfficeRecords,
  officeRecordsUrl,
  oneYearAgoIso,
  probeLegistarClient,
  selectBodies,
} from "./legistar";
import { cityNameFromTitle, titleOfHtml } from "./lib/cityName";
import { crawlSourceValidator, crawlStatusValidator } from "./schema";

export const LEGISTAR_BODY_CAP = 60;

export const setRunStatus = internalMutation({
  args: {
    crawlRunId: v.id("crawlRuns"),
    status: v.optional(crawlStatusValidator),
    source: v.optional(crawlSourceValidator),
    message: v.optional(v.string()),
  },
  handler: async (ctx, { crawlRunId, status, source, message }) => {
    const run = await ctx.db.get(crawlRunId);
    if (!run) return null;
    await ctx.db.patch(crawlRunId, {
      ...(status === undefined ? {} : { status }),
      ...(source === undefined ? {} : { source }),
      ...(message === undefined ? {} : { log: [...run.log, { at: Date.now(), message }] }),
    });
    return null;
  },
});

export const finishRun = internalMutation({
  args: { crawlRunId: v.id("crawlRuns") },
  handler: async (ctx, { crawlRunId }) => {
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_run", (q) => q.eq("crawlRunId", crawlRunId))
      .collect();
    const drafts = await ctx.db
      .query("drafts")
      .withIndex("by_run", (q) => q.eq("crawlRunId", crawlRunId))
      .collect();
    const run = await ctx.db.get(crawlRunId);
    if (!run) return null;
    const flags = await ctx.db
      .query("driftFlags")
      .withIndex("by_city", (q) => q.eq("cityId", run.cityId))
      .filter((q) => q.eq(q.field("crawlRunId"), crawlRunId))
      .collect();
    const message =
      run.purpose === "drift"
        ? flags.length === 0
          ? "The tracked roster matches the city site"
          : `${flags.length} differences found between the city site and the tracked roster`
        : drafts.length === 0
          ? "No roster could be read from this site. Import a CSV instead."
          : `${drafts.length} draft bodies ready for review`;
    await ctx.db.patch(crawlRunId, {
      status: run.purpose === "drift" || drafts.length === 0 ? "done" : "review",
      finishedAt: Date.now(),
      documentCount: documents.length,
      pageCount: documents.filter((d) => d.fetchedAt !== undefined).length,
      draftCount: drafts.length,
      log: [...run.log, { at: Date.now(), message }],
    });
    return null;
  },
});

export const failRun = internalMutation({
  args: { crawlRunId: v.id("crawlRuns"), error: v.string() },
  handler: async (ctx, { crawlRunId, error }) => {
    const run = await ctx.db.get(crawlRunId);
    if (!run) return null;
    await ctx.db.patch(crawlRunId, {
      status: "failed",
      error,
      finishedAt: Date.now(),
      log: [...run.log, { at: Date.now(), message: error }],
    });
    return null;
  },
});

export const runDocuments = internalQuery({
  args: { crawlRunId: v.id("crawlRuns") },
  handler: async (ctx, { crawlRunId }): Promise<Array<{ documentId: Id<"documents">; fetched: boolean }>> => {
    const documents: Doc<"documents">[] = await ctx.db
      .query("documents")
      .withIndex("by_run", (q) => q.eq("crawlRunId", crawlRunId))
      .collect();
    return documents.map((document) => ({ documentId: document._id, fetched: document.storageId !== undefined }));
  },
});

export const setCityName = internalMutation({
  args: { cityId: v.id("cities"), name: v.string() },
  handler: async (ctx, { cityId, name }) => {
    const city = await ctx.db.get(cityId);
    if (!city) return null;
    const autoName = city.name === city.slug.split("-").map((l) => (l.length === 2 ? l.toUpperCase() : l.charAt(0).toUpperCase() + l.slice(1))).join(", ");
    if (autoName) await ctx.db.patch(cityId, { name });
    return null;
  },
});

export const recordCandidates = internalMutation({
  args: {
    cityId: v.id("cities"),
    crawlRunId: v.id("crawlRuns"),
    candidates: v.array(v.object({ url: v.string(), title: v.optional(v.string()) })),
  },
  handler: async (ctx, { cityId, crawlRunId, candidates }) => {
    for (const candidate of candidates) {
      await ctx.db.insert("documents", {
        cityId,
        crawlRunId,
        url: candidate.url,
        title: candidate.title ?? titleFromUrl(candidate.url),
        kind: "unclassified",
      });
    }
    return null;
  },
});

export const claimScrape = internalMutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const document = await ctx.db.get(documentId);
    if (!document) return false;
    const siblings = await ctx.db
      .query("documents")
      .withIndex("by_run", (q) => q.eq("crawlRunId", document.crawlRunId))
      .collect();
    const spent = siblings.filter((row) => row.contentType === SCRAPED_CONTENT_TYPE).length;
    if (spent >= FIRECRAWL_FALLBACK_CAP) return false;
    await ctx.db.patch(documentId, { contentType: SCRAPED_CONTENT_TYPE });
    return true;
  },
});

export const storeFetched = internalMutation({
  args: {
    documentId: v.id("documents"),
    storageId: v.id("_storage"),
    contentType: v.string(),
    textPreview: v.optional(v.string()),
  },
  handler: async (ctx, { documentId, storageId, contentType, textPreview }) => {
    await ctx.db.patch(documentId, { storageId, contentType, textPreview, fetchedAt: Date.now(), error: undefined });
    return null;
  },
});

export const recordFetchError = internalMutation({
  args: { documentId: v.id("documents"), error: v.string() },
  handler: async (ctx, { documentId, error }) => {
    await ctx.db.patch(documentId, { error });
    return null;
  },
});

export const discover = internalAction({
  args: {
    cityId: v.id("cities"),
    crawlRunId: v.id("crawlRuns"),
    websiteUrl: v.string(),
    domain: v.string(),
  },
  handler: async (ctx, { cityId, crawlRunId, websiteUrl, domain }): Promise<{ source: "legistar" | "firecrawl"; candidates: number }> => {
    try {
      const home = await fetchWithBrowserUa(websiteUrl);
      const name = cityNameFromTitle(titleOfHtml(new TextDecoder().decode(home.bytes)));
      if (name) await ctx.runMutation(internal.crawl.setCityName, { cityId, name });
    } catch {
      await ctx.runMutation(internal.crawl.setRunStatus, { crawlRunId, message: `${domain} did not answer a plain request; the site may block automated visitors` });
    }
    const legistar = await probeLegistarClient(legistarClientGuesses(domain));
    if (legistar) {
      const matched = selectBodies(legistar.bodies);
      const bodies = matched.slice(0, LEGISTAR_BODY_CAP);
      const capped = matched.length > bodies.length ? `, reading the first ${bodies.length}` : "";
      await ctx.runMutation(internal.crawl.setRunStatus, {
        crawlRunId,
        source: "legistar",
        message: `Legistar client ${legistar.client}: ${matched.length} active bodies${capped}`,
      });
      const sinceIso = oneYearAgoIso(Date.now());
      const drafts: DraftInput[] = [];
      for (const body of bodies) {
        try {
          const records = await fetchOfficeRecords(legistar.client, body.BodyId, sinceIso);
          const draft = bodyToDraft(body, records, officeRecordsUrl(legistar.client, body.BodyId, sinceIso));
          if (draft) drafts.push(draft);
        } catch (error) {
          await ctx.runMutation(internal.crawl.setRunStatus, {
            crawlRunId,
            message: `${body.BodyName}: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
      if (drafts.length > 0) {
        await ctx.runMutation(internal.drafts.recordExtraction, { cityId, crawlRunId, drafts });
      }
      await ctx.runMutation(internal.crawl.setRunStatus, {
        crawlRunId,
        message:
          drafts.length > 0
            ? `${drafts.length} bodies with serving members read from Legistar`
            : "Legistar lists the bodies but no serving members; reading the website instead",
      });
      if (drafts.length > 0) return { source: "legistar", candidates: 0 };
      await ctx.runMutation(internal.crawl.setRunStatus, { crawlRunId, source: "firecrawl" });
    }
    const mapped = await firecrawl.map(ctx, websiteUrl, { search: "boards commissions committees" });
    const candidates = filterCandidateUrls(mapped.links ?? [], CANDIDATE_URL_CAP);
    await ctx.runMutation(internal.crawl.recordCandidates, { cityId, crawlRunId, candidates });
    await ctx.runMutation(internal.crawl.setRunStatus, {
      crawlRunId,
      message: `${candidates.length} candidate pages and documents found on ${domain}`,
    });
    return { source: "firecrawl", candidates: candidates.length };
  },
});

export const fetchDocument = internalAction({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }): Promise<boolean> => {
    const document = await ctx.runQuery(internal.extract.documentFor, { documentId });
    if (!document) return false;
    try {
      const fetched = await fetchWithBrowserUa(document.url);
      const storageId = await ctx.storage.store(new Blob([fetched.bytes], { type: fetched.contentType }));
      await ctx.runMutation(internal.crawl.storeFetched, {
        documentId,
        storageId,
        contentType: fetched.contentType,
        textPreview: fetched.textPreview ?? undefined,
      });
      return true;
    } catch (error) {
      const plain = error instanceof Error ? error.message : String(error);
      const allowed = await ctx.runMutation(internal.crawl.claimScrape, { documentId });
      if (!allowed) {
        await ctx.runMutation(internal.crawl.recordFetchError, {
          documentId,
          error: `${plain}, and this run has spent its Firecrawl fallbacks`,
        });
        return false;
      }
      try {
        const scraped = await firecrawl.scrape(ctx, document.url, { formats: ["markdown"] });
        const markdown = scraped.markdown ?? "";
        if (markdown === "") throw new ConvexError("Firecrawl returned no markdown");
        const storageId = await ctx.storage.store(new Blob([markdown], { type: SCRAPED_CONTENT_TYPE }));
        await ctx.runMutation(internal.crawl.storeFetched, {
          documentId,
          storageId,
          contentType: SCRAPED_CONTENT_TYPE,
          textPreview: previewOf(markdown),
        });
        return true;
      } catch (scrapeError) {
        await ctx.runMutation(internal.crawl.recordFetchError, {
          documentId,
          error: `${plain}, and Firecrawl: ${scrapeError instanceof Error ? scrapeError.message : String(scrapeError)}`,
        });
        return false;
      }
    }
  },
});
