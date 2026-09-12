import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { insertDrafts } from "./drafts";
import { normalizeTermEnd } from "./lib/termDates";

const modules = import.meta.glob("./**/*.ts");
const now = Date.UTC(2026, 8, 11, 12, 0, 0);

type Harness = ReturnType<typeof convexTest>;

async function asClerk(t: Harness) {
  const userId = await t.run(async (ctx) => ctx.db.insert("users", { name: "Clerk", role: "clerk" as const }));
  return t.withIdentity({ subject: `${userId}|session` });
}

async function seedRun(t: Harness) {
  return t.run(async (ctx) => {
    const cityId = await ctx.db.insert("cities", {
      name: "Testville",
      domain: "testville.gov",
      slug: "testville",
      websiteUrl: "https://testville.gov",
      status: "draft" as const,
    });
    const crawlRunId = await ctx.db.insert("crawlRuns", {
      cityId,
      purpose: "bootstrap" as const,
      source: "firecrawl" as const,
      status: "review" as const,
      startedAt: now,
      pageCount: 0,
      documentCount: 0,
      draftCount: 0,
      log: [],
    });
    return { cityId, crawlRunId };
  });
}

const rosterDraft = (sourceUrl = "https://testville.gov/maddy.pdf") => ({
  name: "Planning Commission",
  meetingCadence: "2nd Tuesday",
  termLength: null,
  termLimit: null,
  seatCount: null,
  members: [
    { name: "Ada Lovelace", role: "Chair", appointed: "8/24", termEnd: "12/26", snippet: "Ada 12/26", confidence: "grounded" as const },
    { name: "Bo Diddley", role: null, appointed: null, termEnd: null, snippet: "Bo", confidence: "unknown" as const },
  ],
  snippet: "Planning Commission roster",
  sourceUrl,
});

describe("recordExtraction", () => {
  it("inserts one pending draft per body", async () => {
    const t = convexTest(schema, modules);
    const { cityId, crawlRunId } = await seedRun(t);
    const result = await t.mutation(internal.drafts.recordExtraction, { cityId, crawlRunId, drafts: [rosterDraft()] });
    expect(result).toEqual({ draftCount: 1, mergedCount: 0, trackedCount: 0 });
    const drafts = await t.query(api.drafts.list, { cityId });
    expect(drafts).toHaveLength(1);
    expect(drafts[0].members).toHaveLength(2);
  });

  it("folds a rules page draft into the roster draft of the same body in one run", async () => {
    const t = convexTest(schema, modules);
    const { cityId, crawlRunId } = await seedRun(t);
    await t.mutation(internal.drafts.recordExtraction, { cityId, crawlRunId, drafts: [rosterDraft()] });
    const second = await t.mutation(internal.drafts.recordExtraction, {
      cityId,
      crawlRunId,
      drafts: [
        {
          name: "planning commission",
          meetingCadence: null,
          termLength: "four years",
          termLimit: "two terms",
          seatCount: 7,
          members: [],
          snippet: "rules",
          sourceUrl: "https://testville.gov/rules",
        },
      ],
    });
    expect(second).toEqual({ draftCount: 0, mergedCount: 1, trackedCount: 0 });
    const drafts = await t.query(api.drafts.list, { cityId });
    expect(drafts).toHaveLength(1);
    expect(drafts[0].termLength).toBe("four years");
    expect(drafts[0].seatCount).toBe(7);
    expect(drafts[0].members).toHaveLength(2);
    expect(drafts[0].sourceUrl).toBe("https://testville.gov/maddy.pdf");
  });
});

