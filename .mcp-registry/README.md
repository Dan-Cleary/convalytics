# MCP registry submissions

Ready-to-submit material for the Convalytics MCP server v1. One doc, all four
registries, so a human can run through them in ~10 minutes.

## 1. Smithery (smithery.ai)

**Easiest — web form with auto-scan.**

1. Visit https://smithery.ai/new
2. Paste `https://api.convalytics.dev/mcp`
3. Smithery auto-fetches `/.well-known/mcp/server-card.json` and lists the
   15 tools (9 analytics + 6 funnel). No further metadata needed.

If it asks for additional copy, paste from the **Description and copy** section at
the bottom of this doc.

## 2. Official MCP Registry (registry.modelcontextprotocol.io)

**CLI-based. Requires GitHub OAuth (once).** PulseMCP pulls from here weekly, so
this submission covers both.

```bash
# 1. Clone + build the publisher (one-time)
git clone https://github.com/modelcontextprotocol/registry /tmp/mcp-registry
cd /tmp/mcp-registry && make publisher

# 2. Authenticate with GitHub (for the io.github.Dan-Cleary/* namespace)
./bin/mcp-publisher login github

# 3. Publish using the server.json in this directory
cd /Users/dancleary/convalytics
/tmp/mcp-registry/bin/mcp-publisher publish .mcp-registry/server.json
```

`.mcp-registry/server.json` is in this directory and already has the correct
shape: remote streamable-HTTP transport, Authorization header flagged as
required + secret.

If you'd rather publish under a domain namespace (`io.convalytics.dev`)
instead of GitHub, swap `name` to `io.convalytics.dev/mcp` and follow
https://github.com/modelcontextprotocol/registry docs for DNS TXT verification.

## 3. mcp.so

**Web form** at https://mcp.so (look for "Submit" / "Add" link). Paste:

- **Server URL**: `https://api.convalytics.dev/mcp`
- **Repository**: `https://github.com/Dan-Cleary/convalytics`
- **Name**: Convalytics
- **Tagline**: Read-only analytics for Convex apps
- **Description**: see below

## 4. Glama (glama.ai/mcp)

**Web form** or GitHub issue (if the form isn't obvious, file an issue at
https://github.com/punkpeye/awesome-mcp-servers or the Glama-specific repo).

Fields: same as mcp.so.

## 5. PulseMCP (pulsemcp.com)

Submission at https://www.pulsemcp.com/submit. They source from the Official
MCP Registry on a weekly cron, so if you did (2) above, this is automatic —
otherwise:

- Select: **MCP Server**
- URL: `https://github.com/Dan-Cleary/convalytics`

## Description and copy (copy/paste into any form)

**Short (<140 chars):**
> Analytics + conversion funnels for AI assistants. Query traffic, events, usage; list/compute/build funnels for your Convalytics Convex-app via MCP.

**Medium (~300 chars):**
> Convalytics is analytics built for Convex apps. The MCP server exposes 15 tools: 9 read-only analytics queries (top pages, referrers, events, per-user activity, weekly digest) plus 6 funnel tools to list, compute, and (with a write-scoped token) create/update/delete saved conversion funnels. For Claude Desktop, Cursor, Windsurf, and other MCP clients.

**Tags / categories:** analytics, monitoring, funnels, developer-tools, convex, saas

**Install snippet (if asked):**

```
claude mcp add --transport http convalytics https://api.convalytics.dev/mcp \
  --header "Authorization: Bearer $CONVALYTICS_TOKEN"
```

**Server URL:** https://api.convalytics.dev/mcp
**Marketing page:** https://convalytics.dev/mcp
**Server card:** https://convalytics.dev/.well-known/mcp/server-card.json
**Repo:** https://github.com/Dan-Cleary/convalytics
**Docs / full product manual:** https://convalytics.dev/llms-full.txt

**Author:** Dan Cleary, Tethered Software Inc.
**Contact:** hello@convalytics.dev
