import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password, Anonymous],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, { userId, existingUserId }) {
      if (existingUserId) return;
      const user = await ctx.db.get(userId);
      if (user?.isAnonymous) {
        await ctx.db.patch(userId, { role: "clerk", name: "Demo clerk" });
        return;
      }
      const clerks = await ctx.db.query("users").filter((q) => q.eq(q.field("role"), "clerk")).take(1);
      await ctx.db.patch(userId, { role: clerks.length === 0 ? "clerk" : "applicant" });
    },
  },
});
