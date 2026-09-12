import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { createBootstrapRun } from "./bootstrap";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const now = Date.UTC(2026, 8, 11, 12, 0, 0);
const DAY = 86_400_000;

type Harness = ReturnType<typeof convexTest>;

async function asClerk(t: Harness) {
  const userId = await t.run(async (ctx) => ctx.db.insert("users", { name: "Clerk", role: "clerk" as const }));
  return t.withIdentity({ subject: `${userId}|session` });
}

function startRun(t: Harness, url: string, at: number = now) {
  return t.run(async (ctx) => createBootstrapRun(ctx, url, at));
}

describe("createBootstrapRun", () => {
  it("creates the city from the pasted URL and queues a run", async () => {
    const t = convexTest(schema, modules);
    const run = await startRun(t, "https://www.dublin.ca.gov/74");
    const city = await t.query(api.roster.cityById, { cityId: run.cityId });
    expect(city).toMatchObject({ domain: "dublin.ca.gov", slug: "dublin-ca", name: "Dublin, CA", status: "draft" });
    expect(run.websiteUrl).toBe("https://www.dublin.ca.gov");
    const status = await t.query(api.bootstrap.status, { crawlRunId: run.crawlRunId });
    expect(status?.run.status).toBe("queued");
    expect(status?.run.purpose).toBe("bootstrap");
    expect(status?.run.log[0].message).toContain("dublin.ca.gov");
    expect(status?.documents).toEqual([]);
    expect(status?.drafts).toBe(0);
  });

  it("reuses the city when the same domain is pasted again", async () => {
    const t = convexTest(schema, modules);
    const first = await startRun(t, "dublin.ca.gov");
    await t.run(async (ctx) => ctx.db.patch(first.crawlRunId, { status: "done" }));
    const second = await startRun(t, "https://dublin.ca.gov/DocumentCenter/View/1");
    expect(second.cityId).toBe(first.cityId);
    expect(await t.query(api.roster.cities, {})).toHaveLength(1);
  });

  it("refuses a second run while one is in flight for that city", async () => {
    const t = convexTest(schema, modules);
    await startRun(t, "dublin.ca.gov");
    await expect(startRun(t, "dublin.ca.gov")).rejects.toThrow(/already running/);
  });

  it("allows a new run once the last one finished", async () => {
    const t = convexTest(schema, modules);
    const first = await startRun(t, "dublin.ca.gov");
    await t.run(async (ctx) => ctx.db.patch(first.crawlRunId, { status: "failed" }));
    await expect(startRun(t, "dublin.ca.gov")).resolves.toBeTruthy();
  });

  it("refuses once 200 bootstrap runs have started in 24 hours", async () => {
    const t = convexTest(schema, modules);
    for (let i = 0; i < 200; i += 1) {
      const run = await startRun(t, `city${i}.gov`, now - i * 1000);
      await t.run(async (ctx) => ctx.db.patch(run.crawlRunId, { status: "done" }));
    }
    await expect(startRun(t, "onemore.gov")).rejects.toThrow(/200 crawls/);
  });

  it("refuses a fourth crawl of the same city inside 24 hours", async () => {
    const t = convexTest(schema, modules);
    for (let i = 0; i < 3; i += 1) {
      const run = await startRun(t, "same.gov", now - i * 1000);
      await t.run(async (ctx) => ctx.db.patch(run.crawlRunId, { status: "failed" }));
    }
    await expect(startRun(t, "same.gov")).rejects.toThrow(/3 times/);
    await expect(startRun(t, "other.gov")).resolves.toBeTruthy();
  });

  it("counts only the last 24 hours against the cap", async () => {
    const t = convexTest(schema, modules);
    for (let i = 0; i < 30; i += 1) {
      const run = await startRun(t, `city${i}.gov`, now - 2 * DAY);
      await t.run(async (ctx) => ctx.db.patch(run.crawlRunId, { status: "done" }));
    }
    await expect(startRun(t, "onemore.gov")).resolves.toBeTruthy();
  });

  it("keeps the slug unique when two domains share a name", async () => {
    const t = convexTest(schema, modules);
    const first = await startRun(t, "dublin.ca.gov");
    const second = await startRun(t, "dublin.ca.org");
    const slugs = (await t.query(api.roster.cities, {})).map((c) => c.slug);
    expect(new Set(slugs).size).toBe(2);
    expect(first.cityId).not.toBe(second.cityId);
  });
});

