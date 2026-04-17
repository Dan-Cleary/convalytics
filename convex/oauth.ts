/**
 * Convex team OAuth — "Connect Convex" flow.
 *
 * Identity is handled separately by Convex Auth (Google). This file
 * handles team-level access: a user who is already signed in authorizes
 * the app to manage their Convex team (create projects, list deployments,
 * etc.) and we store the resulting management token in `teamConvexGrants`.
 */

import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAuth } from "./authHelpers";
import type { Id } from "./_generated/dataModel";

const CLIENT_ID = "a89dda460f9b4d42";
const TOKEN_EXCHANGE_URL = "https://api.convex.dev/oauth/token";
const TOKEN_DETAILS_URL = "https://api.convex.dev/v1/token_details";
const TEAM_INFO_URL = (teamId: number) =>
  `https://api.convex.dev/v1/teams/${teamId}`;

/**
 * Exchange a Convex OAuth authorization code for a team access token and
 * wire the resulting team into our database.
 *
 * Caller must already be signed in with Convex Auth (Google).
 */
export const exchangeCode = action({
  args: {
    code: v.string(),
    codeVerifier: v.string(),
    redirectUri: v.string(),
  },
  returns: v.object({ teamId: v.id("teams") }),
  handler: async (ctx, args): Promise<{ teamId: Id<"teams"> }> => {
    const userId = await requireAuth(ctx);

    const clientSecret = process.env.CONVEX_OAUTH_CLIENT_SECRET;
    if (!clientSecret) {
      throw new Error("CONVEX_OAUTH_CLIENT_SECRET not configured");
    }

    // Exchange authorization code for access token
    const tokenResp = await fetch(TOKEN_EXCHANGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        client_secret: clientSecret,
        code: args.code,
        redirect_uri: args.redirectUri,
        code_verifier: args.codeVerifier,
      }).toString(),
    });
    if (!tokenResp.ok) {
      const text = await tokenResp.text();
      throw new Error(
        `Token exchange failed (HTTP ${tokenResp.status}): ${text || "(empty body)"}`,
      );
    }
    const tokenData = (await tokenResp.json()) as { access_token: string };
    const accessToken = tokenData.access_token;

    // Resolve the team identity of the access token
    const detailsResp = await fetch(TOKEN_DETAILS_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!detailsResp.ok) {
      throw new Error(`Failed to fetch token details (${detailsResp.status})`);
    }
    const details = (await detailsResp.json()) as { teamId: number | null };
    if (details.teamId === undefined || details.teamId === null) {
      throw new Error(
        `token_details missing teamId: ${JSON.stringify(details)}`,
      );
    }

    // Fetch the Convex team's display name for a friendlier default than
    // "Team <id>". Non-fatal — the mutation falls back if this is empty.
    let convexTeamName: string | undefined;
    try {
      const teamResp = await fetch(TEAM_INFO_URL(details.teamId), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (teamResp.ok) {
        const team = (await teamResp.json()) as { name?: string };
        if (team.name && team.name.trim()) {
          convexTeamName = team.name.trim();
        }
      }
    } catch {
      // Non-fatal; proceed with the numeric fallback
    }

    const teamId = await ctx.runMutation(internal.oauth.connectConvexTeam, {
      userId,
      convexTeamId: details.teamId,
      convexTeamName,
      managementToken: accessToken,
    });
    return { teamId };
  },
});

/**
 * Find-or-create the team, ensure membership, and upsert the Convex
 * management token grant. Called from `exchangeCode` after token exchange.
 */
