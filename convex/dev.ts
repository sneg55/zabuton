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
