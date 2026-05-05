// Minimal blog post parser shared between the Vite-built browser bundle and
// the Node-side prerender script. Frontmatter is parsed by hand (simple
// key: value lines) so we don't pull a YAML dependency into the browser.
//
// Browser callers should use loadPostsFromGlob() with Vite's import.meta.glob.
// Node callers should use loadPostsFromDir() in scripts/loadPosts.mts.

import { marked } from "marked";

export type PostMeta = {
  slug: string;
  title: string;
  description: string;
  date: string; // ISO date, e.g. 2026-04-29
  tags?: string[];
  ogImage?: string;
  heroImage?: string;
  draft?: boolean;
  author: string;
  authorAvatar: string;
  authorUrl?: string;
};

// Single-author site for now. Frontmatter can override per-post.
const DEFAULT_AUTHOR = {
  name: "Dan Cleary",
  avatar: "/dan-cleary.jpg",
  url: "https://x.com/DanJCleary",
};

export type Post = {
  meta: PostMeta;
  html: string;
};

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

function parseFrontmatter(raw: string): {
  data: Record<string, string>;
  body: string;
} {
  const m = raw.match(FRONTMATTER_RE);
  if (!m) return { data: {}, body: raw };
  const data: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line
      .slice(idx + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    data[key] = value;
  }
  return { data, body: m[2] };
}

export function parsePost(raw: string, slug: string): Post {
  const { data, body } = parseFrontmatter(raw);
  const meta: PostMeta = {
    slug,
    title: data.title ?? slug,
    description: data.description ?? "",
    date: data.date ?? "",
    tags: data.tags ? data.tags.split(",").map((s) => s.trim()) : undefined,
    ogImage: data.ogImage || undefined,
    heroImage: data.heroImage || undefined,
    draft: data.draft === "true",
    author: data.author || DEFAULT_AUTHOR.name,
    authorAvatar: data.authorAvatar || DEFAULT_AUTHOR.avatar,
    authorUrl: data.authorUrl || DEFAULT_AUTHOR.url,
  };
  const html = marked.parse(body, { async: false });
  return { meta, html };
}

export function sortPostsNewestFirst(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => b.meta.date.localeCompare(a.meta.date));
}

// Browser-side loader. Pass the result of `import.meta.glob` configured with
// `{ eager: true, query: '?raw', import: 'default' }` against the blog dir.
export function loadPostsFromGlob(
  modules: Record<string, string>,
): Post[] {
  const posts: Post[] = [];
  for (const [path, raw] of Object.entries(modules)) {
    const slug = path.split("/").pop()!.replace(/\.md$/, "");
    const post = parsePost(raw, slug);
    if (post.meta.draft) continue;
    posts.push(post);
  }
  return sortPostsNewestFirst(posts);
}