describe("demo desk", () => {
  it("can read drafts but every write is refused with the read-only line", async () => {
    const t = convexTest(schema, modules);
    const cityId = await t.run(async (ctx) => ctx.db.insert("cities", { name: "Testville", domain: "testville.gov", slug: "testville", websiteUrl: "https://testville.gov", status: "confirmed" }));
    const crawlRunId = await t.run(async (ctx) => ctx.db.insert("crawlRuns", { cityId, purpose: "bootstrap", source: "csv", status: "review", startedAt: 0, pageCount: 0, documentCount: 0, draftCount: 0, log: [] }));
    const draftId = await t.run(async (ctx) => ctx.db.insert("drafts", { cityId, crawlRunId, name: "Library Board", meetingCadence: null, termLength: null, termLimit: null, seatCount: null, members: [], snippet: "", sourceUrl: "https://testville.gov/lib", status: "pending" }));
    const demoId = await t.run(async (ctx) => ctx.db.insert("users", { name: "Demo clerk", role: "demo", isAnonymous: true }));
    const demo = t.withIdentity({ subject: demoId });
    expect(await demo.query(api.drafts.list, { cityId })).toHaveLength(1);
    await expect(demo.mutation(api.drafts.dismiss, { draftId })).rejects.toThrow(/read-only/);
    await expect(demo.mutation(api.drafts.saveEdits, { draftId, edits: { name: "x" } })).rejects.toThrow(/read-only/);
  });

  it("can confirm drafts on a city it built itself", async () => {
    const t = convexTest(schema, modules);
    const demoId = await t.run(async (ctx) => ctx.db.insert("users", { name: "Demo clerk", role: "demo", isAnonymous: true }));
    const cityId = await t.run(async (ctx) => ctx.db.insert("cities", { name: "Mine", domain: "mine.gov", slug: "mine", websiteUrl: "https://mine.gov", status: "draft", createdBy: demoId }));
    const crawlRunId = await t.run(async (ctx) => ctx.db.insert("crawlRuns", { cityId, purpose: "bootstrap", source: "csv", status: "review", startedAt: 0, pageCount: 0, documentCount: 0, draftCount: 0, log: [] }));
    const draftId = await t.run(async (ctx) => ctx.db.insert("drafts", { cityId, crawlRunId, name: "Library Board", meetingCadence: null, termLength: null, termLimit: null, seatCount: null, members: [], snippet: "", sourceUrl: "https://mine.gov/lib", status: "pending" }));
    const demo = t.withIdentity({ subject: demoId });
    const bodyId = await demo.mutation(api.drafts.confirm, { draftId });
    expect(await t.run(async (ctx) => (await ctx.db.get(bodyId))?.name)).toBe("Library Board");
  });
});

describe("drafts.confirm", () => {
  async function pendingDraft(t: Harness) {
    const { cityId, crawlRunId } = await seedRun(t);
    await t.mutation(internal.drafts.recordExtraction, { cityId, crawlRunId, drafts: [{ ...rosterDraft(), seatCount: 3 }] });
    const drafts = await t.query(api.drafts.list, { cityId });
    return { cityId, draftId: drafts[0]._id as Id<"drafts"> };
  }

  it("turns a draft into a confirmed body with a seat, member and term each", async () => {
    const t = convexTest(schema, modules);
    const { cityId, draftId } = await pendingDraft(t);
    const clerk = await asClerk(t);
    const bodyId = await clerk.mutation(api.drafts.confirm, { draftId });
    const board = await t.query(api.roster.board, { bodyId, now });
    expect(board?.body.confirmed).toBe(true);
    expect(board?.body.sourceUrl).toBe("https://testville.gov/maddy.pdf");
    expect(board?.seats.map((row) => row.member?.name ?? null)).toEqual(["Ada Lovelace", "Bo Diddley", null]);
    expect(board?.seats[0].seat.label).toBe("Chair");
    expect(board?.seats[0].term?.endsAt).toBe(normalizeTermEnd("12/26"));
    expect(board?.seats[0].term?.rawEnd).toBe("12/26");
    expect(board?.seats[0].term?.rawStart).toBe("8/24");
    expect(board?.seats[0].term?.current).toBe(true);
    expect(board?.seats[1].term?.endsAt).toBeUndefined();
    expect(board?.seats[2].status).toBe("unlisted");
    const pending = await t.query(api.drafts.list, { cityId });
    expect(pending).toHaveLength(0);
  });

  it("applies the clerk's edits over the extracted values", async () => {
    const t = convexTest(schema, modules);
    const { draftId } = await pendingDraft(t);
    const clerk = await asClerk(t);
    const bodyId = await clerk.mutation(api.drafts.confirm, {
      draftId,
      edits: {
        name: "Planning Commission (renamed)",
        termLength: "four years",
        seatCount: null,
        members: [{ name: "Cy Young", role: null, appointed: null, termEnd: "6/30/2030", snippet: "Cy", confidence: "grounded" }],
      },
    });
    const board = await t.query(api.roster.board, { bodyId, now });
    expect(board?.body.name).toBe("Planning Commission (renamed)");
    expect(board?.body.termLength).toBe("four years");
    expect(board?.seats).toHaveLength(1);
    expect(board?.seats[0].member?.name).toBe("Cy Young");
  });

  it("refuses a second confirm of the same draft", async () => {
    const t = convexTest(schema, modules);
    const { draftId } = await pendingDraft(t);
    const clerk = await asClerk(t);
    await clerk.mutation(api.drafts.confirm, { draftId });
    await expect(clerk.mutation(api.drafts.confirm, { draftId })).rejects.toThrow(/already confirmed/);
  });

  it("refuses anyone who is not a clerk", async () => {
    const t = convexTest(schema, modules);
    const { draftId } = await pendingDraft(t);
    await expect(t.mutation(api.drafts.confirm, { draftId })).rejects.toThrow(/Sign in/);
  });
});

