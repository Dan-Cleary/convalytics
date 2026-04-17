/**
 * Shared auth helpers for Convex queries, mutations, and actions.
 *
 * Identity is managed by @convex-dev/auth (Google OAuth). Callers do NOT
 * pass session tokens — auth travels with the Convex connection and is
 * read via `getAuthUserId(ctx)`.
 *
 * Helpers:
 *  - getUserId: returns Id<"users"> or null
 *  - requireAuth: like getUserId but throws when unauthenticated
 *  - getUserTeamIds: team IDs the user is a member of
 *  - getTeamMembership: user's membership on a specific team (or null)
 *  - validateProjectAccess: resolves a project + confirms the caller is on its team
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import type {
  ActionCtx,
  MutationCtx,
  QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";

type AnyCtx = QueryCtx | MutationCtx | ActionCtx;

/** Returns the authenticated user's id, or null. */
export async function getUserId(ctx: AnyCtx): Promise<Id<"users"> | null> {
  return await getAuthUserId(ctx);
}

/** Returns the authenticated user's id, or throws if unauthenticated. */
export async function requireAuth(ctx: AnyCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");
  return userId;
}

/** All team IDs the user is a member of. */
export async function getUserTeamIds(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Id<"teams">[]> {
  const memberships = await ctx.db
    .query("teamMembers")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();
  return memberships.map((m) => m.teamId);
}

/** User's membership record for a specific team, or null. */
export async function getTeamMembership(
  ctx: QueryCtx | MutationCtx,
  teamId: Id<"teams">,
  userId: Id<"users">,
) {
  return await ctx.db
    .query("teamMembers")
    .withIndex("by_teamId_and_userId", (q) =>
      q.eq("teamId", teamId).eq("userId", userId),
    )
    .unique();
}

/**
 * Resolves a project by writeKey and confirms the caller is on its team.
 * Returns null on any auth/access failure.
 */
export async function validateProjectAccess(
  ctx: QueryCtx | MutationCtx,
  writeKey: string,
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;

  const project = await ctx.db
    .query("projects")
    .withIndex("by_writeKey", (q) => q.eq("writeKey", writeKey))
    .unique();
  if (!project) return null;
  if (!project.teamId) return null;

  const membership = await getTeamMembership(ctx, project.teamId, userId);
  if (!membership) return null;
  return project;
}
