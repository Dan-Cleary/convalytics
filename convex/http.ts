import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { auth } from "./auth";
import { registerStripeRoutes } from "./billing";
import {
  QUOTA_NOTIFY_THRESHOLDS,
  UNCLAIMED_PROJECTS_PER_IP_PER_HOUR,
} from "./plans";
import { parseUA } from "./ua";
import { sha256Hex } from "./tokenHash";
import type { ValidatedApiToken } from "./apiTokens";

const http = httpRouter();

// Convex Auth: /api/auth/* routes (including Google OAuth callback)
auth.addHttpRoutes(http);
const [QUOTA_NOTIFY_80_PCT, QUOTA_NOTIFY_100_PCT] = QUOTA_NOTIFY_THRESHOLDS;

function isValidIpv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const value = Number(part);
    return value >= 0 && value <= 255;
  });
}

function isValidIpv6(ip: string): boolean {
  if (!ip.includes(":") || ip.includes(":::")) return false;
  if (ip.indexOf("::") !== ip.lastIndexOf("::")) return false;

  const [left = "", right = ""] = ip.split("::");
  const leftParts = left ? left.split(":") : [];
  const rightParts = right ? right.split(":") : [];
  const parts = [...leftParts, ...rightParts];

  let hasIpv4Tail = false;
  const lastPart = parts[parts.length - 1];
  if (lastPart?.includes(".")) {
    if (!isValidIpv4(lastPart)) return false;
    parts.pop();
    hasIpv4Tail = true;
  }

  if (!parts.every((part) => /^[0-9a-fA-F]{1,4}$/.test(part))) return false;
  const segmentCount = parts.length + (hasIpv4Tail ? 2 : 0);
  if (ip.includes("::")) return segmentCount < 8;
  return segmentCount === 8;
}

function isValidIp(ip: string): boolean {
  return isValidIpv4(ip) || isValidIpv6(ip);
}

async function getCountry(req: Request): Promise<string | undefined> {
  // Cloudflare sets this when the request flows through their edge — fast path.
  const cfCountry = req.headers.get("cf-ipcountry");
  if (cfCountry && cfCountry !== "XX") return cfCountry;

  // Fall back to IP geolocation using the request IP headers.
  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim();
  if (!ip || ip === "127.0.0.1" || ip === "::1" || !isValidIp(ip)) {
    return undefined;
  }

  try {
    const res = await fetch(`https://api.country.is/${ip}`, {
      signal: AbortSignal.timeout(500),
    });
    if (res.ok) {
      const data = (await res.json()) as { country?: string };
      return typeof data.country === "string" ? data.country : undefined;
    }
  } catch {
    // Lookup failed or timed out — country stays undefined.
  }
  return undefined;
}

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
  };
}

http.route({
  path: "/ingest",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const cors = corsHeaders(req);

    let body: unknown;
    try {
      const text = await req.text();
      body = JSON.parse(text);
    } catch {
      return new Response("Invalid JSON", { status: 400, headers: cors });
    }

    if (typeof body !== "object" || body === null) {
      return new Response("Invalid body", { status: 400, headers: cors });
    }

    const {
      writeKey,
      name,
      userId,
      sessionId,
      timestamp,
      props,
      deploymentName,
      pageOrigin,
      userEmail: rawUserEmail,
      userName: rawUserName,
    } = body as Record<string, unknown>;

    const userEmail =
      typeof rawUserEmail === "string" && rawUserEmail
        ? rawUserEmail.slice(0, 200)
        : undefined;
    const userName =
      typeof rawUserName === "string" && rawUserName
        ? rawUserName.slice(0, 200)
        : undefined;

    if (
      typeof writeKey !== "string" ||
      typeof name !== "string" ||
      typeof userId !== "string" ||
      typeof sessionId !== "string" ||
      typeof timestamp !== "number"
    ) {
      return new Response(
        "Missing required fields: writeKey, name, userId, sessionId, timestamp",
        { status: 400, headers: cors },
      );
    }

    const project = await ctx.runQuery(internal.projects.validateWriteKey, {
      writeKey,
    });
    if (!project) {
      return new Response("Invalid write key", { status: 401, headers: cors });
    }

    const rl = await ctx.runMutation(internal.rateLimit.check, {
      key: `ingest:${writeKey}`,
      limit: 1000,
    });
    if (!rl.allowed) {
      const retryAfter = Math.max(
        1,
        Math.ceil((rl.resetAt - Date.now()) / 1000),
      );
      return new Response(
        JSON.stringify({
          error: "rate_limit_exceeded",
          message:
            "Ingest rate limit exceeded (1000 events/min). Retry after reset.",
          retryAfter,
          resetAt: rl.resetAt,
        }),
        {
          status: 429,
          headers: {
            ...cors,
            "Content-Type": "application/json",
            "Retry-After": String(retryAfter),
          },
        },
      );
    }

    // Page views are free — only custom product events count against the monthly quota.
    // Browser events (pageOrigin present, no deploymentName) are dropped silently on
    // over-quota to avoid breaking pages. Server-side events get a 402.
    const isPageView = name === "page_view";
    const isBrowserEvent =
      typeof pageOrigin === "string" && pageOrigin && !deploymentName;

    // Capture notification args before ingest; fire after writes so a scheduler
    // failure can't consume quota without storing data.
    let quotaNotification: {
      teamId: Id<"teams">;
      usageAfter: number;
      limit: number;
    } | null = null;

    if (!isPageView) {
      const quota = await ctx.runMutation(internal.usage.checkAndIncrement, {
        writeKey,
        count: 1,
      });
      if (!quota.allowed) {
        if (isBrowserEvent) {
          return new Response(null, { status: 200, headers: cors });
        }
        return new Response(
          JSON.stringify({
            error: "quota_exceeded",
            message:
              "Monthly event quota exceeded. Upgrade your plan to continue tracking.",
            plan: quota.plan,
            limit: quota.limit,
          }),
          {
            status: 402,
            headers: { ...cors, "Content-Type": "application/json" },
          },
        );
      }

      if (quota.teamId) {
        const usageBefore = quota.usageAfter - 1;
        const pctBefore = usageBefore / quota.limit;
        const pct = quota.usageAfter / quota.limit;
        const crossedThreshold =
          (pctBefore < QUOTA_NOTIFY_80_PCT && pct >= QUOTA_NOTIFY_80_PCT) ||
          (pctBefore < QUOTA_NOTIFY_100_PCT && pct >= QUOTA_NOTIFY_100_PCT);
        if (crossedThreshold) {
          quotaNotification = {
            teamId: quota.teamId,
            usageAfter: quota.usageAfter,
            limit: quota.limit,
          };
        }
      }
    }

    // Resolve environment: deployment name lookup for server-side events,
    // origin hostname for web analytics
    let environment: string | undefined;
    let siteOrigin: string | null = null;
    if (typeof deploymentName === "string" && deploymentName) {
      const resolved: string | null = await ctx.runQuery(
        internal.deploymentTypes.resolve,
        { deploymentName },
      );
      environment = resolved ?? "development";
    } else {
      const origin =
        typeof pageOrigin === "string" && pageOrigin
          ? pageOrigin
          : (req.headers.get("Origin") ?? "");
      try {
        const hostname = new URL(origin).hostname;
        environment =
          hostname === "localhost" ||
          hostname === "127.0.0.1" ||
          hostname === "0.0.0.0"
            ? "development"
            : "production";
        if (environment === "production") siteOrigin = origin;
      } catch {
        environment = undefined;
      }
    }

    const cleanProps: Record<string, string | number | boolean> = {};
    if (typeof props === "object" && props !== null) {
      for (const [k, v] of Object.entries(props as Record<string, unknown>)) {
        if (
          k.length > 0 &&
          !k.startsWith("$") &&
          !k.startsWith("_") &&
          /^[\x21-\x7E]+$/.test(k) &&
          (typeof v === "string" ||
            typeof v === "number" ||
            typeof v === "boolean")
        ) {
          cleanProps[k] = v;
        }
      }
    }

    const visitorId = userId;

    if (name === "page_view") {
      const country = await getCountry(req);
      const ua = parseUA(req.headers.get("user-agent") ?? "");
      await ctx.runMutation(internal.pageviews.ingest, {
        writeKey,
        visitorId,
        sessionId,
        timestamp,
        environment,
        userEmail,
        userName,
        path: (typeof cleanProps.path === "string"
          ? cleanProps.path
          : ""
        ).slice(0, 500),
        referrer: (typeof cleanProps.referrer === "string"
          ? cleanProps.referrer
          : ""
        ).slice(0, 500),
        title: (typeof cleanProps.title === "string"
          ? cleanProps.title
          : ""
        ).slice(0, 200),
        utm_source:
          typeof cleanProps.utm_source === "string"
            ? cleanProps.utm_source
            : undefined,
        utm_medium:
          typeof cleanProps.utm_medium === "string"
            ? cleanProps.utm_medium
            : undefined,
        utm_campaign:
          typeof cleanProps.utm_campaign === "string"
            ? cleanProps.utm_campaign
            : undefined,
        country,
        deviceType: ua.deviceType,
        browser: ua.browser,
        osName: ua.osName,
      });
    } else {
      await ctx.runMutation(internal.events.ingest, {
        writeKey,
        name,
        visitorId,
        sessionId,
        timestamp,
        environment,
        userEmail,
        userName,
        props: cleanProps,
      });
    }

    if (siteOrigin && !project.siteUrl) {
      try {
        await ctx.runMutation(internal.projects.backfillSiteUrl, {
          projectId: project._id,
          siteUrl: siteOrigin,
        });
      } catch {
        // Non-fatal
      }
    }

    // Fire quota notification after ingest so a scheduler failure can't
    // consume quota without storing data.
    if (quotaNotification) {
      try {
        await ctx.scheduler.runAfter(
          0,
          internal.notifications.checkAndNotify,
          quotaNotification,
        );
      } catch {
        // Notification failures are non-fatal — data is already written.
      }
    }

    return new Response(null, { status: 200, headers: cors });
  }),
});

