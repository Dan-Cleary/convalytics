# Convalytics Pricing

Free web and product analytics for Convex apps.

Billing is by monthly event volume. Page views are always free and do not count against the event quota. Custom product events (anything other than `page_view`) count against the monthly quota. There are no project limits on any tier.

## Plans

### Free — $0 / month
- 50,000 custom events per month
- Unlimited page views
- 90-day data retention
- All dashboards and exports
- All integrations (Convex component, browser script, HTTP API, CLI)
- API tokens for agent provisioning (MCP server itself is Solo+)

### Solo — $29 / month
- 500,000 custom events per month
- Unlimited page views
- 365-day data retention
- **Convalytics MCP server** (read + write) for AI assistants
- Everything in Free

### Pro — $99 / month
- 5,000,000 custom events per month
- Unlimited page views
- 5-year data retention
- Everything in Solo

## Overage behavior

When a project exceeds its monthly quota:

- **Server-side events** (from Convex functions, CLI, or direct HTTP) receive `402 quota_exceeded`.
- **Browser events** (from the `<script>` tag on marketing/web pages) are silently dropped so visitor tracking never breaks.
- **Page views** are always free and are never dropped or rejected, on any tier.

## Rate limits

All plans share the same per-write-key rate limit: **1000 events per minute**. Exceeding this returns `429` with a `Retry-After` header and a `resetAt` timestamp.

## Billing

- Upgrades take effect immediately. Prorated via Stripe.
- Downgrades take effect at the end of the current billing period.
- Cancel any time from the billing page. No contracts.

## Questions

Contact hello@convalytics.dev or open an issue at https://github.com/Dan-Cleary/convalytics.
