import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { normalizeTermEnd } from "./lib/termDates";

const modules = import.meta.glob("./**/*.ts");
const now = Date.UTC(2026, 8, 11, 12, 0, 0);

type Harness = ReturnType<typeof convexTest>;

const SOURCE = "https://testville.gov/maddy.pdf";

async function asClerk(t: Harness) {
  const userId = await t.run(async (ctx) => ctx.db.insert("users", { name: "Clerk", role: "clerk" as const }));
  return t.withIdentity({ subject: `${userId}|session` });
}

async function seedConfirmedBody(t: Harness) {
  return t.run(async (ctx) => {
    const cityId = await ctx.db.insert("cities", {
      name: "Testville",
      domain: "testville.gov",
      slug: "testville",
      websiteUrl: "https://testville.gov",
      status: "confirmed" as const,
    });
    const crawlRunId = await ctx.db.insert("crawlRuns", {
      cityId,
      purpose: "drift" as const,
      source: "firecrawl" as const,
      status: "extracting" as const,
      startedAt: now,
      pageCount: 0,
      documentCount: 0,
      draftCount: 0,
      log: [],
    });
    const bodyId = await ctx.db.insert("bodies", {
      cityId,
      name: "Planning Commission",
      sourceUrl: SOURCE,
      confirmed: true,
    });
    const seats: Id<"seats">[] = [];
    for (const [ordinal, name] of [
      [1, "Ada Lovelace"],
      [2, "Bo Diddley"],
    ] as Array<[number, string]>) {
      const seatId = await ctx.db.insert("seats", { bodyId, ordinal });
      const memberId = await ctx.db.insert("members", { cityId, name });
      await ctx.db.insert("terms", {
        seatId,
        memberId,
        endsAt: normalizeTermEnd("12/26") ?? undefined,
        rawEnd: "12/26",
        sourceUrl: SOURCE,
        snippet: `${name} 12/26`,
        current: true,
      });
      seats.push(seatId);
    }
    return { cityId, crawlRunId, bodyId, seats };
  });
}

const published = (rows: Array<[string, string | null]>) =>
  rows.map(([name, termEnd]) => ({ name, termEnd, snippet: `${name} ${termEnd ?? ""}`.trim() }));

describe("drift.recordDiff", () => {
  it("opens no flag when the page matches the tracked roster", async () => {
    const t = convexTest(schema, modules);
    const { cityId, crawlRunId, bodyId } = await seedConfirmedBody(t);
    const result = await t.mutation(internal.drift.recordDiff, {
      cityId,
      crawlRunId,
      bodyId,
      sourceUrl: SOURCE,
      published: published([
        ["Ada Lovelace", "12/26"],
        ["Bo Diddley", "12/26"],
      ]),
    });
    expect(result).toEqual({ opened: 0, differences: 0 });
    expect(await t.query(api.drift.list, { cityId })).toEqual([]);
  });

  it("flags an added member, a missing member and a changed term end with both sides", async () => {
    const t = convexTest(schema, modules);
    const { cityId, crawlRunId, bodyId } = await seedConfirmedBody(t);
    await t.mutation(internal.drift.recordDiff, {
      cityId,
      crawlRunId,
      bodyId,
      sourceUrl: SOURCE,
      published: published([
        ["Ada Lovelace", "12/28"],
        ["Cy Young", "12/30"],
      ]),
    });
    const rows = await t.query(api.drift.list, { cityId });
    const byField = Object.fromEntries(rows.map((row) => [row.flag.field, row]));
    expect(Object.keys(byField).sort()).toEqual(["member_added", "member_missing", "term_end"]);
    expect(byField.term_end.flag).toMatchObject({ published: "12/28", tracked: "12/26", sourceUrl: SOURCE });
    expect(byField.term_end.bodyName).toBe("Planning Commission");
    expect(byField.term_end.memberName).toBe("Ada Lovelace");
    expect(byField.member_added.flag.published).toContain("Cy Young");
    expect(byField.member_missing.flag.tracked).toContain("Bo Diddley");
    expect(byField.member_missing.memberName).toBe("Bo Diddley");
  });

  it("does not open a duplicate flag on the next run", async () => {
    const t = convexTest(schema, modules);
    const { cityId, crawlRunId, bodyId } = await seedConfirmedBody(t);
    const args = {
      cityId,
      crawlRunId,
      bodyId,
      sourceUrl: SOURCE,
      published: published([
        ["Ada Lovelace", "12/28"],
        ["Cy Young", "12/30"],
      ]),
    };
    await t.mutation(internal.drift.recordDiff, args);
    expect((await t.mutation(internal.drift.recordDiff, args)).opened).toBe(0);
    expect(await t.query(api.drift.list, { cityId })).toHaveLength(3);
  });

  it("still flags a second new member, since added members carry no seat", async () => {
    const t = convexTest(schema, modules);
    const { cityId, crawlRunId, bodyId } = await seedConfirmedBody(t);
    const base = [
      ["Ada Lovelace", "12/26"],
      ["Bo Diddley", "12/26"],
    ] as Array<[string, string | null]>;
    await t.mutation(internal.drift.recordDiff, {
      cityId,
      crawlRunId,
      bodyId,
      sourceUrl: SOURCE,
      published: published([...base, ["Cy Young", "12/30"]]),
    });
    await t.mutation(internal.drift.recordDiff, {
      cityId,
      crawlRunId,
      bodyId,
      sourceUrl: SOURCE,
      published: published([...base, ["Cy Young", "12/30"], ["Dot Matrix", "12/30"]]),
    });
    const added = (await t.query(api.drift.list, { cityId })).filter((row) => row.flag.field === "member_added");
    expect(added).toHaveLength(2);
  });

  it("compares against the tracked endsAt after a clerk edited the term", async () => {
    const t = convexTest(schema, modules);
    const { cityId, crawlRunId, bodyId } = await seedConfirmedBody(t);
    await t.mutation(internal.dev.setTermEnd, {
      bodyName: "Planning Commission",
      ordinal: 1,
      endsAt: normalizeTermEnd("12/29"),
    });
    await t.mutation(internal.drift.recordDiff, {
      cityId,
      crawlRunId,
      bodyId,
      sourceUrl: SOURCE,
      published: published([
        ["Ada Lovelace", "12/26"],
        ["Bo Diddley", "12/26"],
      ]),
    });
    const rows = await t.query(api.drift.list, { cityId });
    expect(rows).toHaveLength(1);
    expect(rows[0].flag).toMatchObject({ field: "term_end", published: "12/26", tracked: "2029-12-31" });
  });
});

