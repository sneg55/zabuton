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
    expect(result?.seats.map((r) => r.status)).toEqual(["expired", "expiring", "vacant"]);
    expect(result?.seats[0].member?.name).toBe("Ada");
    expect(result?.seats[2].term).toBeNull();
  });
  it("counts statuses per body for the city view", async () => {
    const t = convexTest(schema, modules);
    const { cityId } = await seedBody(t);
    const result = await t.query(api.roster.city, { cityId, now });
    expect(result).toHaveLength(1);
    expect(result[0].counts).toEqual({ vacant: 1, expired: 1, expiring: 1, active: 0 });
  });
  it("respects a per-body expiring threshold", async () => {
    const t = convexTest(schema, modules);
    const { cityId, bodyId } = await seedBody(t);
    await t.run(async (ctx) => ctx.db.patch(bodyId, { expiringDays: 10 }));
    const result = await t.query(api.roster.city, { cityId, now });
    expect(result[0].counts).toEqual({ vacant: 1, expired: 1, expiring: 0, active: 1 });
  });
});