// Auto-tracking script — embed as <script src="...convex.site/script.js?key=WRITE_KEY">
// Note: The script uses "userId" in the payload for developer/API consistency.
// The server translates this to "visitorId" internally.
const TRACKING_SCRIPT = `(function(){
  var d = document, s = d.currentScript;
  if (!s) return;
  var u = new URL(s.src);
  var key = u.searchParams.get('key');
  var endpoint = u.origin + '/ingest';
  if (!key) return;

  function newId() {
    try { return crypto.randomUUID(); } catch(e) {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 3 | 8)).toString(16);
      });
    }
  }

  function persist(storage, k) {
    try {
      var v = storage.getItem(k);
      if (!v) { v = newId(); storage.setItem(k, v); }
      return v;
    } catch(e) { return newId(); }
  }

  var anonId = persist(localStorage,  '_cnv_uid');
  var sessionId = persist(sessionStorage, '_cnv_sid');

  function getIdentified() {
    try {
      var uid = localStorage.getItem('_cnv_identified_uid');
      if (!uid) return null;
      var traits = JSON.parse(localStorage.getItem('_cnv_traits') || 'null') || {};
      return { userId: uid, email: traits.email || undefined, name: traits.name || undefined };
    } catch(e) { return null; }
  }

  function send(name, props) {
    try {
      var id = getIdentified();
      var payload = {
        writeKey: key, name: name,
        userId: id ? id.userId : anonId, sessionId: sessionId,
        timestamp: Date.now(), props: props,
        pageOrigin: location.origin
      };
      if (id) {
        if (id.email) payload.userEmail = id.email;
        if (id.name) payload.userName = id.name;
      }
      var body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(endpoint, new Blob([body], { type: 'text/plain' }));
      } else {
        fetch(endpoint, { method: 'POST', body: body,
          headers: { 'Content-Type': 'text/plain' }, keepalive: true, mode: 'cors' });
      }
    } catch(e) {}
  }

  function getUtms() {
    var p = new URLSearchParams(location.search), r = {};
    ['utm_source','utm_medium','utm_campaign'].forEach(function(k) {
      if (p.get(k)) r[k] = p.get(k).slice(0, 100);
    });
    if (Object.keys(r).length) {
      try { sessionStorage.setItem('_cnv_utm', JSON.stringify(r)); } catch(e) {}
      return r;
    }
    try { return JSON.parse(sessionStorage.getItem('_cnv_utm') || 'null') || {}; } catch(e) { return {}; }
  }

  function pageview() {
    var utms = getUtms();
    var props = Object.assign({
      path: location.pathname.slice(0, 500),
      referrer: (d.referrer || '').slice(0, 500),
      title: (d.title || '').slice(0, 200)
    }, utms);
    send('page_view', props);
  }

  if (d.readyState === 'loading') {
    d.addEventListener('DOMContentLoaded', pageview);
  } else {
    pageview();
  }

  var origPush = history.pushState;
  history.pushState = function() { origPush.apply(this, arguments); pageview(); };
  window.addEventListener('popstate', pageview);

  window.convalytics = {
    track: function(name, props) {
      if (!name || typeof name !== 'string') return;
      send(name, props || {});
    },
    identify: function(userId, traits) {
      if (!userId || typeof userId !== 'string') return;
      try {
        var previousUid = localStorage.getItem('_cnv_identified_uid');
        localStorage.setItem('_cnv_identified_uid', userId);
        if (traits && typeof traits === 'object') {
          localStorage.setItem('_cnv_traits', JSON.stringify({
            email: traits.email || undefined,
            name: traits.name || undefined
          }));
        } else if (previousUid !== userId) {
          localStorage.removeItem('_cnv_traits');
        }
      } catch(e) {}
    },
    reset: function() {
      try {
        localStorage.removeItem('_cnv_identified_uid');
        localStorage.removeItem('_cnv_traits');
      } catch(e) {}
    }
  };
})();`;

