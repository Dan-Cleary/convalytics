// Build-time prerender target for convalytics.dev/. Crawlers and no-JS clients
// see this content inside <div id="seo-content"> in dist/index.html; browsers
// with JS hide it via .js-ready CSS before React mounts, so the interactive
// sign-in UI at src/components/SignInForm.tsx stays the only thing users see.

import { PLANS } from "../../convex/plans";
import { formatEventLimit, formatRetention } from "../lib/timeRange";

export function SEOContent() {
  return (
    <main>
      <header>
        <h1>Convalytics</h1>
        <p>
          <strong>Free web and product analytics for Convex apps.</strong> One
          dashboard for page views, product events, user identification,
          retention, and funnels, built specifically for apps running on
          Convex.
        </p>
      </header>

      <section>
        <h2>What Convalytics is</h2>
        <p>
          Convalytics is an analytics platform designed for teams building on{" "}
          <a href="https://convex.dev">Convex</a>. It combines website traffic
          analytics (page views, sessions, referrers, UTM campaigns) with
          in-app product event tracking (signups, purchases, feature usage)
          in a single dashboard. Page views are always free on every plan and
          never count toward event quotas.
        </p>
      </section>

      <section>
        <h2>Features</h2>
        <ul>
          <li>Automatic page view tracking via a single script tag</li>
          <li>Server-side product events from any Convex mutation or action</li>
          <li>
            Browser-side event tracking with <code>identify</code> and{" "}
            <code>reset</code> APIs
          </li>
          <li>
            User identification for attributing anonymous sessions to real
            accounts
          </li>
          <li>
            Dashboards for traffic, top pages, referrers, UTM campaigns,
            retention, and funnels
          </li>
          <li>CSV export of every event table</li>
          <li>
            Team billing through Stripe with Free, Solo, and Pro tiers
          </li>
          <li>First-class support for Convex custom deployments</li>
        </ul>
      </section>

      <section>
        <h2>Agent-first setup</h2>
        <p>
          Convalytics is built for teams where AI coding agents write most of
          the instrumentation. Copy the setup prompt from the sign-in page and
          paste it into Claude Code, Cursor, Windsurf, Codex, or any agent
          that can run shell commands. The agent runs{" "}
          <code>npx convalytics init</code>, which auto-provisions a project,
          installs the Convex backend component, writes the analytics
          singleton, and inserts the browser script tag. No account is
          required before events start flowing.
        </p>
        <p>
          The agent also proposes a tracking plan by reading your{" "}
          <code>convex/</code> directory and identifying mutations and actions
          worth instrumenting. You approve the plan, the agent instruments
          the events, and <code>npx convalytics verify</code> confirms the
          events are landing before you claim the project by signing in with
          Google.
        </p>
      </section>

      <section>
        <h2>Pricing</h2>
        <ul>
          {(["free", "solo", "pro"] as const).map((id) => {
            const plan = PLANS[id];
            return (
              <li key={id}>
                <strong>{plan.displayName}.</strong> {plan.priceMonthly}.{" "}
                {formatEventLimit(plan.eventsPerMonth)} custom events per
                month, {formatRetention(plan.retentionDays)} data retention.
                {id === "free" ? " Page views are unlimited." : ""}
              </li>
            );
          })}
        </ul>
        <p>
          Page views are unlimited and free on every plan and never count
          against event quotas. Full pricing details live at{" "}
          <a href="/pricing.md">/pricing.md</a>.
        </p>
      </section>

      <section>
        <h2>How sending events works</h2>
        <p>Three ways to emit events:</p>
        <ul>
          <li>
            <strong>Convex backend component.</strong> Recommended for Convex
            apps. Install <code>convalytics-dev</code> from npm and call{" "}
            <code>
              analytics.track(ctx, {"{"} name, userId, props {"}"})
            </code>{" "}
            from any mutation or action.
          </li>
          <li>
            <strong>Browser auto-tracking script.</strong> Drop a single{" "}
            <code>&lt;script&gt;</code> tag in your app's HTML head. Captures
            page views automatically and exposes{" "}
            <code>window.convalytics.track()</code> for custom browser events.
          </li>
          <li>
            <strong>Direct HTTP ingest.</strong> POST events to{" "}
            <code>https://api.convalytics.dev/ingest</code> from any language.
            Up to 100 events per batch. See the{" "}
            <a href="/openapi.json">OpenAPI specification</a> for full
            schemas.
          </li>
        </ul>
      </section>

      <section>
        <h2>Query and build with Claude</h2>
        <p>
          The Convalytics <a href="/mcp">MCP server</a> exposes 15 tools
          over Model Context Protocol. Nine read-only tools answer
          questions about your analytics in natural language: top pages,
          referrers, custom-event counts, recent events, per-user activity,
          and usage. Six funnel tools list / get / compute saved conversion
          funnels, and with a write-scoped token let an agent create,
          update, or delete funnels directly from chat. Available on the
          Solo and Pro plans.
        </p>
      </section>

      <section>
        <h2>Authentication model</h2>
        <p>
          Convalytics uses a single public write key as its API credential.
          It is safe to commit, ships in browser script tags, and authorizes
          write-only access to exactly one project. There is no secret key,
          no bearer token, and no OAuth flow for the ingestion API. Dashboard
          access is separate and handled by Convex Auth with Google sign-in.
        </p>
        <p>
          Agents provision unclaimed projects via{" "}
          <code>POST /api/provision</code> with no authentication. Events
          flow immediately, and the human later claims the project by
          clicking a one-time link.
        </p>
      </section>

      <section>
        <h2>Developer resources</h2>
        <ul>
          <li>
            <a href="/llms-full.txt">Full product manual</a>: comprehensive
            agent-facing documentation covering every endpoint, auth flow,
            and quota rule
          </li>
          <li>
            <a href="/llms.txt">Short product manual</a>: minimal
            agent-facing instructions
          </li>
          <li>
            <a href="/openapi.json">OpenAPI 3.1 specification</a>:
            machine-readable schema for every public endpoint
          </li>
          <li>
            <a href="/skill.md">Agent setup skill</a>: step-by-step
            instructions for AI coding agents
          </li>
          <li>
            <a href="/pricing.md">Pricing details</a>: plan tiers, overage
            behavior, and rate limits
          </li>
          <li>
            <a href="/.well-known/agent-card.json">A2A agent card</a>:
            structured capability description for agent-to-agent discovery
          </li>
          <li>
            <a href="/.well-known/api-catalog">API catalog (RFC 9727)</a>: a
            linkset of all public API resources
          </li>
          <li>
            <a href="/mcp">MCP server</a>: Model Context Protocol endpoint
            for AI assistants (Solo+ plan required)
          </li>
          <li>
            <a href="/.well-known/mcp/server-card.json">MCP server card</a>:
            structured capability description for MCP discovery
          </li>
          <li>
            <a href="https://github.com/Dan-Cleary/convalytics">
              GitHub repository
            </a>
            : source code, issues, security advisories
          </li>
          <li>
            <a href="https://github.com/Dan-Cleary/convalytics-convex-component">
              Convex component repository
            </a>
          </li>
          <li>
            <a href="https://www.npmjs.com/package/convalytics-dev">
              convalytics-dev on npm
            </a>
            : the Convex backend component
          </li>
          <li>
            <a href="https://www.npmjs.com/package/convalytics">
              convalytics on npm
            </a>
            : the setup CLI
          </li>
        </ul>
      </section>

      <section>
        <h2>Built on Convex</h2>
        <p>
          Convalytics is itself a Convex application. The analytics
          dashboard, billing, quota enforcement, and HTTP ingest endpoints
          all run on Convex, so the same real-time reactivity, durable
          functions, and scheduled jobs that the platforms it serves rely on
          are baked into the product. The Convex backend component for
          server-side tracking is open source at{" "}
          <a href="https://github.com/Dan-Cleary/convalytics-convex-component">
            github.com/Dan-Cleary/convalytics-convex-component
          </a>
          .
        </p>
      </section>

      <footer>
        <p>
          Questions? Email{" "}
          <a href="mailto:dancleary54@gmail.com">dancleary54@gmail.com</a> or
          file an issue at{" "}
          <a href="https://github.com/Dan-Cleary/convalytics/issues">
            github.com/Dan-Cleary/convalytics/issues
          </a>
          .
        </p>
        <p>© 2026 Tethered Software Inc.</p>
      </footer>
    </main>
  );
}
