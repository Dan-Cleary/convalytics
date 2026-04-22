/**
 * API tokens — user-generated credentials scoped to one project.
 *
 * First consumer is the Convalytics MCP server (gated to Solo+ plans at the
 * /mcp endpoint). The table and flow are deliberately generic so a future
 * REST read API or webhook-signing flow can reuse them.
 *
 * Security model: plain token is shown ONCE at creation; only sha-256(token)
 * is stored. Lookups hash the inbound bearer and match against tokenHash —
 * same reveal-once pattern used for team invites.
 */

import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { getTeamMembership, getUserId, requireAuth } from "./authHelpers";

const MAX_NAME_LEN = 100;

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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
 * HTTP handler needs to decide whether to serve the request: project scope,
 * team, and team plan for the plan gate.
 *
 * Returns null on invalid / revoked / missing project / unclaimed project.
 * The caller is responsible for applying the plan gate after inspecting
 * `.plan`. Does NOT update lastUsedAt — call touchLastUsed after a
 * successful request.
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

    const project = await ctx.db.get("projects", token.projectId);
    if (!project) return null;

    const team = await ctx.db.get("teams", token.teamId);
    if (!team) return null;

    return {
      tokenId: token._id,
      projectId: token.projectId,
      teamId: token.teamId,
      writeKey: project.writeKey,
      scope: token.scope,
      plan: team.plan,
    };
  },
});

/** Fire-and-forget lastUsedAt update; safe to ignore from the HTTP critical path. */
export const touchLastUsed = internalMutation({
  args: { tokenId: v.id("apiTokens") },
  handler: async (ctx, args) => {
    await ctx.db.patch("apiTokens", args.tokenId, { lastUsedAt: Date.now() });
  },
});

// ---------------------------------------------------------------------------
// Public — dashboard mutations and queries
// ---------------------------------------------------------------------------

/**
 * Create a new API token scoped to one project. Caller must be a member of
 * the project's team. Returns the plain token ONCE; subsequent reads only
 * see the hash prefix. v1 scope is always "read" (MCP read tools).
 */
export const create = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const project = await ctx.db.get("projects", args.projectId);
    if (!project) throw new Error("Project not found");
    if (!project.teamId)
      throw new Error("Project is unclaimed; claim it before creating tokens");

    const membership = await getTeamMembership(ctx, project.teamId, userId);
    if (!membership) throw new Error("Not a member of this project's team");

    const name = args.name.trim();
    if (!name) throw new Error("Token name is required");
    if (name.length > MAX_NAME_LEN)
      throw new Error(`Token name must be ${MAX_NAME_LEN} characters or fewer`);

    const plainToken = generateToken();
    const tokenHash = await sha256Hex(plainToken);

    await ctx.db.insert("apiTokens", {
      tokenHash,
      projectId: args.projectId,
      teamId: project.teamId,
      createdBy: userId,
      name,
      scope: "read",
      createdAt: Date.now(),
    });

    return { token: plainToken };
  },
});

/**
 * List API tokens for a project the caller is a member of. Includes revoked
 * tokens for audit; the UI may filter them. Never includes the plain token
 * or the hash — those are stored internally only.
 */
export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!userId) return [];

    const project = await ctx.db.get("projects", args.projectId);
    if (!project || !project.teamId) return [];

    const membership = await getTeamMembership(ctx, project.teamId, userId);
    if (!membership) return [];

    const tokens = await ctx.db
      .query("apiTokens")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
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

    const project = await ctx.db.get("projects", token.projectId);
    if (!project || !project.teamId) throw new Error("Project not found");

    const membership = await getTeamMembership(ctx, project.teamId, userId);
    if (!membership) throw new Error("Not a member of this project's team");

    if (!token.revokedAt) {
      await ctx.db.patch("apiTokens", args.tokenId, { revokedAt: Date.now() });
    }
  },
});
