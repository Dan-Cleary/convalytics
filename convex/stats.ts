import { internalMutation } from "./_generated/server";

export const cleanupExpiredSessions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let deleted = 0;

    const sessions = await ctx.db.query("sessions").take(500);
    for (const session of sessions) {
      if (!session.expiresAt || session.expiresAt < now) {
        await ctx.db.delete("sessions", session._id);
        deleted++;
      }
    }

    if (deleted > 0) {
      console.log(`[Session cleanup] Deleted ${deleted} expired sessions`);
    }
  },
});