describe("bootstrap.latestRun", () => {
  it("gives the newest run for that purpose, or null", async () => {
    const t = convexTest(schema, modules);
    const first = await startRun(t, "dublin.ca.gov", now - DAY);
    await t.run(async (ctx) => ctx.db.patch(first.crawlRunId, { status: "done" }));
    const second = await startRun(t, "dublin.ca.gov", now);
    expect((await t.query(api.bootstrap.latestRun, { cityId: first.cityId, purpose: "bootstrap" }))?._id).toBe(
      second.crawlRunId,
    );
    expect(await t.query(api.bootstrap.latestRun, { cityId: first.cityId, purpose: "drift" })).toBeNull();
  });
});

describe("bootstrap.importCsv", () => {
  const csv = [
    "body,member,role,appointed,term_end,source_url",
    "Planning Commission,Ada Lovelace,Chair,8/24,12/26,https://testville.gov/pc",
    "Planning Commission,Bo Diddley,,,12/28,https://testville.gov/pc",
    "Parks Commission,Cy Young,,,6/30/2030,",
  ].join("\n");

  async function city(t: Harness): Promise<Id<"cities">> {
    return t.run(async (ctx) =>
      ctx.db.insert("cities", {
        name: "Testville",
        domain: "testville.gov",
        slug: "testville",
        websiteUrl: "https://testville.gov",
        status: "draft" as const,
      }),
    );
  }

  it("writes one draft per body and a csv run ready for review", async () => {
    const t = convexTest(schema, modules);
    const cityId = await city(t);
    const clerk = await asClerk(t);
    expect(await clerk.mutation(api.bootstrap.importCsv, { cityId, csv })).toEqual({ draftCount: 2 });
    const drafts = await t.query(api.drafts.list, { cityId });
    expect(drafts.map((d) => d.name)).toEqual(["Parks Commission", "Planning Commission"]);
    expect(drafts[1].members.map((m) => m.name)).toEqual(["Ada Lovelace", "Bo Diddley"]);
    expect(drafts[0].sourceUrl).toBe("https://testville.gov");
    const run = await t.query(api.bootstrap.latestRun, { cityId, purpose: "bootstrap" });
    expect(run).toMatchObject({ source: "csv", status: "review", draftCount: 2 });
  });

  it("refuses anyone who is not a clerk", async () => {
    const t = convexTest(schema, modules);
    const cityId = await city(t);
    await expect(t.mutation(api.bootstrap.importCsv, { cityId, csv })).rejects.toThrow(/Sign in/);
  });

  it("says what is wrong with a CSV it cannot read", async () => {
    const t = convexTest(schema, modules);
    const cityId = await city(t);
    const clerk = await asClerk(t);
    await expect(clerk.mutation(api.bootstrap.importCsv, { cityId, csv: "a,b\n1,2" })).rejects.toThrow(/columns/);
  });
});

describe("cities.update", () => {
  it("lets a clerk rename a city, set the expiring window and confirm it", async () => {
    const t = convexTest(schema, modules);
    const { cityId } = await startRun(t, "dublin.ca.gov");
    const clerk = await asClerk(t);
    await clerk.mutation(api.cities.update, { cityId, name: "Dublin", expiringDays: 90, status: "confirmed" });
    expect(await t.query(api.roster.cityById, { cityId })).toMatchObject({
      name: "Dublin",
      expiringDays: 90,
      status: "confirmed",
    });
  });

  it("refuses a nonsense expiring window and a blank name", async () => {
    const t = convexTest(schema, modules);
    const { cityId } = await startRun(t, "dublin.ca.gov");
    const clerk = await asClerk(t);
    await expect(clerk.mutation(api.cities.update, { cityId, expiringDays: 0 })).rejects.toThrow(/between 1 and 730/);
    await expect(clerk.mutation(api.cities.update, { cityId, name: "  " })).rejects.toThrow(/needs a name/);
  });

  it("refuses anyone who is not a clerk", async () => {
    const t = convexTest(schema, modules);
    const { cityId } = await startRun(t, "dublin.ca.gov");
    await expect(t.mutation(api.cities.update, { cityId, name: "Dublin" })).rejects.toThrow(/Sign in/);
  });
});
