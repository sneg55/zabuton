import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { isGenericBodyName } from "./lib/draftTypes";

export const setTermEnd = internalMutation({
  args: { bodyName: v.string(), ordinal: v.number(), endsAt: v.union(v.number(), v.null()) },
  handler: async (ctx, { bodyName, ordinal, endsAt }) => {
    const body = (await ctx.db.query("bodies").collect()).find((b) => b.name === bodyName);
    if (!body) throw new ConvexError("no body " + bodyName);
    const seat = (await ctx.db.query("seats").withIndex("by_body", (q) => q.eq("bodyId", body._id)).collect()).find((s) => s.ordinal === ordinal);
    if (!seat) throw new ConvexError("no seat " + ordinal);
    const term = (await ctx.db.query("terms").withIndex("by_seat", (q) => q.eq("seatId", seat._id)).collect()).find((t) => t.current);
    if (!term) throw new ConvexError("no current term");
    await ctx.db.patch(term._id, { endsAt: endsAt ?? undefined });
    return term._id;
  },
});

export const setRole = internalMutation({
  args: { email: v.string(), role: v.union(v.literal("clerk"), v.literal("applicant")) },
  handler: async (ctx, { email, role }) => {
    const user = await ctx.db.query("users").withIndex("email", (q) => q.eq("email", email)).unique();
    if (!user) throw new ConvexError("no user " + email);
    await ctx.db.patch(user._id, { role });
    return user._id;
  },
});

export const renameCity = internalMutation({
  args: { slug: v.string(), name: v.string() },
  handler: async (ctx, { slug, name }) => {
    const city = await ctx.db.query("cities").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!city) throw new ConvexError("no city " + slug);
    await ctx.db.patch(city._id, { name });
    return city._id;
  },
});

export const pruneGenericDrafts = internalMutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const city = await ctx.db.query("cities").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!city) throw new ConvexError("no city " + slug);
    const drafts = await ctx.db.query("drafts").withIndex("by_city", (q) => q.eq("cityId", city._id)).collect();
    let n = 0;
    for (const d of drafts) {
      if (d.status === "pending" && isGenericBodyName(d.name)) {
        await ctx.db.patch(d._id, { status: "dismissed" });
        n += 1;
      }
    }
    return n;
  },
});

export const confirmCity = internalMutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const city = await ctx.db.query("cities").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!city) throw new ConvexError("no city " + slug);
    await ctx.db.patch(city._id, { status: "confirmed" });
    const bodies = await ctx.db.query("bodies").withIndex("by_city", (q) => q.eq("cityId", city._id)).collect();
    for (const b of bodies) await ctx.db.patch(b._id, { confirmed: true });
    return bodies.length;
  },
});

export const wipeCity = internalMutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const city = await ctx.db.query("cities").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!city) throw new ConvexError("no city " + slug);
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
  },
});
