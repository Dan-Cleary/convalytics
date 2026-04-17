import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";

const AGENT_PROMPT = `Add Convalytics analytics to this Convex project.

Before starting, ask me: do I want (A) web analytics only — automatic page views,
sessions, bounce rate, referrers — or (B) web analytics + product analytics
for signups, payments, feature usage, etc.?

## Option A — Web analytics only

Run: npx convalytics init

This provisions a project and adds a script tag to index.html. That's it — page
views start flowing immediately. No SDK or component needed.

For non-Vite projects (Next.js, Astro, etc.), the CLI prints the script tag to
add manually to <head>.

Share the claim URL from the output with me.

## Option B — Web analytics + product analytics

Run: npx convalytics init

Same as above, plus it installs the Convex component for tracking custom events
from mutations and actions.

After install, read convex/schema.ts and all files in convex/. Identify every
mutation and action that represents a meaningful user action. Propose a tracking
plan as a numbered list:

  1. event_name — file.ts → functionName — props: { key }

Wait for me to approve, then instrument each with:

  import { analytics } from "./analytics";
  await analytics.track(ctx, { name: "event_name", userId: String(userId), props: { key: "value" } });

Then verify: npx convalytics verify

Share the claim URL from the output with me.`;

export function SignInForm() {
  const [copied, setCopied] = useState(false);
  const { signIn } = useAuthActions();

  function copyPrompt() {
    void navigator.clipboard.writeText(AGENT_PROMPT).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center pb-6"
      style={{ background: "#e9e6db" }}
    >
      <div className="w-full max-w-md mx-4 flex flex-col gap-5 flex-1 justify-center">
        {/* Main card — agent-first */}
        <div
          className="bg-white p-8"
          style={{
            border: "2px solid #1a1814",
            boxShadow: "6px 6px 0px #1a1814",
          }}
        >
          <div className="flex items-center gap-2.5 mb-5">
            <div
              className="w-7 h-7 flex items-center justify-center"
              style={{ background: "#e8651c" }}
            >
              <span className="text-white text-xs font-bold">C</span>
            </div>
            <h1
              className="text-base font-bold tracking-tight uppercase"
              style={{ color: "#1a1814" }}
            >
              Convalytics
            </h1>
          </div>

          <p
            className="text-sm font-bold mb-1"
            style={{ color: "#1a1814" }}
          >
            Analytics for Convex apps
          </p>
          <p
            className="text-xs leading-relaxed mb-5"
            style={{ color: "#6b6456" }}
          >
            Copy the prompt below and paste it into your AI coding agent.
            It handles everything from page view tracking to custom event
            instrumentation. No account needed.
          </p>

          <button
            onClick={copyPrompt}
            className="w-full flex items-center justify-center gap-2 py-3 text-xs font-bold uppercase tracking-wider cursor-pointer transition-all"
            style={{
              background: copied ? "#2d7a2d" : "#1a1814",
              color: "#fff",
              border: `2px solid ${copied ? "#2d7a2d" : "#1a1814"}`,
            }}
          >
            {copied ? "Copied to clipboard" : "Copy agent prompt"}
          </button>

          <p
            className="text-[10px] mt-3 text-center leading-relaxed"
            style={{ color: "#9b9488" }}
          >
            Works with Claude, Cursor, Windsurf, Codex, and any AI coding agent.
          </p>
        </div>

        {/* Pricing hint */}
        <p className="text-center text-[10px]" style={{ color: "#9b9488" }}>
          Web analytics free forever · 50K events/mo free · Solo $29 · Pro $99
        </p>

        {/* Secondary — sign in for existing users */}
        <div
          className="bg-white px-6 py-4 flex items-center justify-between"
          style={{ border: "2px solid #1a1814" }}
        >
          <p className="text-xs" style={{ color: "#6b6456" }}>
            View analytics and manage billing.
          </p>
          <button
            className="flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-all"
            style={{
              background: "#fff",
              color: "#1a1814",
              border: "2px solid #1a1814",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#1a1814";
              e.currentTarget.style.color = "#e9e6db";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#fff";
              e.currentTarget.style.color = "#1a1814";
            }}
            onClick={() => void signIn("google")}
          >
            <svg width="14" height="14" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
              <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
              <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
              <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
            </svg>
            Continue with Google
          </button>
        </div>
      </div>

      {/* Footer — pinned to bottom */}
      <div className="w-full max-w-md mx-4 flex items-center justify-between mt-auto pt-4">
        <span className="text-[10px]" style={{ color: "#9b9488" }}>© 2026 Tethered Software Inc.</span>
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/Dan-Cleary/convalytics"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[10px] transition-colors"
            style={{ color: "#9b9488" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#1a1814")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#9b9488")}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            GitHub
          </a>
          <a
            href="https://x.com/DanJCleary"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[10px] transition-colors"
            style={{ color: "#9b9488" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#1a1814")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#9b9488")}
          >
            <span style={{ color: "#9b9488" }}>Created by</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622 5.912-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            @DanJCleary
          </a>
        </div>
      </div>
    </div>
  );
}
