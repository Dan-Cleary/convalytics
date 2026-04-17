/**
 * Team-level queries and mutations (settings, rename, etc.).
 *
 * Membership-level concerns (invite, accept, remove member) live in
 * `invites.ts`. This file is for the team itself.
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAuth } from "./authHelpers";

const MAX_TEAM_NAME_LENGTH = 60;

/** Returns the caller's primary team with display info for settings UI. */
export const getMyTeam = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (!membership) return null;

    const team = await ctx.db.get(membership.teamId);
    if (!team) return null;

    return {
      _id: team._id,
      name: team.name,
      slug: team.slug,
      plan: team.plan,
      convexTeamId: team.convexTeamId,
      myRole: membership.role,
    };
  },
});

/** Rename the caller's team. Owners and admins only. */
export const renameTeam = mutation({
  args: { name: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true) }),
    v.object({ error: v.string() }),
  ),
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const name = args.name.trim();
    if (!name) return { error: "Name cannot be empty" };
    if (name.length > MAX_TEAM_NAME_LENGTH) {
      return { error: `Name must be ${MAX_TEAM_NAME_LENGTH} characters or fewer` };
    }

    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (!membership) return { error: "Not a team member" };
    if (membership.role === "member") {
      return { error: "Only owners and admins can rename the team" };
    }

    await ctx.db.patch(membership.teamId, { name });
    return { ok: true as const };
  },
});
