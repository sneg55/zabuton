import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return { _id: user._id, email: user.email ?? null, name: user.name ?? null, role: user.role ?? null };
  },
});

export const clerkExists = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.some((user) => user.role === "clerk");
  },
});

export async function requireClerk(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("Sign in required");
  const user = await ctx.db.get(userId);
  if (!user || user.role !== "clerk") throw new ConvexError("Clerk role required");
  return user;
}
