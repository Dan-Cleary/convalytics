// Blog index page. Server-rendered at build time (prerender.mts) and
// hydrated client-side from the same parsed posts loaded via Vite's glob.

import type { Post } from "../lib/blog";

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function BlogIndexContent({ posts }: { posts: Post[] }) {
  return (
    <>
      <header>
        <h1>Convalytics blog</h1>
        <p>
          Notes on Convex apps, analytics, and what we're shipping. Written
          for developers building on Convex.
        </p>
      </header>

      {posts.length === 0 ? (
        <p>No posts yet — first one drops soon.</p>
      ) : (
        <ul style={{ listStyle: "none", paddingLeft: 0 }}>
          {posts.map((p) => (
            <li
              key={p.meta.slug}
              style={{ marginBottom: "1.5rem", paddingLeft: 0 }}
            >
              <a href={`/blog/${p.meta.slug}`}>
                <strong>{p.meta.title}</strong>
              </a>
              <div style={{ color: "#6b6456", fontSize: "0.75rem" }}>
                {formatDate(p.meta.date)}
              </div>
              {p.meta.description ? (
                <div style={{ marginTop: "0.25rem" }}>
                  {p.meta.description}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <nav aria-label="Site navigation">
        <a href="/">Home</a> · <a href="/mcp">MCP server</a> ·{" "}
        <a href="/about">About</a>
      </nav>
    </>
  );
}
