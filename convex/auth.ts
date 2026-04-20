import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, args) {
      if (args.existingUserId !== null) return;
      const email = args.profile.email;
      if (!email) return;
      await ctx.scheduler.runAfter(0, internal.notifications.sendAccountWelcomeEmail, { email });
    },
  },
});
