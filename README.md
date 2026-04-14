# Convalytics

Web analytics and product event tracking built for [Convex](https://convex.dev) apps.

**Dashboard:** [convalytics.dev](https://convalytics.dev)

## What is Convalytics?

Convalytics gives Convex apps two things:

1. **Web analytics** — automatic page views, sessions, bounce rate, referrers, and device/browser breakdowns via a lightweight script tag.
2. **Product event tracking** — track signups, payments, feature usage, and any custom event directly from Convex mutations and actions. Server-side events can't be blocked by ad blockers.

Everything flows into a single dashboard. Projects auto-provision on first event — no account required to start tracking.

## Quick start

```bash
npx convalytics init
```

This auto-provisions a project, installs the Convex component, patches your config, sets environment variables, and inserts the browser script tag. Works with Cursor, Claude Code, and other AI coding agents out of the box.

## Packages

| Package | Description |
|---------|-------------|
| [`convalytics-dev`](https://www.npmjs.com/package/convalytics-dev) | Convex component for server-side event tracking |
| [`convalytics`](https://www.npmjs.com/package/convalytics) | CLI for zero-config project setup |

## Project structure

```
convalytics/
  convex/          # Convex backend — dashboard API, ingest, billing, auth
  src/             # React frontend — dashboard UI
  component/       # Convex component (published as convalytics-dev on npm)
  cli/             # CLI (published as convalytics on npm)
```

## Tech stack

- **Backend:** [Convex](https://convex.dev) — database, server functions, scheduled jobs, real-time queries
- **Frontend:** React 19, React Router v7, TailwindCSS v4, Vite, Recharts
- **Hosting:** Vercel (frontend), Convex Cloud (backend)
- **Billing:** Stripe (usage-based tiers)
- **Email:** Resend + React Email

## Development

```bash
npm install
npm run dev
```

This starts both the Vite frontend and `convex dev` in parallel.

## Links

- [Dashboard](https://convalytics.dev)
- [Component README](./component/README.md)
- [GitHub](https://github.com/Dan-Cleary/convalytics)
- [Twitter](https://x.com/DanJCleary)
