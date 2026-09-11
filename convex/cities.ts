import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireClerk } from "./users";

export const update = mutation({
  args: {
    cityId: v.id("cities"),
    name: v.optional(v.string()),
    expiringDays: v.optional(v.number()),
    status: v.optional(v.union(v.literal("draft"), v.literal("confirmed"))),
  },
  handler: async (ctx, { cityId, name, expiringDays, status }) => {
    await requireClerk(ctx);
    const city = await ctx.db.get(cityId);
    if (!city) throw new Error("That city is gone");
    if (name !== undefined && name.trim() === "") throw new Error("A city needs a name");
    if (expiringDays !== undefined && (expiringDays < 1 || expiringDays > 730)) {
      throw new Error("The expiring window has to be between 1 and 730 days");
    }
    await ctx.db.patch(cityId, {
      ...(name === undefined ? {} : { name: name.trim() }),
      ...(expiringDays === undefined ? {} : { expiringDays }),
      ...(status === undefined ? {} : { status }),
    });
    return null;
  },
});
