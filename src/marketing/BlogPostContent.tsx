// Single blog post page. The HTML body comes pre-parsed from `marked` and
// is injected with dangerouslySetInnerHTML — safe because the source is our
// own .md files in content/blog/, not user input.

import { useEffect, useRef } from "react";
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

export function BlogPostContent({ post }: { post: Post }) {
  const bodyRef = useRef<HTMLDivElement>(null);

  // Wire any [data-copy-target="<id>"] button inside the post body to copy the
  // text of the matching #<id> element. Used for the "Copy prompt" button on
  // post 1; harmless when no such button exists.
  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    const buttons = root.querySelectorAll<HTMLButtonElement>(
      "button[data-copy-target]",
    );
    const cleanups: Array<() => void> = [];
    for (const btn of buttons) {
      const targetId = btn.dataset.copyTarget!;
      const handler = () => {
        const target = document.getElementById(targetId);
        if (!target) return;
        void navigator.clipboard
          .writeText(target.innerText.trim())
          .then(() => {
            const original = btn.textContent;
            btn.textContent = "Copied";
            setTimeout(() => {
              btn.textContent = original;
            }, 1500);
          });
      };
      btn.addEventListener("click", handler);
      cleanups.push(() => btn.removeEventListener("click", handler));
    }
    return () => cleanups.forEach((fn) => fn());
  }, [post.meta.slug]);

  return (
    <>
      <header>
        <h1>{post.meta.title}</h1>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "1rem",
          }}
        >
          <img
            src={post.meta.authorAvatar}
            alt={post.meta.author}
            width={28}
            height={28}
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              objectFit: "cover",
            }}
          />
          <div style={{ fontSize: "0.75rem", color: "#6b6456" }}>
            {post.meta.authorUrl ? (
              <a href={post.meta.authorUrl} rel="author">
                {post.meta.author}
              </a>
            ) : (
              <span>{post.meta.author}</span>
            )}
            {" · "}
            <time dateTime={post.meta.date}>
              {formatDate(post.meta.date)}
            </time>
          </div>
        </div>
      </header>

      {post.meta.heroImage ? (
        <img
          src={post.meta.heroImage}
          alt=""
          style={{
            width: "100%",
            marginBottom: "1.5rem",
            border: "1px solid #d5d0c8",
          }}
        />
      ) : null}

      <div ref={bodyRef} dangerouslySetInnerHTML={{ __html: post.html }} />

      <nav aria-label="Site navigation">
        <a href="/blog">All posts</a> · <a href="/">Home</a> ·{" "}
        <a href="/mcp">MCP server</a>
      </nav>
    </>
  );
}
