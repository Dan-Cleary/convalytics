// Prerender marketing components into dist/index.html's #seo-content slot so
// crawlers and no-JS clients see text-rich HTML. Runs after `vite build`.
//
// Also emits a markdown sibling (dist/<route>.md) for each non-root route so
// middleware.ts can serve markdown when agents send `Accept: text/markdown`.
// The root markdown (/index.md) is hand-authored in public/ and intentionally
// not regenerated here — it's the agent-facing front door and benefits from
// curation.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TurndownService from "turndown";
import { SEOContent } from "../src/marketing/SEOContent.js";
import { AboutContent } from "../src/marketing/AboutContent.js";
import { PrivacyContent } from "../src/marketing/PrivacyContent.js";
import { ContactContent } from "../src/marketing/ContactContent.js";
import { McpContent } from "../src/marketing/McpContent.js";
import { BlogIndexContent } from "../src/marketing/BlogIndexContent.js";
import { BlogPostContent } from "../src/marketing/BlogPostContent.js";
import { parsePost, sortPostsNewestFirst, type Post } from "../src/lib/blog.js";
import { readdirSync } from "node:fs";

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
  // For blog posts: emit Article JSON-LD + post-specific og:image. Only set
  // on per-post routes; the index/about/etc. inherit the site-level tags.
  articleSchema?: Record<string, unknown>;
  ogImage?: string;
}

const SITE_ORIGIN = "https://convalytics.dev";

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

// Load every .md in content/blog/ at build time and append a route per post,
// plus a /blog index route. Drafts are filtered by parsePost (meta.draft).
const blogDir = resolve(__dirname, "../content/blog");
const POSTS: Post[] = sortPostsNewestFirst(
  readdirSync(blogDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const slug = f.replace(/\.md$/, "");
      return parsePost(readFileSync(resolve(blogDir, f), "utf8"), slug);
    })
    .filter((p) => !p.meta.draft),
);

ROUTES.push({
  path: "/blog",
  component: () => BlogIndexContent({ posts: POSTS }),
  title: "Blog | Convalytics",
  description:
    "Notes on Convex apps, analytics, and what we're shipping. Written for developers building on Convex.",
});

for (const post of POSTS) {
  const url = `${SITE_ORIGIN}/blog/${post.meta.slug}`;
  const image = post.meta.heroImage
    ? `${SITE_ORIGIN}${post.meta.heroImage}`
    : `${SITE_ORIGIN}/og.png`;
  ROUTES.push({
    path: `/blog/${post.meta.slug}`,
    component: () => BlogPostContent({ post }),
    title: `${post.meta.title} | Convalytics`,
    description: post.meta.description,
    ogImage: image,
    articleSchema: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.meta.title,
      description: post.meta.description,
      image,
      url,
      datePublished: post.meta.date,
      author: {
        "@type": "Person",
        name: post.meta.author,
        url: post.meta.authorUrl,
      },
      publisher: {
        "@type": "Organization",
        name: "Convalytics",
        url: SITE_ORIGIN,
        logo: {
          "@type": "ImageObject",
          url: `${SITE_ORIGIN}/og.png`,
        },
      },
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
    },
  });
}

const SEO_SLOT = '<div id="seo-content"></div>';
if (!template.includes(SEO_SLOT)) {
  // The slot's exact shape is the contract with index.html. If it drifts
  // (class added, whitespace changed, etc.) every route silently becomes a
  // no-op, which is much worse than failing the build.
  throw new Error(
    `Prerender could not find the '${SEO_SLOT}' slot in ${templatePath}.`,
  );
}

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "*",
});

// Default turndown only fences <pre><code> pairs. Our JSX uses plain <pre> for
// install snippets, so add a rule that fences any <pre> as an unlabeled block.
turndown.addRule("preBlock", {
  filter: (node) => node.nodeName === "PRE",
  replacement: (_content, node) => {
    const text = (node as { textContent?: string }).textContent ?? "";
    return `\n\n\`\`\`\n${text.replace(/\n+$/, "")}\n\`\`\`\n\n`;
  },
});

