import { startOAuthFlow } from "../lib/auth";
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

  function copyPrompt() {
    void navigator.clipboard.writeText(AGENT_PROMPT).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center"
      style={{ background: "#e9e6db" }}
    >
      <div className="w-full max-w-md mx-4 flex flex-col gap-5">
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

        {/* Secondary — sign in for existing users */}
        <div
          className="bg-white px-6 py-4 flex items-center justify-between"
          style={{ border: "2px solid #1a1814" }}
        >
          <p className="text-xs" style={{ color: "#6b6456" }}>
            Already set up? View your dashboard.
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
            onClick={() => void startOAuthFlow()}
          >
            <img
              src="https://www.convex.dev/favicon.ico"
              alt=""
              className="w-3.5 h-3.5"
            />
            Sign in
          </button>
        </div>
      </div>
    </div>
  );
}
