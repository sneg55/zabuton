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

export async function requireClerk(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Sign in required");
  const user = await ctx.db.get(userId);
  if (!user || user.role !== "clerk") throw new Error("Clerk role required");
  return user;
}