describe("drift.resolve", () => {
  async function flaggedCity(t: Harness) {
    const seeded = await seedConfirmedBody(t);
    await t.mutation(internal.drift.recordDiff, {
      cityId: seeded.cityId,
      crawlRunId: seeded.crawlRunId,
      bodyId: seeded.bodyId,
      sourceUrl: SOURCE,
      published: published([["Ada Lovelace", "12/28"]]),
    });
    const rows = await t.query(api.drift.list, { cityId: seeded.cityId });
    return { ...seeded, rows };
  }

  it("accept_published writes the page's term end onto the tracked term", async () => {
    const t = convexTest(schema, modules);
    const { cityId, bodyId, rows } = await flaggedCity(t);
    const clerk = await asClerk(t);
    const flag = rows.find((row) => row.flag.field === "term_end")!.flag;
    await clerk.mutation(api.drift.resolve, { flagId: flag._id, action: "accept_published" });
    const board = await t.query(api.roster.board, { bodyId, now });
    expect(board?.seats[0].term?.rawEnd).toBe("12/28");
    expect(board?.seats[0].term?.endsAt).toBe(normalizeTermEnd("12/28"));
    expect(await t.query(api.drift.list, { cityId })).toHaveLength(1);
    expect(await t.query(api.drift.list, { cityId, status: "resolved" })).toHaveLength(1);
  });

  it("accept_published on a missing member ends that term", async () => {
    const t = convexTest(schema, modules);
    const { bodyId, rows } = await flaggedCity(t);
    const clerk = await asClerk(t);
    const flag = rows.find((row) => row.flag.field === "member_missing")!.flag;
    await clerk.mutation(api.drift.resolve, { flagId: flag._id, action: "accept_published" });
    const board = await t.query(api.roster.board, { bodyId, now });
    expect(board?.seats[1].term).toBeNull();
    expect(board?.seats[1].status).toBe("vacant");
  });

  it("keep_tracked closes the flag and leaves the term alone", async () => {
    const t = convexTest(schema, modules);
    const { bodyId, rows } = await flaggedCity(t);
    const clerk = await asClerk(t);
    const flag = rows.find((row) => row.flag.field === "term_end")!.flag;
    await clerk.mutation(api.drift.resolve, { flagId: flag._id, action: "keep_tracked" });
    const board = await t.query(api.roster.board, { bodyId, now });
    expect(board?.seats[0].term?.rawEnd).toBe("12/26");
    expect(board?.seats[0].term?.endsAt).toBe(normalizeTermEnd("12/26"));
  });

  it("refuses a second resolve and refuses a non clerk", async () => {
    const t = convexTest(schema, modules);
    const { rows } = await flaggedCity(t);
    const clerk = await asClerk(t);
    const flagId = rows[0].flag._id;
    await expect(t.mutation(api.drift.resolve, { flagId, action: "keep_tracked" })).rejects.toThrow(/Sign in/);
    await clerk.mutation(api.drift.resolve, { flagId, action: "keep_tracked" });
    await expect(clerk.mutation(api.drift.resolve, { flagId, action: "keep_tracked" })).rejects.toThrow(
      /already resolved/,
    );
  });
});

describe("drift sources", () => {
  it("lists each confirmed source page once and the bodies behind it", async () => {
    const t = convexTest(schema, modules);
    const { cityId, bodyId } = await seedConfirmedBody(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("bodies", { cityId, name: "Parks Commission", sourceUrl: SOURCE, confirmed: true });
      await ctx.db.insert("bodies", { cityId, name: "Unconfirmed", sourceUrl: "https://testville.gov/x", confirmed: false });
    });
    expect(await t.query(internal.drift.confirmedSources, { cityId })).toEqual([SOURCE]);
    const bodies = await t.query(internal.drift.bodiesForSource, { cityId, sourceUrl: SOURCE });
    expect(bodies.map((b) => b.name).sort()).toEqual(["Parks Commission", "Planning Commission"]);
    expect(bodies.some((b) => b.bodyId === bodyId)).toBe(true);
  });
});

describe("the daily drift cron", () => {
  it("skips cities that are not confirmed", async () => {
    const t = convexTest(schema, modules);
    const { cityId } = await seedConfirmedBody(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(cityId, { status: "draft" });
      await ctx.db.insert("cities", {
        name: "Other",
        domain: "other.gov",
        slug: "other",
        websiteUrl: "https://other.gov",
        status: "draft" as const,
      });
    });
    expect(await t.mutation(internal.crons.driftAllConfirmedCities, {})).toEqual({ started: 0 });
  });
});