export const connectConvexTeam = internalMutation({
  args: {
    userId: v.id("users"),
    convexTeamId: v.number(),
    convexTeamName: v.optional(v.string()),
    managementToken: v.string(),
  },
  returns: v.id("teams"),
  handler: async (ctx, args): Promise<Id<"teams">> => {
    const now = Date.now();

    // 1. Find or create the team (by Convex team ID)
    const existingTeam = await ctx.db
      .query("teams")
      .withIndex("by_convexTeamId", (q) =>
        q.eq("convexTeamId", args.convexTeamId),
      )
      .unique();

    const fallbackName = `Team ${args.convexTeamId}`;
    const initialName =
      args.convexTeamName && args.convexTeamName.trim()
        ? args.convexTeamName.trim()
        : fallbackName;

    let teamId: Id<"teams">;
    let isNewTeam: boolean;
    if (existingTeam) {
      teamId = existingTeam._id;
      isNewTeam = false;
      // If the team is still using the numeric fallback and we now know the
      // real Convex name, upgrade it. If the user has already renamed it to
      // anything else, leave it alone.
      if (
        existingTeam.name === fallbackName &&
        args.convexTeamName &&
        args.convexTeamName.trim()
      ) {
        await ctx.db.patch("teams", teamId, { name: args.convexTeamName.trim() });
      }
    } else {
      const existingMemberships = await ctx.db
        .query("teamMembers")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .collect();

      // Claim flow creates a team without convexTeamId; if the user has
      // exactly one such team, attach the Convex team there to avoid duplicates.
      const candidateTeams = await Promise.all(
        existingMemberships.map((membership) =>
          ctx.db.get("teams", membership.teamId),
        ),
      );
      const unlinkedTeams = candidateTeams.filter(
        (team): team is NonNullable<typeof team> =>
          team !== null && team.convexTeamId === undefined,
      );
      const reusableTeam = unlinkedTeams.length === 1 ? unlinkedTeams[0] : null;
      if (reusableTeam && reusableTeam.convexTeamId === undefined) {
        teamId = reusableTeam._id;
        isNewTeam = false;
        await ctx.db.patch("teams", teamId, {
          convexTeamId: args.convexTeamId,
        });
      } else {
        teamId = await ctx.db.insert("teams", {
          convexTeamId: args.convexTeamId,
          name: initialName,
          slug: `team-${args.convexTeamId}`,
          plan: "free",
          usageLimitEventsPerMonth: 10000,
          createdAt: now,
        });
        isNewTeam = true;
      }
    }

    // 2. Ensure user is a member of the team
    const existingMembership = await ctx.db
      .query("teamMembers")
      .withIndex("by_teamId_and_userId", (q) =>
        q.eq("teamId", teamId).eq("userId", args.userId),
      )
      .unique();
    if (!existingMembership) {
      // Only auto-join for new teams. For existing teams, user should be invited.
      if (isNewTeam) {
        await ctx.db.insert("teamMembers", {
          teamId,
          userId: args.userId,
          role: "owner",
          joinedAt: now,
        });
      } else {
        // Log membership request for existing teams - requires invite/admin approval
        console.log(
          `OAuth membership request: User ${args.userId} attempted to join existing team ${teamId} (convexTeamId: ${args.convexTeamId}). Requires invite/admin approval.`,
        );
        // Refuse to touch the team's grant when the caller isn't a member.
        // Otherwise a Convex-team peer who isn't a Convalytics member could
        // overwrite the stored management token.
        throw new Error(
          "You are not a member of this Convalytics team. Ask a team owner to invite you before connecting Convex.",
        );
      }
    }

    // 3. Upsert the management-token grant for this team. Keep exactly one
    // grant per team — re-authorizing replaces the previous token.
    const existingGrant = await ctx.db
      .query("teamConvexGrants")
      .withIndex("by_teamId", (q) => q.eq("teamId", teamId))
      .first();
    if (existingGrant) {
      await ctx.db.patch("teamConvexGrants", existingGrant._id, {
        grantedByUserId: args.userId,
        managementToken: args.managementToken,
        createdAt: now,
      });
    } else {
      await ctx.db.insert("teamConvexGrants", {
        teamId,
        grantedByUserId: args.userId,
        managementToken: args.managementToken,
        createdAt: now,
      });
    }

    return teamId;
  },
});