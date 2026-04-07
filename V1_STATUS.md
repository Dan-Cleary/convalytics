# Convalytics — V1 Status

*Updated: 2026-04-07*

## What's working (verified)

- **Web analytics** — page views, sessions, bounce rate, referrers, UTM params
- **Server-side product events** — `analytics.track(ctx, {...})` from any Convex mutation or action
- **Browser-side product events** — `window.convalytics.track()` from any frontend click/interaction
- **Environment tagging** — dev vs prod filtering in dashboard works for both server-side and browser-side events
- **Agent setup flow** — CLI `init` provisions a project, installs the component, patches config, sets env vars, adds the script tag, installs SKILL.md
- **Idempotent provisioning** — running `init` twice on the same deployment returns the same project (deduped on `convexDeploymentSlug`)
- **Claim flow** — OAuth via Convex, auto-claims after redirect, goes straight to the claimed project's dashboard
- **Stale session handling** — clears bad session tokens gracefully instead of looping
- **User identity tracking** — `convalytics.identify()` links anonymous visitors to real users after sign-in; `convalytics.reset()` reverts on sign-out. Dashboard shows `userEmail` > `userName` > anonymous UUID.
- **Server-side `userEmail`/`userName`** — first-class fields on `analytics.track()` flow through to the dashboard User column
- **Multi-project dashboard** — tested with 2 projects (Slopbench + AgentStorage), project switcher and per-project event isolation work
- **Auth app integration** — tested end-to-end with AgentStorage (has user auth): sign-in triggers `identify()`, page views show email, server events pass `userEmail`, sign-out triggers `reset()` and reverts to anonymous

---

## Fixed during testing

- **TypeScript type mismatch** — `ConvalyticsComponent` declared `track` as `"public"` but Convex types component functions as `"internal"` from the parent app. Fixed in `component/src/index.ts`.
- **Claim redirects to wrong project** — after claiming, the dashboard was showing `projects[0]` (alphabetically first) instead of the newly claimed project. Fixed by passing `?project=WRITE_KEY` in the redirect URL.
- **Agent putting email in `props` instead of `userEmail`** — SKILL.md step 3 example didn't show `userEmail`. Updated the primary instrumentation example and added a bold callout. Added step 4 for wiring up `identify()`/`reset()` in auth apps.

---

## Remaining gaps before v1

### ~~1. Lost claim URL~~ -- FIXED
CLI now saves a `.convalytics` JSON file in the project root with the write key, claim URL, and deployment slug. `npx convalytics verify` reads from it as a fallback (no need to pass the write key) and prints the claim URL. File is auto-added to `.gitignore`.

### ~~2. `convexDeploymentSlug = "dev"` vs actual slug~~ -- FIXED
CLI now validates the deployment slug against the `word-word-number` pattern before setting `CONVALYTICS_DEPLOYMENT_NAME`. Prints a warning if it doesn't match but still sets it (soft warning, not a hard failure).

### 3. Production web analytics CORS
Verified from localhost but not smoke-tested from an actual deployed production URL. The CORS fix (reflecting the Origin header) should work but hasn't been proven in prod.

### 4. The `dist/` rebuild requirement
Any change to `component/src/` requires running `npm run build` in the component directory before it takes effect. Easy to forget. Once published to npm this goes away.

---

## Before publishing to npm

- [x] ~~Fix lost claim URL recovery~~ — `.convalytics` dotfile + verify fallback
- [ ] Smoke test production CORS from a deployed URL
- [x] ~~Decide on `CONVALYTICS_DEPLOYMENT_NAME` validation in CLI~~ — soft warning on invalid slug format
- [ ] Add `npm run build` to the `init` flow or document clearly
- [x] ~~Test real user tracking (auth app)~~ — verified with AgentStorage
- [x] ~~Test multi-project dashboard~~ — verified with 2 projects
- [x] ~~Add user identity tracking (identify/reset)~~ — shipped and verified

---

## Publishing

The component is at `component/` and needs to be published as `@convalytics/convex`. Until then, any instrumented app has a `file:../convalytics/component` dependency that breaks in production builds. Run `npm publish` from `component/` when ready — even a `0.1.0-alpha` is enough to unblock committing instrumented app code.
