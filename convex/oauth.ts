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
    const details = (await detailsResp.json()) as { teamId: number };
    if (!details.teamId) {
      throw new Error(
        `token_details missing teamId: ${JSON.stringify(details)}`,
      );
    }

    const teamId = await ctx.runMutation(internal.oauth.connectConvexTeam, {
      userId,
      convexTeamId: details.teamId,
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

    let teamId: Id<"teams">;
    let isNewTeam: boolean;
    if (existingTeam) {
      teamId = existingTeam._id;
      isNewTeam = false;
    } else {
      teamId = await ctx.db.insert("teams", {
        convexTeamId: args.convexTeamId,
        name: `Team ${args.convexTeamId}`,
        slug: `team-${args.convexTeamId}`,
        plan: "free",
        usageLimitEventsPerMonth: 10000,
        createdAt: now,
      });
      isNewTeam = true;
    }

    // 2. Ensure user is a member of the team
    const existingMembership = await ctx.db
      .query("teamMembers")
      .withIndex("by_teamId_and_userId", (q) =>
        q.eq("teamId", teamId).eq("userId", args.userId),
      )
      .unique();
    if (!existingMembership) {
      await ctx.db.insert("teamMembers", {
        teamId,
        userId: args.userId,
        role: isNewTeam ? "owner" : "member",
        joinedAt: now,
      });
    }

    // 3. Upsert the management-token grant for this team. Keep exactly one
    // grant per team — re-authorizing replaces the previous token.
    const existingGrant = await ctx.db
      .query("teamConvexGrants")
      .withIndex("by_teamId", (q) => q.eq("teamId", teamId))
      .first();
    if (existingGrant) {
      await ctx.db.patch(existingGrant._id, {
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