http.route({
  path: "/script.js",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(TRACKING_SCRIPT, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "CDN-Cache-Control": "max-age=300",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }),
});

// Machine-readable setup instructions for AI agents (Claude Code, Cursor, etc.)
const LLMS_TXT = `# Convalytics

> Full-stack analytics for Convex apps. No account needed, agent sets up everything, human claims later.

Full product manual: https://convalytics.dev/llms-full.txt
OpenAPI spec: https://convalytics.dev/openapi.json
Pricing: https://convalytics.dev/pricing.md

## How it works

1. Run \`npx convalytics init\` — no write key needed, auto-provisions a project
2. CLI returns a claim URL — share it with the human to connect to their account
3. Agent reads convex/schema.ts and all mutations/actions to understand the data model
4. Agent proposes a tracking plan (event names, files, functions, props)
5. User approves → agent instruments the approved events
6. Run \`npx convalytics verify\` to confirm

Events flow immediately — no need to wait for claiming.

## Zero-config setup

    npx convalytics init

Auto-provisions a project, installs the SDK, patches config, sets the env var,
adds the browser script tag, and installs the agent skill file.

If the user already has a write key:

    npx convalytics init WRITE_KEY

## Event discovery

After install, read convex/schema.ts and every file in convex/. For each mutation/action
that represents a user action, propose an event:

- Event name: snake_case noun_verb (user_signed_up, payment_succeeded)
- File and function where it should be added
- Props to attach from existing args/data

Aim for 5-15 events covering the core user journey. Skip internal/admin functions.
Wait for user approval before instrumenting.

## Tracking

    import { analytics } from "./analytics";

    const identity = await ctx.auth.getUserIdentity();
    await analytics.track(ctx, {
      name: "user_signed_up",
      userId: String(userId),
      userEmail: identity?.email,  // first-class field — NOT in props
      props: { plan: "pro" },
    });

## Server-side track() API

    await analytics.track(ctx, {
      name: string,        // required
      userId: string,      // required — stable user ID
      userEmail?: string,  // optional — human-readable email for dashboard
      userName?: string,   // optional — human-readable name for dashboard
      sessionId?: string,  // optional
      timestamp?: number,  // optional — unix ms
      props?: Record<string, string | number | boolean>,
    });

Works from mutations and actions. Never throws.
When userEmail/userName is provided, the dashboard shows it instead of raw IDs.

## Browser-side track() API

The script tag also exposes window.convalytics.track() for frontend events:

    convalytics.track("button_clicked", { page: "settings", action: "save" })

No import needed — available globally once the script loads.
Uses the same visitor/session IDs as page views.

## User Identity (identify / reset)

For apps with auth, call identify() after sign-in so page views and events
show the real user instead of an anonymous UUID:

    convalytics.identify(userId, { email: "dan@example.com", name: "Dan" })

On sign-out, call reset() to revert to anonymous tracking:

    convalytics.reset()

Identity persists in localStorage across page reloads until reset() is called.
The dashboard shows email > name > anonymous ID with cascading priority.

## MCP server (read-only queries for AI assistants)

Once events are flowing, developers can query their analytics conversationally
via Claude Desktop, Claude Code, Cursor, Windsurf, or any MCP-capable client.

    POST https://api.convalytics.dev/mcp
    Authorization: Bearer cnv_...   # API token from /tokens

Nine read-only tools: list_projects, get_usage, top_pages, top_referrers,
pageviews_count, events_count, recent_events, weekly_digest (project summary
with period-over-period comparison), user_activity (per-user snapshot —
matches by userEmail or visitorId).

Gated to Solo+ plans. Tokens are team-scoped; each MCP tool takes an explicit
project argument. Full docs at https://convalytics.dev/mcp and
https://convalytics.dev/.well-known/mcp/server-card.json.

## Bulk Ingest API

For high-volume tracking (e.g. logging every step of an agent workflow), use the batch endpoint
to send up to 100 events in a single request. This reduces request-level overhead and latency
compared to sending individual requests. Each valid event in the batch still counts against the
1000 events/min quota, but batching helps avoid hitting per-request rate limits.

    POST /ingest/batch
    Body: {
      "writeKey": "wk_...",
      "events": [
        { "name": "step_started", "userId": "u1", "sessionId": "s1", "timestamp": 1234567890000, "props": { "step": "validate" } },
        { "name": "step_completed", "userId": "u1", "sessionId": "s1", "timestamp": 1234567891000 }
      ]
    }
    Response: {
      "accepted": 2,
      "rejected": 0,
      "results": [{ "status": "ok" }, { "status": "ok" }]
    }

- Max 100 events per request
- Write key is validated once for the whole batch
- Per-event results: status "ok" or "error" with an error message
- Rate limit is checked atomically for the full batch count
- page_view events in a batch are routed to the pageviews table automatically

## Rate Limits

All rate limit errors return JSON with machine-readable fields:

    {
      "error": "rate_limit_exceeded",
      "message": "...",
      "retryAfter": 42,      // seconds until reset
      "resetAt": 1234567890000  // unix ms
    }

The HTTP response also includes a standard Retry-After header (seconds).

## Authentication (for agents)

Convalytics uses a **public write key** as its sole API credential.

- Safe to ship in client code and public repos. Not a secret.
- Authorizes writes to exactly one project. Cannot read data.
- No OAuth, no bearer token, no scopes, no refresh flow.

Agent flow, no human-in-the-loop:

1. POST /api/provision (no auth) to get a fresh write key.
2. Use the write key immediately on POST /ingest, POST /ingest/batch, GET /verify.
3. Return the claimUrl to the human to link the project to their account later.

Where the key goes:

- POST /ingest, POST /ingest/batch: \`writeKey\` field in the JSON body
- GET /verify: ?writeKey=... query parameter
- Browser script: <script src="https://api.convalytics.dev/script.js?key=WRITE_KEY">

Invalid/revoked key returns 401. Valid key over quota returns 402 for server-side events; browser events silently drop over quota.

Dashboard access (for humans) uses Convex Auth with Google OAuth and is unrelated to the ingest API.

## Provision API (for programmatic setup)

    POST /api/provision
    Body: { "name": "my-project" }
    Response: { writeKey, claimUrl, claimToken, ingestUrl, scriptUrl }

Creates an unclaimed project. No auth required. Human claims via claimUrl later.

## Environment Tagging

Events are automatically tagged as "development" or "production":

- Server-side events: reads CONVALYTICS_DEPLOYMENT_NAME env var, resolves
  deployment type (dev → development, prod → production) via cached metadata.
- Browser-side events: script includes page origin in each payload (localhost → development).

The CLI sets CONVALYTICS_DEPLOYMENT_NAME automatically during init.

If events show under "All" but not under Dev/Prod filters, check:

    npx convex env list

Set it manually if missing:

    npx convex env set CONVALYTICS_DEPLOYMENT_NAME YOUR_DEPLOYMENT_SLUG

The deployment slug is from .env.local (e.g. "colorful-capybara-119").

## CLI

    npx convalytics init [write-key]    Full setup (auto-provisions if no key)
    npx convalytics verify [write-key]  Confirm pipeline works
    npx convalytics help               Show usage
`;

