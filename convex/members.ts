import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireClerk } from "./users";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const setEmail = mutation({
  args: { memberId: v.id("members"), email: v.string() },
  handler: async (ctx, { memberId, email }) => {
    await requireClerk(ctx);
    const member = await ctx.db.get(memberId);
    if (!member) throw new ConvexError("Member not found");
    const trimmed = email.trim();
    if (!EMAIL.test(trimmed)) throw new ConvexError("Enter a valid email address");
    await ctx.db.patch(memberId, { email: trimmed });
    return null;
  },
});
