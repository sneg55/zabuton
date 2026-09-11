import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const now = Date.UTC(2026, 8, 11, 12, 0, 0);
const modules = import.meta.glob("./**/*.ts");

describe("loadDublin", () => {
  it("flags the Youth Advisory seats expired and the December seats expiring", async () => {
    const t = convexTest(schema, modules);
    const { cityId } = await t.mutation(internal.seed.loadDublin, {});
    const view = await t.query(api.roster.city, { cityId, now });
    const byName = Object.fromEntries(view.map((r) => [r.body.name, r]));
    expect(byName["Youth Advisory Committee"].counts.expired).toBe(17);
    expect(byName["Planning Commission"].counts.expired).toBe(0);
    expect(byName["Planning Commission"].counts.expiring).toBeGreaterThan(0);
    expect(byName["Planning Commission"].counts.vacant).toBe(0);
    expect(byName["Planning Commission"].body.termLength).toBe("generally four years");
  });
  it("is idempotent", async () => {
    const t = convexTest(schema, modules);
    const first = await t.mutation(internal.seed.loadDublin, {});
    const second = await t.mutation(internal.seed.loadDublin, {});
    expect(second.cityId).toBe(first.cityId);
    expect(second.created).toBe(false);
  });
});
