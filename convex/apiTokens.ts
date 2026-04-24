/**
 * API tokens — user-generated credentials scoped to one team.
 *
 * First consumer is the Convalytics MCP server (gated to Solo+ plans at the
 * /mcp endpoint). The table and flow are deliberately generic so a future
 * REST read API or webhook-signing flow can reuse them.
 *
 * Security model: plain token is shown ONCE at creation; only sha-256(token)
 * is stored. Lookups hash the inbound bearer and match against tokenHash —
 * same reveal-once pattern used for team invites.
 *
 * Scope: a token grants read access to all projects on its team. MCP tools
 * take an explicit `project` argument so the agent chooses which project to
 * query per call. If you need per-project isolation, split your projects
 * onto separate teams.
 */

import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { getTeamMembership, getUserId, requireAuth } from "./authHelpers";
import { sha256Hex } from "./tokenHash";
import type { Doc, Id } from "./_generated/dataModel";

const MAX_NAME_LEN = 100;
const LAST_USED_DEBOUNCE_MS = 60_000;

export type ValidatedApiToken = {
  tokenId: Id<"apiTokens">;
  teamId: Id<"teams">;
  createdBy: Id<"users">;
  scope: Doc<"apiTokens">["scope"];
  plan: Doc<"teams">["plan"];
};

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const base64url = btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `cnv_${base64url}`;
}

// ---------------------------------------------------------------------------
// Internal — called from HTTP handlers (e.g. POST /mcp in http.ts)
// ---------------------------------------------------------------------------

/**
 * Validate an inbound token (hashed) and return the denormalized context the
 * HTTP handler needs: team scope + plan for the Solo+ gate.
 *
 * Returns null on invalid / revoked / missing team. The caller applies the
 * plan gate after inspecting `.plan`. Does NOT update lastUsedAt — call
 * touchLastUsed after a successful request.
 */
export const validate = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const token = await ctx.db
      .query("apiTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (!token) return null;
    if (token.revokedAt) return null;

    const team = await ctx.db.get("teams", token.teamId);
    if (!team) return null;

    return {
      tokenId: token._id,
      teamId: token.teamId,
      createdBy: token.createdBy,
      scope: token.scope,
      plan: team.plan,
    };
  },
});

/**
 * Fire-and-forget lastUsedAt update. Debounced: only writes if the existing
 * value is older than LAST_USED_DEBOUNCE_MS. At 120 req/min/team we don't
 * want to patch the same row twice a second — OCC contention against the
 * dashboard `list` reactive query and wasted writes.
 */
export const touchLastUsed = internalMutation({
  args: { tokenId: v.id("apiTokens") },
  handler: async (ctx, args) => {
    const token = await ctx.db.get("apiTokens", args.tokenId);
    if (!token) return;
    const now = Date.now();
    if (
      !token.lastUsedAt ||
      now - token.lastUsedAt > LAST_USED_DEBOUNCE_MS
    ) {
      await ctx.db.patch("apiTokens", args.tokenId, { lastUsedAt: now });
    }
  },
});

// ---------------------------------------------------------------------------
// Public — dashboard mutations and queries
// ---------------------------------------------------------------------------

/**
 * Create a new API token scoped to the caller's team. Returns the plain token
 * ONCE; subsequent reads only see metadata.
 *
 * Default scope is "read" (the nine analytics queries). Pass scope="write"
 * to also unlock funnel create/update/delete tools over MCP. Keep the default
 * conservative: the dashboard UI should ask the user before minting a write
 * token so third-party agents don't inherit mutation rights silently.
 */
export const create = mutation({
  args: {
    name: v.string(),
    scope: v.optional(v.union(v.literal("read"), v.literal("write"))),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    if (memberships.length === 0) {
      throw new Error("You are not a member of any team");
    }
    const teamId = memberships[0].teamId;

    const name = args.name.trim();
    if (!name) throw new Error("Token name is required");
    if (name.length > MAX_NAME_LEN)
      throw new Error(`Token name must be ${MAX_NAME_LEN} characters or fewer`);

    const plainToken = generateToken();
    const tokenHash = await sha256Hex(plainToken);

    await ctx.db.insert("apiTokens", {
      tokenHash,
      teamId,
      createdBy: userId,
      name,
      scope: args.scope ?? "read",
      createdAt: Date.now(),
    });

    return { token: plainToken };
  },
});

/**
 * List API tokens for the caller's team. Includes revoked tokens for audit;
 * the UI may filter them. Never includes the plain token or the hash.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];

    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    if (memberships.length === 0) return [];
    const teamId = memberships[0].teamId;

    const tokens = await ctx.db
      .query("apiTokens")
      .withIndex("by_teamId", (q) => q.eq("teamId", teamId))
      .collect();

    return tokens.map((t) => ({
      _id: t._id,
      name: t.name,
      scope: t.scope,
      createdAt: t.createdAt,
      lastUsedAt: t.lastUsedAt ?? null,
      revokedAt: t.revokedAt ?? null,
      createdBy: t.createdBy,
    }));
  },
});

/** Soft-delete: sets revokedAt. Revoked tokens can't authenticate but remain for audit. */
export const revoke = mutation({
  args: { tokenId: v.id("apiTokens") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const token = await ctx.db.get("apiTokens", args.tokenId);
    if (!token) throw new Error("Token not found");

    const membership = await getTeamMembership(ctx, token.teamId, userId);
    if (!membership) throw new Error("Not a member of this token's team");

    if (!token.revokedAt) {
      await ctx.db.patch("apiTokens", args.tokenId, { revokedAt: Date.now() });
    }
  },
});
