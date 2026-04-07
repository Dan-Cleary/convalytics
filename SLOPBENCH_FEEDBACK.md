# Feedback from SlopBench Integration

## Bugs

1. **Events table truncates userId** — long userIds (e.g. `google/gemini-3-flash-preview`) are cut off in the User column. Props column shows the full value fine, so it's a display-only issue.
2. **CORS blocks localhost for web analytics** — the browser script tag fires correctly in production but page views don't come through when running locally. The ingest endpoint needs to allow localhost origins for local dev testing.
3. **Cryptic error when track() called from a query** — was throwing `runMutation is not a function` instead of a clear message. (Already fixed in source with a proper console.warn — just needs a release.)

## DX Friction

1. **No browser-side track() for frontend events** — to track a UI click (e.g. model row click), you have to create a wrapper Convex mutation just to call analytics.track(). This feels heavyweight for pure client-side interactions. A browser SDK with a window.convalytics.track() or useTrack() React hook would make frontend event tracking much more natural.

## Bug

1. **Script tag doesn't expose `window.convalytics`** — the `send()` function exists inside the IIFE but is never attached to `window`. Calling `window.convalytics?.track()` silently does nothing. The fix is one line before the closing `})()`:

```js
window.convalytics = { track: send };
```

1. **CDN caching made the `window.convalytics` fix invisible** — after the script was updated, the old version was still being served due to Cloudflare caching. Had to add `&v=2` to the script tag URL to bust it. Worth thinking about a cache-busting strategy (versioned URL, short TTL, or cache-control headers) so script updates don't require manual intervention from app developers.
2. `**npx convex dev --once` regenerates types locally but the `_generated/` files didn't reflect new mutations** — spent time debugging why `api.runs.trackEvent` was undefined in the frontend. May be a timing or environment issue, but worth investigating.

## Feature Suggestion

**Add a browser-side track() API to the script tag.**

The script tag already loads on the page for web analytics. It should also expose a `window.convalytics.track()` method (or equivalent) for custom frontend events, so developers don't need to create a wrapper Convex mutation for every UI interaction.

Ideal DX:

```js
// No mutation needed — fires directly from the browser
convalytics.track("model_clicked", { model: "google/gemini-3-flash-preview" })
```

The server-side `analytics.track()` in mutations stays for backend events where transactional context matters. The browser SDK covers UI interactions. Two tools for two contexts — server-side for backend events, browser-side for frontend events.