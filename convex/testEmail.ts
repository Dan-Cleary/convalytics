import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const sendAccountWelcome = action({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    await ctx.runAction(internal.notifications.sendAccountWelcomeEmail, {
      email: args.email,
    });
  },
});
