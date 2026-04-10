import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

const CLIENT_ID = "a89dda460f9b4d42";
const TOKEN_EXCHANGE_URL = "https://api.convex.dev/oauth/token";
const TOKEN_DETAILS_URL = "https://api.convex.dev/v1/token_details";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const exchangeCode = action({
  args: {
    code: v.string(),
    codeVerifier: v.string(),
    redirectUri: v.string(),
  },
  handler: async (ctx, args) => {
    const clientSecret = process.env.CONVEX_OAUTH_CLIENT_SECRET;
    if (!clientSecret) throw new Error("CONVEX_OAUTH_CLIENT_SECRET not configured");

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
      throw new Error(`Token exchange failed (HTTP ${tokenResp.status}): ${text || "(empty body)"}`);
    }

    const tokenData = (await tokenResp.json()) as { access_token: string };
    const accessToken = tokenData.access_token;

    // Resolve user identity from the access token
    const detailsResp = await fetch(TOKEN_DETAILS_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!detailsResp.ok) {
      throw new Error(`Failed to fetch token details (${detailsResp.status})`);
    }

    const details = (await detailsResp.json()) as {
      teamId: number;
      email?: string;
      name?: string;
    };
    const teamId = details.teamId;
    if (!teamId) throw new Error(`token_details missing teamId: ${JSON.stringify(details)}`);

    const userId = `convex:${teamId}`;
    const sessionToken = crypto.randomUUID();
    const expiresAt = Date.now() + SESSION_TTL_MS;

    await ctx.runMutation(internal.oauth.createSession, {
      sessionToken,
      userId,
      convexTeamId: teamId,
      managementToken: accessToken,
      expiresAt,
      email: details.email,
      name: details.name,
    });

    return sessionToken;
  },
});

export const createSession = internalMutation({
  args: {
    sessionToken: v.string(),
    userId: v.string(),
    convexTeamId: v.number(),
    managementToken: v.string(),
    expiresAt: v.number(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // 1. Find or create the team (by Convex team ID)
    const existingTeam = await ctx.db
      .query("teams")
      .withIndex("by_convexTeamId", (q) => q.eq("convexTeamId", args.convexTeamId))
      .unique();

    let teamId: import("./_generated/dataModel").Id<"teams">;
    let isNewTeam: boolean;

    if (existingTeam) {
      teamId = existingTeam._id;
      isNewTeam = false;
    } else {
      teamId = await ctx.db.insert("teams", {
        convexTeamId: args.convexTeamId,
        name: `Team ${args.convexTeamId}`, // Default name, user can change later
        slug: `team-${args.convexTeamId}`,
        plan: "free",
        usageLimitEventsPerMonth: 10000, // Free tier default
        createdAt: now,
      });
      isNewTeam = true;
    }

    // 2. Upsert user — permanent record, created on first login
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();

    if (!existingUser) {
      await ctx.db.insert("users", {
        userId: args.userId,
        email: args.email,
        name: args.name,
        createdAt: now,
      });
    } else if (args.email && !existingUser.email) {
      // Backfill email/name if we now have it but didn't before
      await ctx.db.patch("users", existingUser._id, {
        email: args.email,
        ...(args.name ? { name: args.name } : {}),
      });
    }

    // 3. Ensure user is a member of the team
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
        role: isNewTeam ? "owner" : "member", // First user is owner, rest are members
        joinedAt: now,
      });
    }

    // 4. Upsert session — rotate token and refresh expiry on each login
    const existingSession = await ctx.db
      .query("sessions")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();

    if (existingSession) {
      await ctx.db.patch("sessions", existingSession._id, {
        sessionToken: args.sessionToken,
        managementToken: args.managementToken,
        expiresAt: args.expiresAt,
      });
    } else {
      await ctx.db.insert("sessions", {
        sessionToken: args.sessionToken,
        userId: args.userId,
        managementToken: args.managementToken,
        expiresAt: args.expiresAt,
      });
    }
  },
});

// Used by actions that need session data (can't use authHelpers directly).
// Logic must match authHelpers.validateSession exactly.
export const getSessionByToken = internalQuery({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    if (!args.sessionToken) return null;

    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sessionToken", (q) =>
        q.eq("sessionToken", args.sessionToken),
      )
      .unique();

    if (!session) return null;

    // Sessions without expiresAt are legacy and should re-authenticate.
    // Sessions past expiry are invalid.
    if (!session.expiresAt || session.expiresAt < Date.now()) {
      return null;
    }

    return session;
  },
});