// emDelimiter is "*", so underscores are unambiguous in prose. The default
// escape mangles identifiers like payment_succeeded into payment\_succeeded.
const baseEscape = turndown.escape.bind(turndown);
turndown.escape = (s: string) => baseEscape(s).replace(/\\_/g, "_");

// Sitemap rebuilt from the same ROUTES list. Overwrites whatever Vite copied
// from public/sitemap.xml so the two never drift.
const sitemapEntries = ROUTES.map((r) => {
  const url = `${SITE_ORIGIN}${r.path === "/" ? "/" : r.path}`;
  // Posts get the post's date; index/about/etc. inherit "weekly" without lastmod.
  const lastmod = r.articleSchema
    ? `<lastmod>${(r.articleSchema as Record<string, string>).datePublished}</lastmod>`
    : "";
  return `  <url>\n    <loc>${url}</loc>\n${lastmod ? `    ${lastmod}\n` : ""}    <changefreq>weekly</changefreq>\n  </url>`;
}).join("\n");
const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries}\n</urlset>\n`;
writeFileSync(resolve(distDir, "sitemap.xml"), sitemapXml);
console.log(`wrote sitemap.xml with ${ROUTES.length} entries`);

for (const route of ROUTES) {
  const markup = renderToStaticMarkup(createElement(route.component));
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

  // Swap canonical + og:* + twitter:* on every non-root route so each page
  // has a unique social card and search canonical. The root inherits the
  // site-level template values unchanged.
  if (route.path !== "/") {
    const canonical = `${SITE_ORIGIN}${route.path}`;
    html = html.replace(
      /<link rel="canonical" href=".*?" \/>/,
      `<link rel="canonical" href="${canonical}" />`,
    );
    html = html.replace(
      /<meta property="og:url" content=".*?" \/>/,
      `<meta property="og:url" content="${canonical}" />`,
    );
    if (route.title) {
      html = html.replace(
        /<meta property="og:title" content=".*?" \/>/,
        `<meta property="og:title" content="${route.title}" />`,
      );
      html = html.replace(
        /<meta name="twitter:title" content=".*?" \/>/,
        `<meta name="twitter:title" content="${route.title}" />`,
      );
    }
    if (route.description) {
      html = html.replace(
        /<meta property="og:description" content=".*?" \/>/,
        `<meta property="og:description" content="${route.description}" />`,
      );
      html = html.replace(
        /<meta name="twitter:description" content=".*?" \/>/,
        `<meta name="twitter:description" content="${route.description}" />`,
      );
    }
    if (route.ogImage) {
      html = html.replace(
        /<meta property="og:image" content=".*?" \/>/,
        `<meta property="og:image" content="${route.ogImage}" />`,
      );
      html = html.replace(
        /<meta name="twitter:image" content=".*?" \/>/,
        `<meta name="twitter:image" content="${route.ogImage}" />`,
      );
    }
  }

  // Inject Article JSON-LD before </head> for blog posts. Sits alongside the
  // site-level Product schema; Google merges them.
  if (route.articleSchema) {
    const ld = `<script type="application/ld+json">${JSON.stringify(
      route.articleSchema,
    )}</script>`;
    html = html.replace(/<\/head>/i, `${ld}</head>`);
  }

  const outPath =
    route.path === "/"
      ? templatePath
      : resolve(distDir, route.path.replace(/^\//, ""), "index.html");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html);

  // Skip / — public/index.md is hand-curated and copied through by Vite.
  if (route.path !== "/") {
    const mdOutPath = resolve(
      distDir,
      `${route.path.replace(/^\//, "")}.md`,
    );
    writeFileSync(mdOutPath, turndown.turndown(markup) + "\n");
    console.log(`prerendered ${route.path} → ${outPath} + ${mdOutPath}`);
  } else {
    console.log(`prerendered ${route.path} → ${outPath}`);
  }
}
