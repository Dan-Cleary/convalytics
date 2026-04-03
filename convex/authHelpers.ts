/**
 * Shared auth helpers for Convex queries and mutations.
 *
 * All dashboard queries go through one of these functions:
 *  - validateSession: confirms the caller is authenticated (checks expiry)
 *  - getUserTeamIds: returns all team IDs the user is a member of
 *  - validateProjectAccess: confirms the caller is on the team that owns the project
 *
 * Using these consistently means auth is never accidentally skipped.
 */

import { QueryCtx, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Validates a session token and returns the session if valid.
 * Returns null if:
 *  - Token doesn't exist
 *  - Session has expired
 */
export async function validateSession(
  ctx: QueryCtx | MutationCtx,
  sessionToken: string,
) {
  if (!sessionToken) return null;

  const session = await ctx.db
    .query("sessions")
    .withIndex("by_sessionToken", (q) => q.eq("sessionToken", sessionToken))
    .unique();

  if (!session) return null;

  // Check expiry - treat sessions without expiresAt as expired (legacy cleanup)
  if (!session.expiresAt || session.expiresAt < Date.now()) {
    return null;
  }

  return session;
}

/**
 * Returns all team IDs the user is a member of.
 */
export async function getUserTeamIds(
  ctx: QueryCtx | MutationCtx,
  userId: string,
): Promise<Id<"teams">[]> {
  const memberships = await ctx.db
    .query("teamMembers")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();

  return memberships.map((m) => m.teamId);
}

/**
 * Returns the user's membership for a specific team, or null if not a member.
 */
export async function getTeamMembership(
  ctx: QueryCtx | MutationCtx,
  teamId: Id<"teams">,
  userId: string,
) {
  return await ctx.db
    .query("teamMembers")
    .withIndex("by_teamId_and_userId", (q) =>
      q.eq("teamId", teamId).eq("userId", userId),
    )
    .unique();
}

/**
 * Returns the project if the session is valid and the caller is on the team that owns it.
 * Returns null on any auth failure (session missing/expired, project missing, not a team member).
 */
export async function validateProjectAccess(
  ctx: QueryCtx | MutationCtx,
  sessionToken: string,
  writeKey: string,
) {
  const session = await validateSession(ctx, sessionToken);
  if (!session) return null;

  const project = await ctx.db
    .query("projects")
    .withIndex("by_writeKey", (q) => q.eq("writeKey", writeKey))
    .unique();

  if (!project) return null;

  // Check team membership
  const membership = await getTeamMembership(ctx, project.teamId, session.userId);
  if (!membership) return null;

  return project;
}
