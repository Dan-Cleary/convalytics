import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/ingest",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    if (typeof body !== "object" || body === null) {
      return new Response("Invalid body", { status: 400 });
    }

    const {
      writeKey,
      name,
      userId, // External API uses "userId" for developer clarity
      sessionId,
      timestamp,
      props,
    } = body as Record<string, unknown>;

    if (
      typeof writeKey !== "string" ||
      typeof name !== "string" ||
      typeof userId !== "string" ||
      typeof sessionId !== "string" ||
      typeof timestamp !== "number"
    ) {
      return new Response(
        "Missing required fields: writeKey, name, userId, sessionId, timestamp",
        { status: 400 },
      );
    }

    // Validate write key
    const project = await ctx.runQuery(internal.projects.validateWriteKey, {
      writeKey,
    });
    if (!project) {
      return new Response("Invalid write key", { status: 401 });
    }

    // Clean props — only ASCII printable keys, scalar values
    // Convex record keys: nonempty, ASCII, must not start with $ or _
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

    // Internally we use "visitorId" to distinguish from dashboard users
    const visitorId = userId;

    if (name === "page_view") {
      await ctx.runMutation(internal.pageviews.ingest, {
        writeKey,
        visitorId,
        sessionId,
        timestamp,
        path: (typeof cleanProps.path === "string" ? cleanProps.path : "").slice(0, 500),
        referrer: (typeof cleanProps.referrer === "string" ? cleanProps.referrer : "").slice(0, 500),
        title: (typeof cleanProps.title === "string" ? cleanProps.title : "").slice(0, 200),
        utm_source: typeof cleanProps.utm_source === "string" ? cleanProps.utm_source : undefined,
        utm_medium: typeof cleanProps.utm_medium === "string" ? cleanProps.utm_medium : undefined,
        utm_campaign: typeof cleanProps.utm_campaign === "string" ? cleanProps.utm_campaign : undefined,
      });
    } else {
      await ctx.runMutation(internal.events.ingest, {
        writeKey,
        name,
        visitorId,
        sessionId,
        timestamp,
        props: cleanProps,
      });
    }

    return new Response(null, {
      status: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
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

  var visitorId = persist(localStorage,  '_cnv_uid');
  var sessionId = persist(sessionStorage, '_cnv_sid');

  function send(name, props) {
    try {
      var payload = JSON.stringify({
        writeKey: key, name: name,
        userId: visitorId, sessionId: sessionId,
        timestamp: Date.now(), props: props
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(endpoint, new Blob([payload], { type: 'application/json' }));
      } else {
        fetch(endpoint, { method: 'POST', body: payload,
          headers: { 'Content-Type': 'application/json' }, keepalive: true });
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
})();`;

http.route({
  path: "/script.js",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(TRACKING_SCRIPT, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }),
});

// Machine-readable setup instructions for AI agents (Claude Code, Cursor, etc.)
const LLMS_TXT = `# Convalytics

> Analytics for Convex apps. One script tag for web analytics. One npm package for server-side event tracking from mutations and actions.

## Web analytics (browser)

Add to <head> — tracks page views, sessions, bounce rate, referrers automatically:

    <script defer src="https://peaceful-bobcat-731.convex.site/script.js?key=WRITE_KEY"></script>

## Server-side tracking (Convex component)

Install the component for reliable server-side event tracking from mutations and actions.

### Install

    npm install @convalytics/convex

Or run the init CLI (recommended — handles all steps automatically):

    npx convalytics init

### Manual setup

1. convex/convex.config.ts — register the component:

    import { defineApp } from "convex/server";
    import analytics from "@convalytics/convex/convex.config";
    const app = defineApp();
    app.use(analytics);
    export default app;

2. convex/analytics.ts — create a singleton:

    import { components } from "./_generated/api";
    import { Convalytics } from "@convalytics/convex";
    export const analytics = new Convalytics(components.convalytics, {
      writeKey: process.env.CONVALYTICS_WRITE_KEY!,
    });

3. Set the environment variable:

    npx convex env set CONVALYTICS_WRITE_KEY your_write_key_here

4. Configure once (call this mutation once on deploy):

    import { internalMutation } from "./_generated/server";
    import { analytics } from "./analytics";
    export const setup = internalMutation({
      handler: async (ctx) => { await analytics.configure(ctx); },
    });

    npx convex run --prod setup

5. Track events from any mutation or action:

    await analytics.track(ctx, {
      name: "user_signed_up",
      userId: String(userId),
      props: { plan: "pro" },
    });

## Environment variables

    CONVALYTICS_WRITE_KEY=<your write key from the Convalytics dashboard>

## Verify

Events appear in the Convalytics dashboard under Custom Events within a few seconds.
Web page views appear under Overview and Pages.

## Get a write key

Sign in at https://convalytics.dev with your Convex account.
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

// CORS preflight for /ingest
http.route({
  path: "/ingest",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

export default http;
