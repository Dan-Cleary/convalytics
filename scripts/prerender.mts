// Prerender marketing components into dist/index.html's #seo-content slot so
// crawlers and no-JS clients see text-rich HTML. Runs after `vite build`.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { SEOContent } from "../src/marketing/SEOContent.js";
import { AboutContent } from "../src/marketing/AboutContent.js";
import { PrivacyContent } from "../src/marketing/PrivacyContent.js";
import { ContactContent } from "../src/marketing/ContactContent.js";
import { McpContent } from "../src/marketing/McpContent.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, "../dist");
const templatePath = resolve(distDir, "index.html");
if (!existsSync(templatePath)) {
  throw new Error(
    `Prerender expected ${templatePath}. Run 'vite build' before 'tsx scripts/prerender.mts'.`,
  );
}
const template = readFileSync(templatePath, "utf8");

interface Route {
  path: string;
  component: () => JSX.Element;
  title?: string;
  description?: string;
}

const ROUTES: Route[] = [
  { path: "/", component: SEOContent },
  {
    path: "/about",
    component: AboutContent,
    title: "About Convalytics",
    description:
      "Convalytics is analytics for Convex apps, built by Dan Cleary at Tethered Software Inc. Open-source Convex backend component, agent-first setup.",
  },
  {
    path: "/privacy",
    component: PrivacyContent,
    title: "Privacy policy | Convalytics",
    description:
      "What data Convalytics collects, how it's used, retention, third parties, and your rights under GDPR and CCPA.",
  },
  {
    path: "/contact",
    component: ContactContent,
    title: "Contact | Convalytics",
    description:
      "Support, bug reports, security disclosure, and open-source contribution channels for Convalytics.",
  },
  {
    path: "/mcp",
    component: McpContent,
    title: "MCP server | Convalytics",
    description:
      "Convalytics MCP server exposes read-only analytics tools to Claude Desktop, Claude Code, Cursor, Windsurf, and other MCP-capable AI assistants.",
  },
  // /live is a fully reactive Convex-backed page (uses `useQuery` against
  // api.live.stats), so it can't be statically prerendered without a
  // ConvexProvider in the SSR pass. Served via the SPA fallback in
  // vercel.json instead — Twitter / OG crawlers still get the meta tags
  // from index.html, the body just hydrates client-side.
];

const SEO_SLOT = '<div id="seo-content"></div>';
if (!template.includes(SEO_SLOT)) {
  // The slot's exact shape is the contract with index.html. If it drifts
  // (class added, whitespace changed, etc.) every route silently becomes a
  // no-op, which is much worse than failing the build.
  throw new Error(
    `Prerender could not find the '${SEO_SLOT}' slot in ${templatePath}.`,
  );
}

for (const route of ROUTES) {
  const markup = renderToStaticMarkup(route.component());
  let html = template.replace(
    SEO_SLOT,
    `<div id="seo-content">${markup}</div>`,
  );

  if (route.title) {
    html = html.replace(
      /<title>.*?<\/title>/,
      `<title>${route.title}</title>`,
    );
  }
  if (route.description) {
    html = html.replace(
      /<meta name="description" content=".*?" \/>/,
      `<meta name="description" content="${route.description}" />`,
    );
  }

  const outPath =
    route.path === "/"
      ? templatePath
      : resolve(distDir, route.path.replace(/^\//, ""), "index.html");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html);
  console.log(`prerendered ${route.path} → ${outPath}`);
}
