#!/usr/bin/env node
import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
import { createInterface } from "readline";

// ─── Config ─────────────────────────────────────────────────────────────────

const SITE_URL = "https://basic-goshawk-557.convex.site";
const INGEST_URL = `${SITE_URL}/ingest`;
const VERIFY_URL = `${SITE_URL}/verify`;
const PROVISION_URL = `${SITE_URL}/api/provision`;
const SCRIPT_URL = `${SITE_URL}/script.js`;
const DASHBOARD_URL = process.env.CONVALYTICS_DASHBOARD_URL || "https://convalytics.dev";

// ─── CLI entry ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0] ?? "help";

const commands = { init, verify, help };

if (!commands[command]) {
  error(`Unknown command: ${command}`);
  help();
  process.exit(1);
}

commands[command]();

// ─── Commands ────────────────────────────────────────────────────────────────

async function init() {
  print("\n╔══════════════════════════════╗");
  print("║   Convalytics · Setup        ║");
  print("╚══════════════════════════════╝\n");

  // 1. Verify this is a Convex project
  const pkgPath = join(process.cwd(), "package.json");
  if (!existsSync(pkgPath)) bail("No package.json found. Run this from your project root.");

  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (!allDeps.convex) bail('No "convex" dependency found. Is this a Convex project?');

  const convexDir = join(process.cwd(), "convex");
  if (!existsSync(convexDir)) bail('No "convex/" directory found. Is this a Convex project?');

  ok("Convex project detected");

  // 2. Read Convex deployment info from local config
  let convexDeploymentSlug = null;
  for (const envFile of [".env.local", ".env", ".env.development.local"]) {
    const envPath = join(process.cwd(), envFile);
    if (existsSync(envPath)) {
      const envContent = readFileSync(envPath, "utf8");
      const match = envContent.match(/CONVEX_DEPLOYMENT\s*=\s*\w+:([^\s#]+)/);
      if (match) {
        convexDeploymentSlug = match[1];
        ok(`Convex deployment: ${convexDeploymentSlug}`);
        break;
      }
    }
  }
  if (!convexDeploymentSlug) {
    warn("Could not detect Convex deployment slug from .env.local");
  }

  // 3. Get or provision write key
  // Always provision via the backend — it deduplicates on convexDeploymentSlug,
  // so running init twice for the same deployment returns the same project.
  // Explicit write key from CLI arg or shell env skips provisioning.
  let writeKey = args[1] ?? process.env.CONVALYTICS_WRITE_KEY ?? "";
  let claimUrl = null;

  if (writeKey) {
    print(`  Write key: ${writeKey.slice(0, 8)}${"*".repeat(Math.max(0, writeKey.length - 8))}`);
  } else {
    step("Provisioning analytics project...");
    const projectName = pkg.name || "Untitled Project";
    try {
      const provisionBody = { name: projectName };
      if (convexDeploymentSlug) provisionBody.convexDeploymentSlug = convexDeploymentSlug;

      const resp = await fetch(PROVISION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(provisionBody),
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        bail(`Provisioning failed (${resp.status}): ${body}`);
      }
      const data = await resp.json();
      writeKey = data.writeKey;
      claimUrl = data.claimUrl;
      ok(`Project provisioned: ${projectName}`);
      print(`  Write key: ${writeKey.slice(0, 8)}${"*".repeat(Math.max(0, writeKey.length - 8))}`);
    } catch (e) {
      bail(`Could not reach Convalytics: ${e.message}`);
    }
  }

  // 3. Install the component package
  step("Installing convalytics-dev...");
  try {
    execSync(`npm install convalytics-dev`, { stdio: "inherit" });
    ok(`Installed convalytics-dev`);
  } catch {
    bail("npm install failed. Check your network connection and try again.");
  }

  // 4. Patch convex/convex.config.ts
  step("Configuring convex/convex.config.ts...");
  const configPath = join(convexDir, "convex.config.ts");
  if (!existsSync(configPath)) {
    writeFileSync(configPath, [
      `import { defineApp } from "convex/server";`,
      `import analytics from "convalytics-dev/convex.config";`,
      ``,
      `const app = defineApp();`,
      `app.use(analytics);`,
      ``,
      `export default app;`,
      ``,
    ].join("\n"));
    ok("Created convex/convex.config.ts");
  } else {
    const src = readFileSync(configPath, "utf8");
    // Check for any existing Convalytics config (current or legacy package names)
    const alreadyConfigured = src.includes("convalytics-dev") || src.includes("@convalytics/convex") || src.includes("convalytics");
    if (alreadyConfigured) {
      // If using a legacy package name, update the import to convalytics-dev
      if (!src.includes("convalytics-dev") && (src.includes("@convalytics/convex"))) {
        const patched = src.replace(
          /from\s+["']@convalytics\/convex\/convex\.config["']/g,
          `from "convalytics-dev/convex.config"`,
        );
        if (patched !== src) {
          writeFileSync(configPath, patched);
          ok("Updated convex/convex.config.ts import from @convalytics/convex → convalytics-dev");
        } else {
          ok("convex/convex.config.ts already includes Convalytics");
        }
      } else {
        ok("convex/convex.config.ts already includes Convalytics");
      }
    } else {
      // Inject import after last import line, and app.use() before export default
      let patched = src;

      const importLine = `import analytics from "convalytics-dev/convex.config";`;
      // Insert import after the last existing import line
      const lastImportIdx = [...patched.matchAll(/^import .+$/gm)].at(-1);
      if (lastImportIdx !== undefined) {
        const insertAt = lastImportIdx.index + lastImportIdx[0].length;
        patched = patched.slice(0, insertAt) + "\n" + importLine + patched.slice(insertAt);
      } else {
        patched = importLine + "\n" + patched;
      }

      // Insert app.use(analytics); before export default
      patched = patched.replace(
        /(export default\s+app\s*;)/,
        `app.use(analytics);\n\n$1`,
      );

      writeFileSync(configPath, patched);
      ok("Patched convex/convex.config.ts");
    }
  }

  // 5. Create convex/analytics.ts
  step("Creating convex/analytics.ts...");
  const analyticsPath = join(convexDir, "analytics.ts");
  if (existsSync(analyticsPath)) {
    ok("convex/analytics.ts already exists — skipping");
  } else {
    writeFileSync(analyticsPath, [
      `import { components } from "./_generated/api";`,
      `import { Convalytics } from "convalytics-dev";`,
      ``,
      `// Singleton — import this wherever you need to track events.`,
      `// The write key is safe to commit: it's a public ingest identifier that`,
      `// ships in the browser script tag too.`,
      `export const analytics = new Convalytics(components.convalytics, {`,
      `  writeKey: ${JSON.stringify(writeKey)},`,
      `});`,
      ``,
    ].join("\n"));
    ok("Created convex/analytics.ts");
  }

  // 6. Patch index.html if it exists
  const scriptVersion = "2";
  const htmlPath = join(process.cwd(), "index.html");
  if (existsSync(htmlPath)) {
    step("Adding script tag to index.html...");
    const html = readFileSync(htmlPath, "utf8");
    const scriptTag = `  <script defer src="${SCRIPT_URL}?key=${writeKey}&v=${scriptVersion}"></script>`;
    if (html.includes(SCRIPT_URL)) {
      const escapedScriptURL = SCRIPT_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const updated = html.replace(
        new RegExp(`<script[^>]*\\bsrc=(["'])${escapedScriptURL}\\1[^>]*>[\\s\\S]*?<\\/script>`, 'g'),
        scriptTag,
      );
      if (updated !== html) {
        writeFileSync(htmlPath, updated);
        ok("Updated script tag in index.html");
      } else {
        ok("Script tag already in index.html");
      }
    } else if (html.includes("</head>")) {
      writeFileSync(htmlPath, html.replace("</head>", `${scriptTag}\n</head>`));
      ok("Added script tag to index.html");
    } else {
      warn("Could not find </head> in index.html. Add the script tag manually:");
      warn(`  ${scriptTag}`);
    }
  }

  // 7. Install SKILL.md into project for AI agents
  step("Installing agent skill file...");
  const skillSrc = join(process.cwd(), "node_modules", "convalytics-dev", "SKILL.md");
  const skillDst = join(process.cwd(), ".claude", "skills", "convalytics", "SKILL.md");
  try {
    if (existsSync(skillSrc) && !existsSync(skillDst)) {
      mkdirSync(join(process.cwd(), ".claude", "skills", "convalytics"), { recursive: true });
      writeFileSync(skillDst, readFileSync(skillSrc, "utf8"));
      ok("Installed SKILL.md → .claude/skills/convalytics/SKILL.md");
    } else if (!existsSync(skillSrc)) {
      ok("Skill file: see https://github.com/Dan-Cleary/convalytics-convex-component/blob/main/SKILL.md");
    } else {
      ok("Agent skill already installed");
    }
  } catch {
    warn("Could not install skill file — add it manually from the docs");
  }

  // 8. Save .convalytics dotfile for claim URL recovery
  const dotfilePath = join(process.cwd(), ".convalytics");
  const dotfileData = { writeKey };
  if (claimUrl) dotfileData.claimUrl = claimUrl;
  if (convexDeploymentSlug) dotfileData.deploymentSlug = convexDeploymentSlug;
  try {
    const gitignorePath = join(process.cwd(), ".gitignore");
    if (existsSync(gitignorePath)) {
      const gitignore = readFileSync(gitignorePath, "utf8");
      if (!gitignore.includes(".convalytics")) {
        writeFileSync(gitignorePath, gitignore.trimEnd() + "\n.convalytics\n");
        ok("Added .convalytics to .gitignore");
      }
    } else {
      writeFileSync(gitignorePath, ".convalytics\n");
      ok("Created .gitignore with .convalytics entry");
    }

    writeFileSync(dotfilePath, JSON.stringify(dotfileData, null, 2) + "\n");
    ok("Saved .convalytics config file");
  } catch {
    warn("Could not save .convalytics config file");
  }

  // 9. Done
  print("\n" + "─".repeat(50));
  print("✅  Setup complete!\n");

  if (claimUrl) {
    print("╔══════════════════════════════════════════════════╗");
    print("║  CLAIM YOUR PROJECT                             ║");
    print("║                                                  ║");
    print(`║  ${claimUrl}`);
    print("║                                                  ║");
    print("║  Share this link with the project owner to       ║");
    print("║  connect analytics to their Convalytics account. ║");
    print("╚══════════════════════════════════════════════════╝\n");
  }

  print("⚠️  IMPORTANT: Two separate deploys are needed for prod tracking.\n");
  print("  1. Commit your changes:");
  print("     git add -A && git commit -m 'Add Convalytics analytics'\n");
  print("  2. Deploy the Convex backend to prod:");
  print("     npx convex deploy");
  print("     (This is separate from your frontend deploy — git push /");
  print("     vercel deploy only updates the frontend. Your Convex backend");
  print("     needs its own deploy or events will silently drop in prod.)\n");
  print("  In CI? Set CONVEX_DEPLOY_KEY in your deploy env and run:");
  print("     npx convex deploy --cmd 'npm run build'\n");

  print("Next: add tracking to your mutations and actions:\n");
  print(`  import { analytics } from "./analytics";`);
  print(`  await analytics.track(ctx, {`);
  print(`    name: "user_signed_up",`);
  print(`    userId: String(userId),`);
  print(`    props: { plan: "pro" },`);
  print(`  });\n`);
  print(`Verify events are flowing:`);
  print(`  npx convalytics verify ${writeKey}\n`);
  print(`Dashboard: ${DASHBOARD_URL}`);
  print("─".repeat(50) + "\n");
}

async function verify() {
  print("\n╔══════════════════════════════╗");
  print("║   Convalytics · Verify       ║");
  print("╚══════════════════════════════╝\n");

  let dotfile = null;
  try {
    const dotfilePath = join(process.cwd(), ".convalytics");
    if (existsSync(dotfilePath)) {
      dotfile = JSON.parse(readFileSync(dotfilePath, "utf8"));
    }
  } catch { /* ignore */ }

  let writeKey = args[1] ?? process.env.CONVALYTICS_WRITE_KEY ?? dotfile?.writeKey ?? "";
  if (!writeKey) {
    writeKey = await prompt("Write key: ");
    if (!writeKey) bail("Write key is required.");
  }

  const testEvent = {
    writeKey,
    name: "convalytics_verify",
    userId: `cli-verify-${Date.now()}`,
    sessionId: crypto.randomUUID(),
    timestamp: Date.now(),
    props: { source: "cli", version: "0.1.0" },
  };

  step(`Sending test event "convalytics_verify" to ${INGEST_URL}...`);

  const verifySentAt = Date.now();
  try {
    const resp = await fetch(INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testEvent),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      const msg = body || `HTTP ${resp.status}`;
      if (resp.status === 401) {
        error(`Invalid write key. Get your key from ${DASHBOARD_URL}`);
      } else {
        error(`Ingest returned ${resp.status}: ${msg}`);
      }
      process.exit(1);
    }

    ok(`Event delivered (HTTP ${resp.status})`);
  } catch (e) {
    error(`Network error: ${e.message}`);
    process.exit(1);
  }

  // Poll /verify to confirm the test event actually landed in storage and
  // surface real traffic stats. Writes are fast, but give Convex a moment.
  step("Confirming event landed in storage...");
  const pollStart = Date.now();
  const pollDeadline = pollStart + 10_000;
  let stats = null;
  let testEventSeen = false;

  while (Date.now() < pollDeadline) {
    try {
      const verifyResp = await fetch(`${VERIFY_URL}?writeKey=${encodeURIComponent(writeKey)}`);
      if (verifyResp.ok) {
        stats = await verifyResp.json();
        testEventSeen = !!stats?.events?.lastTimestamp && stats.events.lastTimestamp >= verifySentAt;
        if (testEventSeen) break;
      } else if (verifyResp.status === 401) {
        error(`Invalid write key.`);
        process.exit(1);
      }
    } catch {
      // Network blip — keep polling until deadline.
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  if (testEventSeen) {
    ok(`Test event confirmed in storage (took ${Date.now() - pollStart}ms)`);
  } else {
    warn("Test event accepted but not yet visible via /verify. Check your dashboard.");
  }

  if (stats) {
    print("\n  Recent activity (last 24h):");
    print(`    Custom events: ${stats.events.last24h}  ·  last 1h: ${stats.events.last1h}  ·  last 5m: ${stats.events.last5m}`);
    print(`    Page views:    ${stats.pageviews.last24h}  ·  last 1h: ${stats.pageviews.last1h}  ·  last 5m: ${stats.pageviews.last5m}`);
    if (stats.environments?.length) {
      print(`    Environments:  ${stats.environments.join(", ")}`);
    } else {
      print(`    Environments:  (none tagged yet — add the component + analytics.track() to see dev/prod breakdowns)`);
    }
    if (stats.events.last24h === 1 && testEventSeen) {
      print("\n  Only the CLI test event is visible. If you expected real traffic:");
      print("    • Browser: confirm the <script> tag is in your deployed index.html");
      print("    • Server:  confirm analytics.track() is being called + `npx convex deploy` ran");
    }
  }

  print(`\n  Dashboard: ${DASHBOARD_URL}`);
  if (dotfile && dotfile.claimUrl && dotfile.writeKey === writeKey) {
    print(`  Claim URL: ${dotfile.claimUrl}`);
  }
  print("");
}

function help() {
  print(`
Convalytics CLI

USAGE
  npx convalytics <command> [options]

COMMANDS
  init [write-key]    Set up Convalytics in a Convex project
                      If no write key is provided, one is auto-provisioned.
  verify [write-key]  Send a test event to confirm the pipeline works
  help                Show this help

EXAMPLES
  npx convalytics init                 Auto-provision (no account needed)
  npx convalytics init wk_abc123       Use an existing write key
  npx convalytics verify wk_abc123

The write key can also be set via the CONVALYTICS_WRITE_KEY environment variable.

Get your write key from ${DASHBOARD_URL} — or just run init and we'll create one.
`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function print(msg) { process.stdout.write(msg + "\n"); }
function step(msg) { process.stdout.write(`\n  · ${msg}\n`); }
function ok(msg) { process.stdout.write(`  ✓ ${msg}\n`); }
function warn(msg) { process.stdout.write(`  ⚠ ${msg}\n`); }
function error(msg) { process.stderr.write(`  ✗ ${msg}\n`); }

function bail(msg) {
  error(msg);
  process.exit(1);
}

function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`  ${question}`, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}