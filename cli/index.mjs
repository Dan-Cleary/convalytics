#!/usr/bin/env node
import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const INGEST_URL = "https://peaceful-bobcat-731.convex.site/ingest";
const SCRIPT_URL = "https://peaceful-bobcat-731.convex.site/script.js";

const args = process.argv.slice(2);
const command = args[0] ?? "init";

if (command !== "init") {
  console.error(`Unknown command: ${command}`);
  console.error("Usage: npx convalytics init");
  process.exit(1);
}

console.log("Convalytics setup\n");

// 1. Verify this is a Convex project
const pkgPath = join(process.cwd(), "package.json");
if (!existsSync(pkgPath)) {
  bail("No package.json found. Run this from your project root.");
}

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
if (!allDeps.convex) {
  bail('No "convex" dependency found. Is this a Convex project?');
}

const convexDir = join(process.cwd(), "convex");
if (!existsSync(convexDir)) {
  bail('No "convex/" directory found. Is this a Convex project?');
}

// 2. Install the component package
console.log("Installing @convalytics/convex...");
try {
  execSync("npm install @convalytics/convex", { stdio: "inherit" });
} catch {
  bail("npm install failed. Check your network connection and try again.");
}

// 3. Patch convex/convex.config.ts
const configPath = join(convexDir, "convex.config.ts");
if (!existsSync(configPath)) {
  // Create from scratch
  writeFileSync(
    configPath,
    `import { defineApp } from "convex/server";
import analytics from "@convalytics/convex/convex.config";

const app = defineApp();
app.use(analytics);

export default app;
`,
  );
  console.log("Created convex/convex.config.ts");
} else {
  // File exists — check if already configured
  const existing = readFileSync(configPath, "utf8");
  if (existing.includes("@convalytics/convex")) {
    console.log("convex/convex.config.ts already includes Convalytics — skipping.");
  } else {
    // Append usage instructions rather than auto-patching to avoid breaking existing config
    console.log(
      "\nconvex/convex.config.ts already exists. Add the following lines manually:\n",
    );
    console.log('  import analytics from "@convalytics/convex/convex.config";');
    console.log("  app.use(analytics);");
    console.log();
  }
}

// 4. Create convex/analytics.ts
const analyticsPath = join(convexDir, "analytics.ts");
if (!existsSync(analyticsPath)) {
  writeFileSync(
    analyticsPath,
    `import { components } from "./_generated/api";
import { Convalytics } from "@convalytics/convex";

export const analytics = new Convalytics(components.convalytics, {
  writeKey: process.env.CONVALYTICS_WRITE_KEY!,
});
`,
  );
  console.log("Created convex/analytics.ts");
} else {
  console.log("convex/analytics.ts already exists — skipping.");
}

// 5. Patch index.html if present
const htmlPath = join(process.cwd(), "index.html");
if (existsSync(htmlPath)) {
  const html = readFileSync(htmlPath, "utf8");
  if (html.includes(SCRIPT_URL)) {
    console.log("Script tag already present in index.html — skipping.");
  } else if (html.includes("</head>")) {
    const scriptTag = `  <script defer src="${SCRIPT_URL}?key=CONVALYTICS_WRITE_KEY"></script>`;
    const patched = html.replace("</head>", `${scriptTag}\n</head>`);
    writeFileSync(htmlPath, patched);
    console.log("Added script tag to index.html");
    console.log(
      "  Remember to replace CONVALYTICS_WRITE_KEY with your actual write key.",
    );
  }
}

// 6. Done — print next steps
console.log(`
Done! Next steps:

  1. Get your write key from https://convalytics.dev

  2. Set the environment variable:
       npx convex env set CONVALYTICS_WRITE_KEY your_write_key_here

  3. Call configure() once to store config in your deployment.
     Add a setup mutation to convex/setup.ts:

       import { internalMutation } from "./_generated/server";
       import { analytics } from "./analytics";

       export const run = internalMutation({
         handler: async (ctx) => { await analytics.configure(ctx); },
       });

     Then run it:
       npx convex run --prod setup:run

  4. Track events from your mutations and actions:

       await analytics.track(ctx, {
         name: "user_signed_up",
         userId: String(userId),
         props: { plan: "pro" },
       });

  5. Events appear in your Convalytics dashboard under Custom Events.
`);

function bail(msg) {
  console.error(`Error: ${msg}`);
  process.exit(1);
}
