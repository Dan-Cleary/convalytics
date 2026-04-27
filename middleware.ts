// Markdown content negotiation: when an AI agent sends `Accept: text/markdown`
// for one of our prerendered HTML routes, return the matching .md file from
// /public with Content-Type: text/markdown. HTML stays the default for browsers.
// Spec: https://isitagentready.com/.well-known/agent-skills/markdown-negotiation/SKILL.md

import { next } from "@vercel/functions";

function prefersMarkdown(accept: string): boolean {
  if (!accept) return false;
  let mdQ = -1;
  let htmlQ = -1;
  for (const entry of accept.split(",")) {
    const [type, ...params] = entry.split(";").map((s) => s.trim());
    let q = 1;
    for (const p of params) {
      if (p.startsWith("q=")) q = Number.parseFloat(p.slice(2)) || 0;
    }
    if (type === "text/markdown") mdQ = Math.max(mdQ, q);
    else if (type === "text/html") htmlQ = Math.max(htmlQ, q);
  }
  return mdQ > 0 && (htmlQ < 0 || mdQ >= htmlQ);
}

function approxTokens(text: string): number {
  // ~4 chars per token, close enough for cl100k-style estimates without
  // bundling a real tokenizer at the edge.
  return Math.ceil(text.length / 4);
}

export default async function middleware(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const mdPath = url.pathname === "/" ? "/index.md" : `${url.pathname}.md`;

  const accept = req.headers.get("accept") || "";
  if (!prefersMarkdown(accept)) return next();

  const upstream = await fetch(new URL(mdPath, url));
  if (!upstream.ok) return next();
  const body = await upstream.text();

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "x-markdown-tokens": String(approxTokens(body)),
      "cache-control": "public, max-age=300, s-maxage=3600",
      vary: "Accept",
    },
  });
}

export const config = {
  matcher: ["/", "/about", "/privacy", "/contact", "/mcp"],
  runtime: "nodejs",
};
