import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const setTermEnd = internalMutation({
  args: { bodyName: v.string(), ordinal: v.number(), endsAt: v.union(v.number(), v.null()) },
  handler: async (ctx, { bodyName, ordinal, endsAt }) => {
    const body = (await ctx.db.query("bodies").collect()).find((b) => b.name === bodyName);
    if (!body) throw new Error("no body " + bodyName);
    const seat = (await ctx.db.query("seats").withIndex("by_body", (q) => q.eq("bodyId", body._id)).collect()).find((s) => s.ordinal === ordinal);
    if (!seat) throw new Error("no seat " + ordinal);
    const term = (await ctx.db.query("terms").withIndex("by_seat", (q) => q.eq("seatId", seat._id)).collect()).find((t) => t.current);
    if (!term) throw new Error("no current term");
    await ctx.db.patch(term._id, { endsAt: endsAt ?? undefined });
    return term._id;
  },
});

export const setRole = internalMutation({
  args: { email: v.string(), role: v.union(v.literal("clerk"), v.literal("applicant")) },
  handler: async (ctx, { email, role }) => {
    const user = await ctx.db.query("users").withIndex("email", (q) => q.eq("email", email)).unique();
    if (!user) throw new Error("no user " + email);
    await ctx.db.patch(user._id, { role });
    return user._id;
  },
});

export const renameCity = internalMutation({
  args: { slug: v.string(), name: v.string() },
  handler: async (ctx, { slug, name }) => {
    const city = await ctx.db.query("cities").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!city) throw new Error("no city " + slug);
    await ctx.db.patch(city._id, { name });
    return city._id;
  },
});
