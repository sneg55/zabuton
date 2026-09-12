import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { requireCityWriter } from "./users";

const DEMO_CITY_TTL_MS = 24 * 60 * 60 * 1000;

export async function wipeCityRows(ctx: MutationCtx, city: Doc<"cities">): Promise<number> {
  const bodies = await ctx.db.query("bodies").withIndex("by_city", (q) => q.eq("cityId", city._id)).collect();
  for (const body of bodies) {
    const seats = await ctx.db.query("seats").withIndex("by_body", (q) => q.eq("bodyId", body._id)).collect();
    for (const seat of seats) {
      for (const term of await ctx.db.query("terms").withIndex("by_seat", (q) => q.eq("seatId", seat._id)).collect()) await ctx.db.delete(term._id);
      await ctx.db.delete(seat._id);
    }
    await ctx.db.delete(body._id);
  }
  for (const table of ["members", "drafts", "documents", "crawlRuns", "driftFlags", "notices", "applications", "threads"] as const) {
    for (const row of await ctx.db.query(table).withIndex("by_city", (q) => q.eq("cityId", city._id)).collect()) await ctx.db.delete(row._id);
  }
  await ctx.db.delete(city._id);
  return bodies.length;
}

export async function wipeExpiredDemoCities(ctx: MutationCtx, now: number): Promise<number> {
  let wiped = 0;
  for (const city of await ctx.db.query("cities").collect()) {
    if (city.createdBy === undefined || now - city._creationTime < DEMO_CITY_TTL_MS) continue;
    await wipeCityRows(ctx, city);
    wiped += 1;
  }
  return wiped;
}

export const update = mutation({
  args: {
    cityId: v.id("cities"),
    name: v.optional(v.string()),
    expiringDays: v.optional(v.number()),
    status: v.optional(v.union(v.literal("draft"), v.literal("confirmed"))),
  },
  handler: async (ctx, { cityId, name, expiringDays, status }) => {
    await requireCityWriter(ctx, cityId);
    const city = await ctx.db.get(cityId);
    if (!city) throw new ConvexError("That city is gone");
    if (name !== undefined && name.trim() === "") throw new ConvexError("A city needs a name");
    if (expiringDays !== undefined && (expiringDays < 1 || expiringDays > 730)) {
      throw new ConvexError("The expiring window has to be between 1 and 730 days");
    }
    await ctx.db.patch(cityId, {
      ...(name === undefined ? {} : { name: name.trim() }),
      ...(expiringDays === undefined ? {} : { expiringDays }),
      ...(status === undefined ? {} : { status }),
    });
    return null;
  },
});
