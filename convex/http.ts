import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { registerStripeRoutes } from "./billing";
import {
  QUOTA_NOTIFY_THRESHOLDS,
  UNCLAIMED_PROJECTS_PER_IP_PER_HOUR,
} from "./plans";

const http = httpRouter();
const [QUOTA_NOTIFY_80_PCT, QUOTA_NOTIFY_100_PCT] = QUOTA_NOTIFY_THRESHOLDS;

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

    // Quota check — browser events (pageOrigin present, no deploymentName) are dropped
    // silently on over-quota to avoid breaking pages. Server-side gets a 402.
    const isBrowserEvent =
      typeof pageOrigin === "string" && pageOrigin && !deploymentName;
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

    // Fire quota notification if thresholds crossed (non-blocking)
    if (quota.teamId) {
      const usageBefore = quota.usageAfter - 1;
      const pctBefore = usageBefore / quota.limit;
      const pct = quota.usageAfter / quota.limit;
      const crossedThreshold =
        (pctBefore < QUOTA_NOTIFY_80_PCT && pct >= QUOTA_NOTIFY_80_PCT) ||
        (pctBefore < QUOTA_NOTIFY_100_PCT && pct >= QUOTA_NOTIFY_100_PCT);
      if (crossedThreshold) {
        void ctx.scheduler.runAfter(0, internal.notifications.checkAndNotify, {
          teamId: quota.teamId,
          usageAfter: quota.usageAfter,
          limit: quota.limit,
        });
      }
    }

    // Resolve environment: deployment name lookup for server-side events,
    // origin hostname for web analytics
    let environment: string | undefined;
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

> Full-stack analytics for Convex apps. No account needed — agent sets up everything, human claims later.

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

    // Quota check for the full batch
    const quota = await ctx.runMutation(internal.usage.checkAndIncrement, {
      writeKey,
      count: validCount,
    });
    if (!quota.allowed) {
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

    // Fire quota notification if thresholds crossed (non-blocking)
    if (quota.teamId) {
      const usageBefore = quota.usageAfter - validCount;
      const pctBefore = usageBefore / quota.limit;
      const pct = quota.usageAfter / quota.limit;
      const crossedThreshold =
        (pctBefore < QUOTA_NOTIFY_80_PCT && pct >= QUOTA_NOTIFY_80_PCT) ||
        (pctBefore < QUOTA_NOTIFY_100_PCT && pct >= QUOTA_NOTIFY_100_PCT);
      if (crossedThreshold) {
        void ctx.scheduler.runAfter(0, internal.notifications.checkAndNotify, {
          teamId: quota.teamId,
          usageAfter: quota.usageAfter,
          limit: quota.limit,
        });
      }
    }

    const eventsToInsert = valid
      .filter((v): v is ValidatedEvent => v.type === "event")
      .map(({ type: _, ...rest }) => rest);
    const pageviewsToInsert = valid
      .filter((v): v is ValidatedPageview => v.type === "pageview")
      .map(({ type: _, ...rest }) => rest);

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

registerStripeRoutes(http);

export default http;
