// Rendered as static HTML at build time into dist/mcp/index.html and also
// mounted by React at /mcp. See scripts/prerender.mts and App.tsx.

export function McpContent() {
  return (
    <main>
      <header>
        <h1>Convalytics MCP server</h1>
        <p>
          <strong>
            Read-only analytics for AI assistants via Model Context Protocol.
          </strong>{" "}
          Ask Claude Desktop, Claude Code, Cursor, Windsurf, or any MCP-capable
          client questions about your Convalytics data in natural language:
          <em>"what are my top pages this week,"</em>{" "}
          <em>"how many signups in the last 24 hours,"</em>{" "}
          <em>"show me the last ten payment_succeeded events."</em>
        </p>
      </header>

      <section>
        <h2>Endpoint</h2>
        <p>
          <code>POST https://api.convalytics.dev/mcp</code>
        </p>
        <p>
          JSON-RPC 2.0. Auth via{" "}
          <code>Authorization: Bearer cnv_...</code> using an API token
          generated at <a href="/tokens">/tokens</a> in the dashboard.
        </p>
      </section>

      <section>
        <h2>Plan requirement</h2>
        <p>
          Convalytics MCP is available on the <strong>Solo</strong> plan
          ($29/mo) and <strong>Pro</strong> plan ($99/mo). API tokens
          themselves can be generated on any plan, but the{" "}
          <code>/mcp</code> endpoint returns <code>402 plan_required</code>{" "}
          for Free-tier tokens. Upgrade at{" "}
          <a href="/billing">convalytics.dev/billing</a>.
        </p>
      </section>

      <section>
        <h2>Install in Claude Code</h2>
        <pre>
{`claude mcp add --transport http convalytics https://api.convalytics.dev/mcp \\
  --header "Authorization: Bearer $CONVALYTICS_TOKEN"`}
        </pre>
      </section>

      <section>
        <h2>Install in Claude Desktop</h2>
        <p>
          Edit{" "}
          <code>
            ~/Library/Application Support/Claude/claude_desktop_config.json
          </code>
          :
        </p>
        <pre>
{`{
  "mcpServers": {
    "convalytics": {
      "url": "https://api.convalytics.dev/mcp",
      "headers": {
        "Authorization": "Bearer cnv_..."
      }
    }
  }
}`}
        </pre>
      </section>

      <section>
        <h2>Install in Cursor / Windsurf</h2>
        <p>
          Both follow the same JSON shape in their MCP settings. Add a new
          server with URL <code>https://api.convalytics.dev/mcp</code> and an{" "}
          <code>Authorization: Bearer cnv_...</code> header.
        </p>
      </section>

      <section>
        <h2>Token scope</h2>
        <p>
          Each API token is scoped to <strong>one team</strong>, not one
          project. A token grants read access to every project on the team
          it was created for. The four project-scoped tools below all take
          a <code>project</code> argument (name or id) so the agent picks
          which project to query on each call. Use <code>list_projects</code>{" "}
          first if you're not sure what's available.
        </p>
      </section>

      <section>
        <h2>Tools exposed</h2>
        <ul>
          <li>
            <strong>list_projects</strong>: all projects on the token's team
            (id, name, writeKey, site URL, deployment slug). Team-scoped, no
            arguments.
          </li>
          <li>
            <strong>get_usage</strong>: current month's custom-event count,
            monthly quota, retention days, and plan name for the team.
            Team-scoped, no arguments.
          </li>
          <li>
            <strong>top_pages(project, since?, until?, limit?)</strong>:
            pages ranked by views in a time window, with unique visitors and
            share of total. Default window: last 7 days. Max 50 results.
          </li>
          <li>
            <strong>top_referrers(project, since?, until?, limit?)</strong>:
            referring hosts ranked by visits, includes <code>(direct)</code>.
            Default window: last 7 days.
          </li>
          <li>
            <strong>pageviews_count(project, since?, until?)</strong>: total
            page views and unique visitors in a window. The right tool for
            "how much web traffic did I get" questions. Page views live in
            a separate table from custom events.
          </li>
          <li>
            <strong>events_count(project, name?, since?, until?)</strong>:
            count of <em>custom</em> events (emitted via{" "}
            <code>analytics.track()</code>), optionally filtered by event
            name. Does <strong>not</strong> cover page views — use{" "}
            <code>pageviews_count</code> for those.
          </li>
          <li>
            <strong>recent_events(project, name?, limit?, redact?, user?)</strong>:
            most recent events, optionally filtered by name and/or user.{" "}
            <code>userEmail</code>, <code>userName</code>, and{" "}
            <code>props</code> are redacted by default; pass{" "}
            <code>redact: false</code> to include them.
          </li>
          <li>
            <strong>user_activity(project, user, since?, until?)</strong>:
            composite per-user snapshot — identity block (userEmail,
            userName, firstSeen, lastSeen), totals for pageviews and
            events, top pages visited, top event names, and the 20 most
            recent events with props.{" "}
            <code>user</code> accepts userEmail (case-insensitive) or
            visitorId. Use this for "how is dancleary@example.com using
            my app?" questions — one call, full picture.
          </li>
          <li>
            <strong>weekly_digest(project, days?, compare?)</strong>: one
            composite snapshot of a project's web analytics. Returns visitors,
            pageviews, sessions, bounce rate, avg session duration, top 5
            pages, top 5 referrers, total custom events, top 5 event names,
            plus period-over-period deltas against the prior equal-length
            window. Default <code>days: 7</code>, <code>compare: true</code>.
            Use this instead of chaining top_pages + top_referrers +
            events_count when the agent just wants to report on a window.
          </li>
        </ul>
        <p>
          <code>project</code> accepts either the project's case-insensitive
          name (e.g. <code>"slopbench"</code>) or its id from{" "}
          <code>list_projects</code>.
        </p>
      </section>

      <section>
        <h2>Rate limits and errors</h2>
        <ul>
          <li>
            <strong>120 requests per minute</strong> per token. Exceeding
            returns <code>429 rate_limit_exceeded</code> with a{" "}
            <code>Retry-After</code> header and a <code>resetAt</code>{" "}
            timestamp.
          </li>
          <li>
            <strong>401 invalid_token</strong> for missing, malformed, or
            revoked tokens.
          </li>
          <li>
            <strong>402 plan_required</strong> for Free-plan teams.
          </li>
          <li>
            JSON-RPC protocol errors (parse, invalid request, method not
            found) are returned in the standard JSON-RPC 2.0 error shape
            with the appropriate code.
          </li>
        </ul>
      </section>

      <section>
        <h2>Not included in v1</h2>
        <p>
          No write or admin tools. No <code>funnel</code> tool until the
          dashboard ships funnel views. No OAuth flow (API token is the only
          auth in v1). No MCP Apps UI resources. If one of these matters to
          you,{" "}
          <a href="/contact">tell us</a>.
        </p>
      </section>

      <section>
        <h2>Discovery</h2>
        <ul>
          <li>
            Server card:{" "}
            <a href="/.well-known/mcp/server-card.json">
              /.well-known/mcp/server-card.json
            </a>
          </li>
          <li>
            Full product manual (includes the same tool list):{" "}
            <a href="/llms-full.txt">/llms-full.txt</a>
          </li>
          <li>
            OpenAPI schema for ingest endpoints (separate from MCP):{" "}
            <a href="/openapi.json">/openapi.json</a>
          </li>
        </ul>
      </section>

      <nav aria-label="Site navigation">
        <p>
          <a href="/">Home</a> · <a href="/about">About</a> ·{" "}
          <a href="/privacy">Privacy</a> · <a href="/contact">Contact</a>
        </p>
      </nav>
    </main>
  );
}