http.route({
  path: "/llms.txt",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(LLMS_TXT, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }),
});

// Lightweight health check for uptime monitors (BetterStack, UptimeRobot, etc.).
// Returns 200 if the Convex deployment is reachable and the DB responds.
// Never auths, never writes, never reveals internal state.
http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async (ctx) => {
    try {
      // Touch the DB with the cheapest possible query to confirm it's reachable.
      await ctx.runQuery(internal.health.ping, {});
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    } catch {
      return new Response(JSON.stringify({ status: "error" }), {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    }
  }),
});

// Agent-first: provision an unclaimed project without auth.
// Returns writeKey + claimUrl. Agent can start tracking immediately.
http.route({
  path: "/api/provision",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (typeof body !== "object" || body === null) {
      return new Response(JSON.stringify({ error: "Invalid body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Rate limit: 10 provisions per minute globally
    const rl = await ctx.runMutation(internal.rateLimit.check, {
      key: "provision:global",
      limit: 10,
    });
    if (!rl.allowed) {
      const retryAfter = Math.max(
        1,
        Math.ceil((rl.resetAt - Date.now()) / 1000),
      );
      return new Response(
        JSON.stringify({
          error: "rate_limit_exceeded",
          message: "Provision rate limit exceeded. Try again in a minute.",
          retryAfter,
          resetAt: rl.resetAt,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(retryAfter),
          },
        },
      );
    }

    // IP-based anti-abuse: max 5 unclaimed projects per IP per hour
    const ip =
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const ipAllowed = await ctx.runMutation(
      internal.usage.checkProvisionAbuse,
      {
        ip,
        limit: UNCLAIMED_PROJECTS_PER_IP_PER_HOUR,
      },
    );
    if (!ipAllowed) {
      return new Response(
        JSON.stringify({
          error: "provision_limit_exceeded",
          message:
            "Too many projects provisioned from this IP. Try again in an hour.",
        }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    }

    const { name, convexDeploymentSlug } = body as Record<string, unknown>;
    const projectName =
      typeof name === "string" && name.trim()
        ? name.trim().slice(0, 100)
        : "Untitled Project";

    const result = await ctx.runMutation(internal.projects.provision, {
      name: projectName,
      convexDeploymentSlug:
        typeof convexDeploymentSlug === "string" && convexDeploymentSlug.trim()
          ? convexDeploymentSlug.trim()
          : undefined,
    });

    const siteUrl = new URL(req.url).origin;
    const dashboardUrl =
      process.env.CONVALYTICS_DASHBOARD_URL ?? "https://convalytics.dev";

    return new Response(
      JSON.stringify({
        writeKey: result.writeKey,
        claimUrl: `${dashboardUrl}/claim/${result.claimToken}`,
        claimToken: result.claimToken,
        ingestUrl: `${siteUrl}/ingest`,
        scriptUrl: `${siteUrl}/script.js?key=${result.writeKey}`,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }),
});

http.route({
  path: "/api/provision",
  method: "OPTIONS",
  handler: httpAction(async (_, req) => {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(req),
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

const BATCH_MAX = 100;

// Bulk ingest — accepts up to 100 events in one request.
// Validates write key once, rate-limits by total event count, returns per-event results.
http.route({
  path: "/ingest/batch",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const cors = corsHeaders(req);

    let body: unknown;
    try {
      body = JSON.parse(await req.text());
    } catch {
      return new Response(
        JSON.stringify({ error: "invalid_json", message: "Invalid JSON" }),
        {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        },
      );
    }

    if (typeof body !== "object" || body === null) {
      return new Response(
        JSON.stringify({
          error: "invalid_body",
          message: "Body must be a JSON object",
        }),
        {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        },
      );
    }

    const { writeKey, events } = body as Record<string, unknown>;

    if (typeof writeKey !== "string") {
      return new Response(
        JSON.stringify({
          error: "missing_write_key",
          message: "writeKey is required",
        }),
        {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        },
      );
    }

    if (!Array.isArray(events)) {
      return new Response(
        JSON.stringify({
          error: "invalid_events",
          message: "events must be an array",
        }),
        {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        },
      );
    }

    if (events.length === 0) {
      return new Response(
        JSON.stringify({ accepted: 0, rejected: 0, results: [] }),
        {
          status: 200,
          headers: { ...cors, "Content-Type": "application/json" },
        },
      );
    }

    if (events.length > BATCH_MAX) {
      return new Response(
        JSON.stringify({
          error: "batch_too_large",
          message: `Batch size ${events.length} exceeds maximum of ${BATCH_MAX}`,
          maxBatchSize: BATCH_MAX,
        }),
        {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        },
      );
    }

    const project = await ctx.runQuery(internal.projects.validateWriteKey, {
      writeKey,
    });
    if (!project) {
      return new Response(
        JSON.stringify({
          error: "invalid_write_key",
          message: "Invalid write key",
        }),
        {
          status: 401,
          headers: { ...cors, "Content-Type": "application/json" },
        },
      );
    }

    // Validate each event and collect results
    type EventResult = { status: "ok" } | { status: "error"; error: string };
    const results: EventResult[] = [];
    type ValidatedEvent = {
      type: "event";
      writeKey: string;
      name: string;
      visitorId: string;
      sessionId: string;
      timestamp: number;
      environment?: string;
      userEmail?: string;
      userName?: string;
      props: Record<string, string | number | boolean>;
    };
    type ValidatedPageview = {
      type: "pageview";
      writeKey: string;
      visitorId: string;
      sessionId: string;
      timestamp: number;
      environment?: string;
      userEmail?: string;
      userName?: string;
      path: string;
      referrer: string;
      referrerHost: string;
      title: string;
      utm_source?: string;
      utm_medium?: string;
      utm_campaign?: string;
      country?: string;
      deviceType?: string;
      browser?: string;
      osName?: string;
    };
    const valid: Array<ValidatedEvent | ValidatedPageview> = [];

    // Cache environment resolutions within the batch to avoid redundant queries
    const envCache = new Map<string, string | undefined>();

    async function resolveEnv(
      deploymentName: string | undefined,
      pageOrigin: string | undefined,
      originHeader: string,
    ): Promise<string | undefined> {
      if (typeof deploymentName === "string" && deploymentName) {
        const cacheKey = `dn:${deploymentName}`;
        if (!envCache.has(cacheKey)) {
          const resolved: string | null = await ctx.runQuery(
            internal.deploymentTypes.resolve,
            { deploymentName },
          );
          envCache.set(cacheKey, resolved ?? "development");
        }
        return envCache.get(cacheKey);
      }
      const origin =
        typeof pageOrigin === "string" && pageOrigin
          ? pageOrigin
          : originHeader;
      const cacheKey = `origin:${origin}`;
      if (!envCache.has(cacheKey)) {
        try {
          const hostname = new URL(origin).hostname;
          envCache.set(
            cacheKey,
            hostname === "localhost" ||
              hostname === "127.0.0.1" ||
              hostname === "0.0.0.0"
              ? "development"
              : "production",
          );
        } catch {
          envCache.set(cacheKey, undefined);
        }
      }
      return envCache.get(cacheKey);
    }

    const originHeader = req.headers.get("Origin") ?? "";
    let batchCountry: string | undefined | null = null;
    let batchUA: ReturnType<typeof parseUA> | null = null;

    for (const raw of events) {
      if (typeof raw !== "object" || raw === null) {
        results.push({ status: "error", error: "event must be an object" });
        continue;
      }
      const e = raw as Record<string, unknown>;
      const {
        name,
        userId,
        sessionId,
        timestamp,
        props,
        deploymentName,
        pageOrigin,
        userEmail: rawEmail,
        userName: rawName,
      } = e;

      if (typeof name !== "string" || !name) {
        results.push({
          status: "error",
          error: "missing required field: name",
        });
        continue;
      }
      if (typeof userId !== "string" || !userId) {
        results.push({
          status: "error",
          error: "missing required field: userId",
        });
        continue;
      }
      if (typeof sessionId !== "string" || !sessionId) {
        results.push({
          status: "error",
          error: "missing required field: sessionId",
        });
        continue;
      }
      if (typeof timestamp !== "number") {
        results.push({
          status: "error",
          error: "missing required field: timestamp (number)",
        });
        continue;
      }

      const userEmail =
        typeof rawEmail === "string" && rawEmail
          ? rawEmail.slice(0, 200)
          : undefined;
      const userName =
        typeof rawName === "string" && rawName
          ? rawName.slice(0, 200)
          : undefined;

      const cleanProps: Record<string, string | number | boolean> = {};
      if (typeof props === "object" && props !== null) {
        for (const [k, v] of Object.entries(props as Record<string, unknown>)) {
          if (
            k.length > 0 &&
            !k.startsWith("$") &&
            !k.startsWith("_") &&
            /^[\x21-\x7E]+$/.test(k) &&
            (typeof v === "string" ||
              typeof v === "number" ||
              typeof v === "boolean")
          ) {
            cleanProps[k] = v;
          }
        }
      }

      const environment = await resolveEnv(
        typeof deploymentName === "string" ? deploymentName : undefined,
        typeof pageOrigin === "string" ? pageOrigin : undefined,
        originHeader,
      );

      if (name === "page_view") {
        if (batchCountry === null || batchUA === null) {
          batchCountry = await getCountry(req);
          batchUA = parseUA(req.headers.get("user-agent") ?? "");
        }
        let referrerHost = "";
        const referrer = (
          typeof cleanProps.referrer === "string" ? cleanProps.referrer : ""
        ).slice(0, 500);
        if (referrer) {
          try {
            referrerHost = new URL(referrer).hostname.slice(0, 200);
          } catch {
            /* ignore */
          }
        }
        valid.push({
          type: "pageview",
          writeKey,
          visitorId: userId,
          sessionId,
          timestamp,
          environment,
          userEmail,
          userName,
          path: (typeof cleanProps.path === "string"
            ? cleanProps.path
            : ""
          ).slice(0, 500),
          referrer,
          referrerHost,
          title: (typeof cleanProps.title === "string"
            ? cleanProps.title
            : ""
          ).slice(0, 200),
          utm_source:
            typeof cleanProps.utm_source === "string"
              ? cleanProps.utm_source
              : undefined,
          utm_medium:
            typeof cleanProps.utm_medium === "string"
              ? cleanProps.utm_medium
              : undefined,
          utm_campaign:
            typeof cleanProps.utm_campaign === "string"
              ? cleanProps.utm_campaign
              : undefined,
          country: batchCountry,
          deviceType: batchUA.deviceType,
          browser: batchUA.browser,
          osName: batchUA.osName,
        });
      } else {
        valid.push({
          type: "event",
          writeKey,
          name,
          visitorId: userId,
          sessionId,
          timestamp,
          environment,
          userEmail,
          userName,
          props: cleanProps,
        });
      }
      results.push({ status: "ok" });
    }

    const validCount = valid.length;
    if (validCount === 0) {
      return new Response(
        JSON.stringify({ accepted: 0, rejected: results.length, results }),
        {
          status: 200,
          headers: { ...cors, "Content-Type": "application/json" },
        },
      );
    }

    const rl = await ctx.runMutation(internal.rateLimit.check, {
      key: `ingest:${writeKey}`,
      limit: 1000,
      count: validCount,
    });
    if (!rl.allowed) {
      const retryAfter = Math.max(
        1,
        Math.ceil((rl.resetAt - Date.now()) / 1000),
      );
      return new Response(
        JSON.stringify({
          error: "rate_limit_exceeded",
          message: `Rate limit exceeded. Batch of ${validCount} would exceed 1000 events/min. Only ${rl.remaining} slots remaining.`,
          retryAfter,
          resetAt: rl.resetAt,
          remaining: rl.remaining,
        }),
        {
          status: 429,
          headers: {
            ...cors,
            "Content-Type": "application/json",
            "Retry-After": String(retryAfter),
          },
        },
      );
    }

    const eventsToInsert = valid
      .filter((v): v is ValidatedEvent => v.type === "event")
      .map(({ type: _, ...rest }) => rest);
    const pageviewsToInsert = valid
      .filter((v): v is ValidatedPageview => v.type === "pageview")
      .map(({ type: _, ...rest }) => rest);

    // Page views are free — only count custom product events against the monthly quota.
    const productEventCount = eventsToInsert.length;
    let batchQuotaNotification: {
      teamId: Id<"teams">;
      usageAfter: number;
      limit: number;
    } | null = null;

    if (productEventCount > 0) {
      const quota = await ctx.runMutation(internal.usage.checkAndIncrement, {
        writeKey,
        count: productEventCount,
      });
      if (!quota.allowed) {
        // Keep free page views even when paid product events are over quota.
        if (pageviewsToInsert.length > 0) {
          await ctx.runMutation(internal.pageviews.ingestBatch, {
            pageviews: pageviewsToInsert,
          });
        }
        return new Response(
          JSON.stringify({
            error: "quota_exceeded",
            message:
              "Monthly event quota exceeded. Upgrade your plan to continue tracking.",
            plan: quota.plan,
            limit: quota.limit,
            partialIngest: pageviewsToInsert.length > 0,
            acceptedPageviews: pageviewsToInsert.length,
            rejectedProductEvents: productEventCount,
          }),
          {
            status: 402,
            headers: { ...cors, "Content-Type": "application/json" },
          },
        );
      }

      if (quota.teamId) {
        const usageBefore = quota.usageAfter - productEventCount;
        const pctBefore = usageBefore / quota.limit;
        const pct = quota.usageAfter / quota.limit;
        const crossedThreshold =
          (pctBefore < QUOTA_NOTIFY_80_PCT && pct >= QUOTA_NOTIFY_80_PCT) ||
          (pctBefore < QUOTA_NOTIFY_100_PCT && pct >= QUOTA_NOTIFY_100_PCT);
        if (crossedThreshold) {
          batchQuotaNotification = {
            teamId: quota.teamId,
            usageAfter: quota.usageAfter,
            limit: quota.limit,
          };
        }
      }
    }

    if (eventsToInsert.length > 0) {
      await ctx.runMutation(internal.events.ingestBatch, {
        events: eventsToInsert,
      });
    }
    if (pageviewsToInsert.length > 0) {
      await ctx.runMutation(internal.pageviews.ingestBatch, {
        pageviews: pageviewsToInsert,
      });
    }

    if (!project.siteUrl) {
      const productionOrigin = valid.find((e) => e.environment === "production")
        ? originHeader
        : null;
      if (productionOrigin) {
        try {
          await ctx.runMutation(internal.projects.backfillSiteUrl, {
            projectId: project._id,
            siteUrl: productionOrigin,
          });
        } catch {
          // Non-fatal
        }
      }
    }

    // Fire quota notification after ingest so a scheduler failure can't
    // consume quota without storing data.
    if (batchQuotaNotification) {
      try {
        await ctx.scheduler.runAfter(
          0,
          internal.notifications.checkAndNotify,
          batchQuotaNotification,
        );
      } catch {
        // Notification failures are non-fatal — data is already written.
      }
    }

    const rejected = results.filter((r) => r.status === "error").length;
    return new Response(
      JSON.stringify({ accepted: validCount, rejected, results }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }),
});

http.route({
  path: "/ingest/batch",
  method: "OPTIONS",
  handler: httpAction(async (_, req) => {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(req),
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

// CORS preflight for /ingest
http.route({
  path: "/ingest",
  method: "OPTIONS",
  handler: httpAction(async (_, req) => {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(req),
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

// Public verify endpoint — authenticates via writeKey (the same public
// identifier used for ingest) and returns a snapshot of recent activity so
// `npx convalytics verify` can confirm events are actually landing.
http.route({
  path: "/verify",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const cors = corsHeaders(req);
    const url = new URL(req.url);
    const writeKey = url.searchParams.get("writeKey") ?? "";

    if (!writeKey) {
      return new Response(
        JSON.stringify({ error: "missing_writeKey" }),
        {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        },
      );
    }

    const project = await ctx.runQuery(internal.projects.validateWriteKey, {
      writeKey,
    });
    if (!project) {
      return new Response(
        JSON.stringify({ error: "invalid_writeKey" }),
        {
          status: 401,
          headers: { ...cors, "Content-Type": "application/json" },
        },
      );
    }

    const stats = await ctx.runQuery(internal.events.verifyStats, {
      writeKey,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        project: {
          name: project.name,
          claimed: project.claimed ?? false,
        },
        ...stats,
      }),
      {
        status: 200,
        headers: {
          ...cors,
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  }),
});

http.route({
  path: "/verify",
  method: "OPTIONS",
  handler: httpAction(async (_, req) => {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(req),
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

registerStripeRoutes(http);

// MCP (Model Context Protocol) remote server. Read-only analytics tools for
// MCP-capable AI assistants. Gated to Solo+ plans; Free teams receive 402.
// Rate-limited per team so a user can't bypass the cap by minting tokens.

const MCP_PROTOCOL_VERSION = "2025-06-18";
const MCP_SERVER_NAME = "convalytics";
const MCP_SERVER_VERSION = "1.0.0";
const MCP_RATE_LIMIT_PER_MIN = 120;

const MCP_TOOLS = [
  {
    name: "list_projects",
    description:
      "List all Convalytics projects on the team this token belongs to. Useful when the agent needs to confirm the project it's querying against. No arguments.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_usage",
    description:
      "Return the current month's custom-event usage, monthly quota, retention days, and plan name for the team.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "top_pages",
    description:
      "Return the top pages for a specific project, ranked by views in a time window. Default window is the last 7 days. Use list_projects first if you don't know the project name. Returns path, views, uniqueVisitors, and percentage of total views for each page. Pass `user` to see pages a specific visitor hit.",
    inputSchema: {
      type: "object",
      properties: {
        project: {
          type: "string",
          description:
            "Project name (case-insensitive, e.g. 'slopbench') or project id from list_projects.",
        },
        since: {
          type: "number",
          description:
            "Start of window as unix milliseconds. Defaults to 7 days ago.",
        },
        until: {
          type: "number",
          description: "End of window as unix milliseconds. Defaults to now.",
        },
        limit: {
          type: "number",
          description: "Maximum number of pages to return. Default 20, max 50.",
        },
        user: {
          type: "string",
          description:
            "Optional. Filter to a single visitor. Accepts userEmail (case-insensitive) or visitorId (exact). For a full per-user snapshot prefer user_activity.",
        },
      },
      required: ["project"],
      additionalProperties: false,
    },
  },
  {
    name: "top_referrers",
    description:
      "Return the top referring hosts for a specific project, ranked by visit count in a time window. Includes '(direct)' for visits with no referrer. Default window is the last 7 days.",
    inputSchema: {
      type: "object",
      properties: {
        project: {
          type: "string",
          description:
            "Project name (case-insensitive) or project id from list_projects.",
        },
        since: { type: "number" },
        until: { type: "number" },
        limit: {
          type: "number",
          description: "Maximum number of referrers to return. Default 10, max 50.",
        },
      },
      required: ["project"],
      additionalProperties: false,
    },
  },
  {
    name: "pageviews_count",
    description:
      "Count page views for a specific project in a time window. Page views are the automatic hits captured by the browser script tag (separate from custom events). Use this for web-traffic questions like 'how many pageviews in the last 24 hours'. Default window is the last 7 days. Pass `user` to scope to one visitor.",
    inputSchema: {
      type: "object",
      properties: {
        project: {
          type: "string",
          description:
            "Project name (case-insensitive) or project id from list_projects.",
        },
        since: { type: "number" },
        until: { type: "number" },
        user: {
          type: "string",
          description:
            "Optional. Filter to one visitor. Accepts userEmail (case-insensitive) or visitorId (exact).",
        },
      },
      required: ["project"],
      additionalProperties: false,
    },
  },
  {
    name: "events_count",
    description:
      "Count CUSTOM PRODUCT events for a specific project in a time window, optionally filtered to one event name and/or one user. Custom events are emitted by explicit analytics.track() calls in app code (signup_completed, payment_succeeded, etc.). This does NOT count page views — use pageviews_count or weekly_digest for those. Returns count, unique visitors, and a `truncated` flag if the scan hit the maximum scan size.",
    inputSchema: {
      type: "object",
      properties: {
        project: {
          type: "string",
          description:
            "Project name (case-insensitive) or project id from list_projects.",
        },
        name: {
          type: "string",
          description:
            "Optional event name to filter by (e.g. 'signup_completed'). If omitted, counts all custom events in the window. Do NOT pass 'page_view' here — page views are in a separate table.",
        },
        since: { type: "number" },
        until: { type: "number" },
        user: {
          type: "string",
          description:
            "Optional. Filter to a single user. Accepts userEmail (case-insensitive) or visitorId (exact). Combine with `name` to count a specific event by a specific user.",
        },
      },
      required: ["project"],
      additionalProperties: false,
    },
  },
  {
    name: "recent_events",
    description:
      "Return the most recent custom events for a specific project, optionally filtered to one event name and/or one user. PII (userEmail, userName, props) is redacted by default; pass redact: false to include them.",
    inputSchema: {
      type: "object",
      properties: {
        project: {
          type: "string",
          description:
            "Project name (case-insensitive) or project id from list_projects.",
        },
        name: { type: "string" },
        limit: {
          type: "number",
          description: "Maximum number of events to return. Default 20, max 100.",
        },
        redact: {
          type: "boolean",
          description:
            "If true (default), userEmail/userName are null and props is {}. Set to false to include them.",
        },
        user: {
          type: "string",
          description:
            "Optional. Filter to one user. Accepts userEmail (case-insensitive) or visitorId (exact).",
        },
      },
      required: ["project"],
      additionalProperties: false,
    },
  },
  {
    name: "user_activity",
    description:
      "Composite snapshot of a specific user's activity on a project. Returns an identity block (visitorId, userEmail, userName, firstSeen, lastSeen), total pageviews, total custom events, session count, top pages this user visited, their most-fired event names, and their 20 most recent events with props. Use this for 'how is dancleary54@gmail.com using my app?' style questions — one call, full picture. For ad-hoc drill-down (just a count, just recent events) pass `user` to the individual tools instead. Default window is the last 7 days.",
    inputSchema: {
      type: "object",
      properties: {
        project: {
          type: "string",
          description:
            "Project name (case-insensitive) or project id from list_projects.",
        },
        user: {
          type: "string",
          description:
            "User identifier. Accepts userEmail (case-insensitive, e.g. 'dan@example.com') or visitorId (the exact string passed as userId on the original track() call).",
        },
        since: { type: "number" },
        until: { type: "number" },
      },
      required: ["project", "user"],
      additionalProperties: false,
    },
  },
  {
    name: "weekly_digest",
    description:
      "Composite snapshot of a project's web analytics over a lookback window. Returns unique visitors, pageviews, sessions, bounce rate, average session duration, top 5 pages, top 5 referrers, total custom events, and top 5 event names. Includes period-over-period comparison against the prior equal-length window unless compare: false. Prefer this over chaining top_pages + top_referrers + events_count when the agent just wants to report on the week.",
    inputSchema: {
      type: "object",
      properties: {
        project: {
          type: "string",
          description:
            "Project name (case-insensitive) or project id from list_projects.",
        },
        days: {
          type: "number",
          description:
            "Lookback window in days, 1 to 90. Default 7.",
        },
        compare: {
          type: "boolean",
          description:
            "Include period-over-period comparison against the prior equal-length window. Default true. Set false for faster response when only current numbers matter.",
        },
      },
      required: ["project"],
      additionalProperties: false,
    },
  },
] as const;

function jsonRpcResponse(
  id: number | string | null,
  result: unknown,
  cors: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id, result }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
  );
}

function jsonRpcError(
  id: number | string | null,
  code: number,
  message: string,
  cors: Record<string, string>,
  data?: unknown,
): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: { code, message, ...(data !== undefined ? { data } : {}) },
    }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
  );
}

function toolResult(content: unknown) {
  return {
    content: [
      { type: "text", text: JSON.stringify(content, null, 2) },
    ],
  };
}

http.route({
  path: "/mcp",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const cors = corsHeaders(req);

    // Parse the JSON-RPC request early so we can route public discovery
    // methods (initialize, tools/list, ping) without requiring auth. That
    // matches how most remote MCP servers behave (PostHog, Linear, etc.)
    // and keeps registry scanners like Smithery from chasing an OAuth
    // discovery path just to see the tool list.
    let payload: {
      jsonrpc?: unknown;
      id?: unknown;
      method?: unknown;
      params?: unknown;
    };
    try {
      const text = await req.text();
      payload = JSON.parse(text) as typeof payload;
    } catch {
      return jsonRpcError(null, -32700, "Parse error", cors);
    }

    const id =
      typeof payload.id === "number" ||
      typeof payload.id === "string" ||
      payload.id === null
        ? payload.id
        : null;

    if (payload.jsonrpc !== "2.0" || typeof payload.method !== "string") {
      return jsonRpcError(id, -32600, "Invalid Request", cors);
    }

    const method = payload.method;
    const params = (payload.params ?? {}) as Record<string, unknown>;

    // Public discovery — no auth required.
    if (method === "initialize") {
      return jsonRpcResponse(
        id,
        {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: {
            name: MCP_SERVER_NAME,
            version: MCP_SERVER_VERSION,
          },
        },
        cors,
      );
    }
    if (method === "notifications/initialized" || method === "notifications/cancelled") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (method === "ping") {
      return jsonRpcResponse(id, {}, cors);
    }
    if (method === "tools/list") {
      return jsonRpcResponse(id, { tools: MCP_TOOLS }, cors);
    }

    // Everything else (tools/call, and any future auth'd method) requires
    // a token + plan + rate-limit budget.

    // Accept either `Bearer cnv_...` (what Claude Code/Desktop/Cursor emit
    // by convention) or a bare `cnv_...` (what the Smithery gateway
    // forwards — its simple header-pass-through doesn't template a prefix).
    const authHeader = (req.headers.get("Authorization") ?? "").trim();
    const bearer = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : authHeader.startsWith("cnv_")
        ? authHeader
        : "";
    if (!bearer) {
      return jsonRpcError(
        id,
        -32001,
        "Authentication required. Send your Convalytics API token in the Authorization header: 'Bearer cnv_...' or bare 'cnv_...'. Create a token at https://convalytics.dev/tokens.",
        cors,
      );
    }

    const tokenHash = await sha256Hex(bearer);
    const ctxToken = await ctx.runQuery(internal.apiTokens.validate, {
      tokenHash,
    });
    if (!ctxToken) {
      return jsonRpcError(
        id,
        -32001,
        "Token is invalid or has been revoked. Create a new one at https://convalytics.dev/tokens.",
        cors,
      );
    }

    if (ctxToken.plan === "free") {
      return new Response(
        JSON.stringify({
          error: "plan_required",
          message:
            "Convalytics MCP requires the Solo plan or higher. Upgrade at https://convalytics.dev/billing.",
          plan: ctxToken.plan,
          required_plans: ["solo", "pro"],
        }),
        {
          status: 402,
          headers: { ...cors, "Content-Type": "application/json" },
        },
      );
    }

    // Keyed on teamId, not tokenId — a team shouldn't be able to multiply
    // its effective rate limit by creating more tokens.
    const rl = await ctx.runMutation(internal.rateLimit.check, {
      key: `mcp:${ctxToken.teamId}`,
      limit: MCP_RATE_LIMIT_PER_MIN,
    });
    if (!rl.allowed) {
      const retryAfter = Math.max(
        1,
        Math.ceil((rl.resetAt - Date.now()) / 1000),
      );
      return new Response(
        JSON.stringify({
          error: "rate_limit_exceeded",
          message: `MCP rate limit exceeded (${MCP_RATE_LIMIT_PER_MIN} requests/min). Retry after reset.`,
          retryAfter,
          resetAt: rl.resetAt,
        }),
        {
          status: 429,
          headers: {
            ...cors,
            "Content-Type": "application/json",
            "Retry-After": String(retryAfter),
          },
        },
      );
    }

    // initialize / tools/list / ping / notifications are handled earlier,
    // pre-auth. We only reach here for tools/call (and any future method
    // that requires the token + plan + rate-limit budget).
    let response: Response;
    switch (method) {
      case "tools/call": {
        const toolName = typeof params.name === "string" ? params.name : null;
        const toolArgs = (params.arguments ?? {}) as Record<string, unknown>;
        if (!toolName) {
          response = jsonRpcError(
            id,
            -32602,
            "Missing tool name in params.name",
            cors,
          );
          break;
        }
        try {
          const result = await dispatchTool(ctx, ctxToken, toolName, toolArgs);
          response = jsonRpcResponse(id, toolResult(result), cors);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          response = jsonRpcError(id, -32602, msg, cors);
        }
        break;
      }
      default: {
        response = jsonRpcError(
          id,
          -32601,
          `Method not found: ${method}`,
          cors,
        );
      }
    }

    // Fire-and-forget update of lastUsedAt so the dashboard "last used" column
    // reflects real usage without blocking the response.
    void ctx.runMutation(internal.apiTokens.touchLastUsed, {
      tokenId: ctxToken.tokenId,
    });

    return response;
  }),
});

http.route({
  path: "/mcp",
  method: "OPTIONS",
  handler: httpAction(async (_, req) => {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(req),
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }),
});

async function dispatchTool(
  ctx: ActionCtx,
  token: ValidatedApiToken,
  name: string,
  args: Record<string, unknown>,
) {
  switch (name) {
    case "list_projects":
      return ctx.runQuery(internal.mcp.listProjects, { teamId: token.teamId });
    case "get_usage":
      return ctx.runQuery(internal.mcp.getUsage, { teamId: token.teamId });
    case "top_pages": {
      const { writeKey } = await resolveProject(ctx, token.teamId, args);
      return ctx.runQuery(internal.mcp.topPages, {
        writeKey,
        since: numOrUndefined(args.since),
        until: numOrUndefined(args.until),
        limit: numOrUndefined(args.limit),
        user: strOrUndefined(args.user),
      });
    }
    case "top_referrers": {
      const { writeKey } = await resolveProject(ctx, token.teamId, args);
      return ctx.runQuery(internal.mcp.topReferrers, {
        writeKey,
        since: numOrUndefined(args.since),
        until: numOrUndefined(args.until),
        limit: numOrUndefined(args.limit),
      });
    }
    case "events_count": {
      const { writeKey } = await resolveProject(ctx, token.teamId, args);
      return ctx.runQuery(internal.mcp.eventsCount, {
        writeKey,
        name: strOrUndefined(args.name),
        since: numOrUndefined(args.since),
        until: numOrUndefined(args.until),
        user: strOrUndefined(args.user),
      });
    }
    case "pageviews_count": {
      const { writeKey } = await resolveProject(ctx, token.teamId, args);
      return ctx.runQuery(internal.mcp.pageviewsCount, {
        writeKey,
        since: numOrUndefined(args.since),
        until: numOrUndefined(args.until),
        user: strOrUndefined(args.user),
      });
    }
    case "recent_events": {
      const { writeKey } = await resolveProject(ctx, token.teamId, args);
      return ctx.runQuery(internal.mcp.recentEvents, {
        writeKey,
        name: strOrUndefined(args.name),
        limit: numOrUndefined(args.limit),
        redact: typeof args.redact === "boolean" ? args.redact : undefined,
        user: strOrUndefined(args.user),
      });
    }
    case "user_activity": {
      const { writeKey } = await resolveProject(ctx, token.teamId, args);
      const user = strOrUndefined(args.user);
      if (!user) {
        throw new Error(
          "Missing required parameter: user. Pass an email (case-insensitive) or a visitorId.",
        );
      }
      return ctx.runQuery(internal.mcp.userActivity, {
        writeKey,
        user,
        since: numOrUndefined(args.since),
        until: numOrUndefined(args.until),
      });
    }
    case "weekly_digest": {
      const { writeKey } = await resolveProject(ctx, token.teamId, args);
      return ctx.runQuery(internal.mcp.weeklyDigest, {
        writeKey,
        days: numOrUndefined(args.days),
        compare: typeof args.compare === "boolean" ? args.compare : undefined,
      });
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function resolveProject(
  ctx: ActionCtx,
  teamId: ValidatedApiToken["teamId"],
  args: Record<string, unknown>,
): Promise<{ writeKey: string }> {
  const project = strOrUndefined(args.project);
  if (!project) {
    throw new Error(
      "Missing required parameter: project. Call list_projects to see available projects, then pass the name or id.",
    );
  }
  return ctx.runQuery(internal.mcp.resolveProject, { teamId, project });
}

function numOrUndefined(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function strOrUndefined(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export default http;