describe("drafts.dismiss", () => {
  it("moves a draft out of the pending list", async () => {
    const t = convexTest(schema, modules);
    const { cityId, crawlRunId } = await seedRun(t);
    await t.mutation(internal.drafts.recordExtraction, { cityId, crawlRunId, drafts: [rosterDraft()] });
    const [draft] = await t.query(api.drafts.list, { cityId });
    const clerk = await asClerk(t);
    await clerk.mutation(api.drafts.dismiss, { draftId: draft._id });
    expect(await t.query(api.drafts.list, { cityId })).toHaveLength(0);
    expect(await t.query(api.drafts.list, { cityId, status: "dismissed" })).toHaveLength(1);
  });
});

describe("insertDrafts against tracked bodies", () => {
  it("skips drafts whose name matches a body the city already tracks", async () => {
    const t = convexTest(schema, modules);
    const { cityId, crawlRunId } = await t.run(async (ctx) => {
      const cityId = await ctx.db.insert("cities", { name: "Testville", domain: "testville.gov", slug: "testville", websiteUrl: "https://testville.gov", status: "confirmed" });
      await ctx.db.insert("bodies", { cityId, name: "Planning & Zoning Commission", sourceUrl: "https://testville.gov/pz", confirmed: true });
      const crawlRunId = await ctx.db.insert("crawlRuns", { cityId, purpose: "bootstrap", source: "firecrawl", status: "extracting", startedAt: 1, pageCount: 0, documentCount: 0, draftCount: 0, log: [] });
      return { cityId, crawlRunId };
    });
    const result = await t.run(async (ctx) =>
      insertDrafts(ctx, {
        cityId,
        crawlRunId,
        drafts: [
          { name: "Planning and Zoning Commission", meetingCadence: null, termLength: null, termLimit: null, seatCount: null, members: [], snippet: "", sourceUrl: "https://testville.gov/pz" },
          { name: "Library Board", meetingCadence: null, termLength: null, termLimit: null, seatCount: null, members: [], snippet: "", sourceUrl: "https://testville.gov/lib" },
        ],
      }),
    );
    expect(result).toEqual({ draftCount: 1, mergedCount: 0, trackedCount: 1 });
    const run = await t.run(async (ctx) => ctx.db.get(crawlRunId));
    expect(run?.log.at(-1)?.message).toBe("1 bodies already tracked for this city, skipped");
  });
});
