// Minimal layout wrapper used by React when users navigate client-side to
// /about, /privacy, /contact. Provides site chrome around the content
// components. Crawlers never see this wrapper: the prerender baked into
// dist/<route>/index.html renders only the <Content /> component, which is
// enough for indexing.

import type { ReactNode } from "react";

export function MarketingPage({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen w-full flex flex-col"
      style={{ background: "#e9e6db", color: "#1a1814" }}
    >
      <header
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: "1px solid #d5d0c8" }}
      >
        <a
          href="/"
          className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider"
          style={{ color: "#1a1814", textDecoration: "none" }}
        >
          <span
            className="w-6 h-6 flex items-center justify-center"
            style={{ background: "#e8651c" }}
          >
            <span className="text-white text-[10px] font-bold">C</span>
          </span>
          Convalytics
        </a>
        <nav className="flex items-center gap-5 text-xs">
          <a
            href="/about"
            style={{ color: "#6b6456", textDecoration: "none" }}
          >
            About
          </a>
          <a
            href="/privacy"
            style={{ color: "#6b6456", textDecoration: "none" }}
          >
            Privacy
          </a>
          <a
            href="/contact"
            style={{ color: "#6b6456", textDecoration: "none" }}
          >
            Contact
          </a>
        </nav>
      </header>

      <article
        className="flex-1 w-full max-w-2xl mx-auto px-6 py-10 text-sm leading-relaxed marketing-article"
        style={{ color: "#1a1814" }}
      >
        <style>{`
          .marketing-article h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; letter-spacing: -0.01em; }
          .marketing-article h2 { font-size: 1rem; font-weight: 700; margin-top: 2rem; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em; }
          .marketing-article h3 { font-size: 0.875rem; font-weight: 600; margin-top: 1.25rem; margin-bottom: 0.25rem; }
          .marketing-article p { margin-bottom: 0.75rem; }
          .marketing-article ul, .marketing-article ol { margin-bottom: 0.75rem; padding-left: 1.25rem; }
          .marketing-article li { margin-bottom: 0.25rem; }
          .marketing-article a { color: #e8651c; text-decoration: underline; }
          .marketing-article a:hover { color: #c9581a; }
          .marketing-article code { background: #d5d0c8; padding: 0 0.25rem; font-size: 0.8em; }
          .marketing-article header p { color: #6b6456; }
          .marketing-article nav[aria-label="Site navigation"] { margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid #d5d0c8; color: #9b9488; font-size: 0.75rem; }
          .marketing-article nav[aria-label="Site navigation"] a { color: #9b9488; text-decoration: none; }
          .marketing-article nav[aria-label="Site navigation"] a:hover { color: #1a1814; }
        `}</style>
        {children}
      </article>

      <footer
        className="px-6 py-4 text-[10px]"
        style={{
          borderTop: "1px solid #d5d0c8",
          color: "#9b9488",
        }}
      >
        © 2026 Tethered Software Inc.
      </footer>
    </div>
  );
}
