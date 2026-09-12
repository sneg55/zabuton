import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const DAY = 86_400_000;
const now = Date.UTC(2026, 8, 11, 12, 0, 0);
const modules = import.meta.glob("./**/*.ts");

async function seedBody(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const cityId = await ctx.db.insert("cities", { name: "Testville", domain: "testville.gov", slug: "testville", websiteUrl: "https://testville.gov", status: "draft" });
    const bodyId = await ctx.db.insert("bodies", { cityId, name: "Planning Commission", sourceUrl: "https://testville.gov/pc", confirmed: false });
    const memberA = await ctx.db.insert("members", { cityId, name: "Ada" });
    const memberB = await ctx.db.insert("members", { cityId, name: "Bo" });
    const s1 = await ctx.db.insert("seats", { bodyId, ordinal: 1 });
    const s2 = await ctx.db.insert("seats", { bodyId, ordinal: 2 });
    await ctx.db.insert("seats", { bodyId, ordinal: 3 });
    await ctx.db.insert("terms", { seatId: s1, memberId: memberA, endsAt: now - DAY, sourceUrl: "x", snippet: "Ada 9/26", current: true });
    await ctx.db.insert("terms", { seatId: s2, memberId: memberB, endsAt: now + 30 * DAY, sourceUrl: "x", snippet: "Bo 10/26", current: true });
    return { cityId, bodyId };
  });
}

describe("roster", () => {
  it("computes a status per seat on the board", async () => {
    const t = convexTest(schema, modules);
    const { bodyId } = await seedBody(t);
    const result = await t.query(api.roster.board, { bodyId, now });
    expect(result?.seats.map((r) => r.status)).toEqual(["expired", "expiring", "unlisted"]);
    expect(result?.seats[0].member?.name).toBe("Ada");
    expect(result?.seats[2].term).toBeNull();
  });
  it("counts statuses per body for the city view", async () => {
    const t = convexTest(schema, modules);
    const { cityId } = await seedBody(t);
    const result = await t.query(api.roster.city, { cityId, now });
    expect(result).toHaveLength(1);
    expect(result[0].counts).toEqual({ vacant: 0, expired: 1, expiring: 1, active: 0, unlisted: 1 });
  });
  it("respects a per-body expiring threshold", async () => {
    const t = convexTest(schema, modules);
    const { cityId, bodyId } = await seedBody(t);
    await t.run(async (ctx) => ctx.db.patch(bodyId, { expiringDays: 10 }));
    const result = await t.query(api.roster.city, { cityId, now });
    expect(result[0].counts).toEqual({ vacant: 0, expired: 1, expiring: 0, active: 1, unlisted: 1 });
  });
  it("shows a seat the city marked vacant as vacant, and a holder named Vacant as no holder", async () => {
    const t = convexTest(schema, modules);
    const { cityId, bodyId } = await seedBody(t);
    await t.run(async (ctx) => {
      const s4 = await ctx.db.insert("seats", { bodyId, ordinal: 4, label: "Alternate", vacant: true });
      const s5 = await ctx.db.insert("seats", { bodyId, ordinal: 5 });
      const ghost = await ctx.db.insert("members", { cityId, name: "Vacant" });
      await ctx.db.insert("terms", { seatId: s5, memberId: ghost, endsAt: now + 200 * DAY, sourceUrl: "x", snippet: "Vacant 12/26", current: true });
      void s4;
    });
    const result = await t.query(api.roster.board, { bodyId, now });
    expect(result?.seats.map((r) => r.status)).toEqual(["expired", "expiring", "unlisted", "vacant", "vacant"]);
    expect(result?.seats[4].member).toBeNull();
    const openings = await t.query(api.roster.openings, { cityId, now });
    expect(openings.map((o) => o.row.status)).toEqual(["vacant", "vacant", "expired", "expiring"]);
  });
  it("treats a holder with an unknown end date as serving, not as an open seat", async () => {
    const t = convexTest(schema, modules);
    const { cityId, bodyId } = await seedBody(t);
    await t.run(async (ctx) => {
      const s4 = await ctx.db.insert("seats", { bodyId, ordinal: 4 });
      const cy = await ctx.db.insert("members", { cityId, name: "Cy Young" });
      await ctx.db.insert("terms", { seatId: s4, memberId: cy, sourceUrl: "x", snippet: "Cy Young", current: true });
    });
    const result = await t.query(api.roster.board, { bodyId, now });
    expect(result?.seats[3].status).toBe("active");
    expect(result?.seats[3].member?.name).toBe("Cy Young");
  });
});
