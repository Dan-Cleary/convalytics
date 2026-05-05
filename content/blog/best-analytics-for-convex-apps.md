---
title: The best analytics for Convex apps in 2026
description: PostHog, Plausible, GA4, and Convalytics compared on the things that actually matter for a Convex app — setup time, server-side events, free tier, and whether the tool understands your stack.
date: 2026-05-05
tags: convex, analytics, comparison
heroImage: /blog/best-analytics-hero.jpg
---

I shipped four Convex apps in the last year. Three of them I tried to set up product analytics on. Two of them I gave up halfway through because the analytics tool didn't fit.

That experience is what got me to build [Convalytics](https://convalytics.dev). But before I did, I actually tried the alternatives. So this post is what I'd tell you if you asked me, "what should I use for analytics on my Convex app?"

The honest answer is: it depends on what you're tracking and how much time you want to spend.

## The criteria that actually matter for Convex apps

Most analytics comparisons rank tools on data warehousing, governance, RBAC, and dashboard depth. None of that matters for the Convex projects I see. What matters:

- **Setup time.** How long from `npm install` to seeing your first event in a dashboard.
- **Server-side events from Convex.** Mutations and actions are where the interesting events live (`signup_completed`, `payment_succeeded`, `feature_used`). Can the tool ingest those without you writing a glue layer?
- **Page views without leaking your write key.** Most tools want a script tag with the API key in the bundle. Convex apps care about this more than you'd think.
- **Free tier you can ship on.** Most Convex apps have under 10k users. The free tier needs to cover that.
- **Agent-friendly.** Can Claude, Cursor, or Windsurf query the data via MCP without you exporting CSVs?

Now the tools.

## PostHog

PostHog is the heavy hitter. It does session replay, feature flags, A/B tests, surveys, error tracking, and product analytics. If you're a 30-person company, this is probably what you want.

For a Convex app you're shipping solo, it's overkill. The setup takes a couple of hours. The free tier (1M events/mo) is generous, but the ramp-up is steep. There's no Convex-native integration, so server-side events get sent via the Node SDK from a Convex action you write yourself.

The dashboard is excellent if you live in it daily. It's a lot if you check analytics once a week.

**Best for:** teams shipping a real product who need session replay or feature flags too.
**Skip if:** you wanted "page views and signups" and got pulled into a 200-page docs site.

## Plausible

Plausible is the privacy-first lightweight one. EU-hosted, no cookies, GDPR-friendly out of the box. Page views land in five minutes.

The thing is, that's all it does. There's no concept of a custom event with structured properties. You can't ask "how many users on the Pro plan signed up via the /vs-postgres referrer last week?" because Plausible doesn't model that.

For a marketing site, Plausible is great. For a product, you're building two systems — Plausible for the marketing pages, something else for the app.

**Best for:** the marketing site portion of your project, or apps where you only care about traffic.
**Skip if:** you want to track product events.

## Google Analytics 4

GA4 is free. That's the case for it.

The case against: the UI is hostile, the data model is not what you think it is (events are renamed at ingest, retention defaults to 2 months), and "real-time" is 24-hour delayed in practice. Server-side events go through the Measurement Protocol, which is documented but unloved.

For a Convex app, the integration is roughly the same effort as PostHog with a worse outcome.

**Best for:** stakeholders who specifically asked for GA4.
**Skip if:** anyone else is making the call.

## Convalytics

Disclosure: I built this. Skip to the next section if you want.

Convalytics is built specifically for Convex apps. The browser script tag captures page views without a write key in the bundle. There's a Convex backend component you `npm i` and call from any mutation or action — `await analytics.track(ctx, { name, props })` is the whole API. The dashboard knows about Convex environments (production vs development) and shows them as a toggle.

It also ships an MCP server. Claude Desktop, Cursor, and Windsurf can query your analytics conversationally — *"how many signups this week?"* — without you exporting anything.

Free tier: 50k custom events per month, page views uncounted. That covers most early-stage Convex apps without needing a card.

**Best for:** Convex apps where you want product analytics without becoming a PostHog admin.
**Skip if:** you need session replay, feature flags, or a 30-tab dashboard. Use PostHog.

## Side by side

| | PostHog | Plausible | GA4 | Convalytics |
|---|:-:|:-:|:-:|:-:|
| Setup time | ~2 hours | 5 min | ~1 hour | 10 min |
| Server-side events from Convex | Manual | No | Manual | Built-in |
| Write key safe in browser | No | N/A | N/A | Yes |
| Free tier covers a small app | Yes | Page views only | Yes | Yes |
| Agent / MCP support | No | No | No | Yes |
| Convex-native | No | No | No | Yes |
| Session replay | Yes | No | No | No |
| Feature flags | Yes | No | No | No |

## So which one

I'll be honest about how I think about this:

- If you want one tool to run your whole product analytics + experimentation stack and you have time to invest, **PostHog**.
- If you only need page views on a marketing site, **Plausible**.
- If you want product analytics on a Convex app without a full-day setup, **Convalytics**.
- I genuinely cannot think of a Convex app where I'd recommend GA4.

Most of the Convex apps I see fall in the third bucket. Founders building solo, small teams, agent-built side projects. They want signups and payments tracked, they want to know if the dashboard is being used, and they don't want to think about retention sync, Cohorts UI, or schema versioning.

If that's you, [convalytics.dev](https://convalytics.dev) is what I built for the version of me that didn't want to set this up.

What did I miss? [Tell me on X](https://x.com/DanJCleary).
