# Convalytics

> Free web and product analytics for Convex apps. Agent-friendly HTTP API with a public write key, a Convex backend component for server-side ingest, and an auto-tracking browser script for page views and custom events.

## What it does

One dashboard for marketing-site page views, in-app product events, user identification, retention, and funnels. Built specifically for apps running on [Convex](https://convex.dev). Page views are always free and never count against the event quota on any plan.

## Start here

- **Agent setup manual**: [/llms.txt](https://convalytics.dev/llms.txt)
- **Full product manual**: [/llms-full.txt](https://convalytics.dev/llms-full.txt)
- **OpenAPI spec**: [/openapi.json](https://convalytics.dev/openapi.json)
- **Pricing**: [/pricing.md](https://convalytics.dev/pricing.md)
- **Agent card**: [/.well-known/agent-card.json](https://convalytics.dev/.well-known/agent-card.json)
- **API catalog**: [/.well-known/api-catalog](https://convalytics.dev/.well-known/api-catalog)
- **MCP server** (for AI-assistant queries): [/mcp](https://convalytics.dev/mcp) · [server card](https://convalytics.dev/.well-known/mcp/server-card.json)

## Install (for humans)

```bash
npx convalytics init
```

Auto-provisions a project, installs the SDK, patches config, sets the env var, adds the browser script tag. No write key needed up-front.

## Ingest (for agents)

```
POST https://api.convalytics.dev/ingest
Content-Type: application/json

{
  "writeKey": "wk_...",
  "name": "signup_completed",
  "userId": "user_123",
  "sessionId": "sess_abc",
  "timestamp": 1714000000000,
  "props": { "plan": "pro" }
}
```

Use `name: "page_view"` for page views (free). Any other name is a quota-counted custom product event.

## Query (for AI assistants)

After events flow, AI assistants (Claude Desktop, Claude Code, Cursor, Windsurf) can query analytics conversationally via the Convalytics MCP server:

```
claude mcp add --transport http convalytics https://api.convalytics.dev/mcp \
  --header "Authorization: Bearer $CONVALYTICS_TOKEN"
```

Generate a token at [convalytics.dev/tokens](https://convalytics.dev/tokens). Nine read-only tools including `weekly_digest` and `user_activity`, plus six funnel tools: `list_funnels`, `get_funnel`, `compute_funnel` (read) and `create_funnel`, `update_funnel`, `delete_funnel` (require a token with `scope="write"`). Requires the Solo plan or higher.

## Pricing

- **Free** — $0/mo, 50K custom events, 90-day retention
- **Solo** — $29/mo, 500K custom events, 1-year retention
- **Pro** — $99/mo, 5M custom events, 5-year retention

Page views are unlimited and free on every plan.

## Links

- Source: https://github.com/Dan-Cleary/convalytics
- Convex component: https://github.com/Dan-Cleary/convalytics-convex-component
- npm: https://www.npmjs.com/package/convalytics
- Contact: dancleary54@gmail.com
