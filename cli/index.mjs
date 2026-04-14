#!/usr/bin/env node
import { execSync, spawnSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
import { createInterface } from "readline";

// ─── Config ─────────────────────────────────────────────────────────────────

const SITE_URL = "https://basic-goshawk-557.convex.site";
const INGEST_URL = `${SITE_URL}/ingest`;
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
  const localComponentPath = join(__dirname, "..", "component");
  const useLocal = existsSync(join(localComponentPath, "package.json"));
  try {
    const installTarget = useLocal
      ? `file:${localComponentPath}`
      : "convalytics-dev";
    execSync(`npm install ${installTarget}`, { stdio: "inherit" });
    ok(`Installed convalytics-dev${useLocal ? " (local)" : ""}`);
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
    if (src.includes("convalytics-dev")) {
      ok("convex/convex.config.ts already includes Convalytics");
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
      `export const analytics = new Convalytics(components.convalytics, {`,
      `  writeKey: process.env.CONVALYTICS_WRITE_KEY!,`,
      `  deploymentName: process.env.CONVALYTICS_DEPLOYMENT_NAME,`,
      `});`,
      ``,
    ].join("\n"));
    ok("Created convex/analytics.ts");
  }

  // 6. Set environment variables via Convex CLI
  step("Setting CONVALYTICS_WRITE_KEY in Convex environment...");
  const envResult = spawnSync(
    "npx",
    ["convex", "env", "set", "CONVALYTICS_WRITE_KEY", writeKey],
    { stdio: "inherit" },
  );
  if (envResult.status === 0) {
    ok("Set CONVALYTICS_WRITE_KEY in Convex environment");
  } else {
    warn("Could not set env var automatically. Run manually:");
    warn(`  npx convex env set CONVALYTICS_WRITE_KEY ${writeKey}`);
  }

  if (convexDeploymentSlug) {
    if (!isValidDeploymentSlug(convexDeploymentSlug)) {
      warn(`"${convexDeploymentSlug}" doesn't look like a Convex deployment slug (expected format: word-word-123).`);
      warn(`Environment tagging may not work correctly. Check your .env.local for the CONVEX_DEPLOYMENT value.`);
    }
    step("Setting CONVALYTICS_DEPLOYMENT_NAME for environment tagging...");
    const dnResult = spawnSync(
      "npx",
      ["convex", "env", "set", "CONVALYTICS_DEPLOYMENT_NAME", convexDeploymentSlug],
      { stdio: "inherit" },
    );
    if (dnResult.status === 0) {
      ok(`Set CONVALYTICS_DEPLOYMENT_NAME = ${convexDeploymentSlug}`);
    } else {
      warn("Could not set env var automatically. Run manually:");
      warn(`  npx convex env set CONVALYTICS_DEPLOYMENT_NAME ${convexDeploymentSlug}`);
    }
  }

  // 7. Patch index.html if it exists
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

  // 8. Install SKILL.md into project for AI agents
  step("Installing agent skill file...");
  const skillSrcNpm = join(process.cwd(), "node_modules", "convalytics-dev", "SKILL.md");
  const skillSrcLocal = join(localComponentPath, "SKILL.md");
  const skillSrc = existsSync(skillSrcNpm) ? skillSrcNpm : existsSync(skillSrcLocal) ? skillSrcLocal : null;
  const skillDst = join(process.cwd(), ".claude", "skills", "convalytics", "SKILL.md");
  try {
    if (skillSrc && !existsSync(skillDst)) {
      mkdirSync(join(process.cwd(), ".claude", "skills", "convalytics"), { recursive: true });
      writeFileSync(skillDst, readFileSync(skillSrc, "utf8"));
      ok("Installed SKILL.md → .claude/skills/convalytics/SKILL.md");
    } else if (!skillSrc) {
      ok("Skill file: see https://github.com/convalytics/convalytics/blob/main/component/SKILL.md");
    } else {
      ok("Agent skill already installed");
    }
  } catch {
    warn("Could not install skill file — add it manually from the docs");
  }

  // 9. Save .convalytics dotfile for claim URL recovery
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

  // 10. Done
  print("\n" + "─".repeat(50));
  print("✅  Setup complete!\n");

  if (claimUrl || (dotfile && dotfile.claimUrl && dotfile.writeKey === writeKey)) {
    const displayClaimUrl = claimUrl || dotfile.claimUrl;
    print("╔══════════════════════════════════════════════════╗");
    print("║  CLAIM YOUR PROJECT                             ║");
    print("║                                                  ║");
    print(`║  ${displayClaimUrl}`);
    print("║                                                  ║");
    print("║  Share this link with the project owner to       ║");
    print("║  connect analytics to their Convalytics account. ║");
    print("╚══════════════════════════════════════════════════╝\n");
  }

  print("⚠️  IMPORTANT: Commit and deploy to start tracking in production.\n");
  print("  The script tag and config changes are local — web analytics");
  print("  won't collect data in production until you deploy.\n");
  print("  git add -A && git commit -m 'Add Convalytics analytics'");
  print("  # then deploy as usual (e.g. git push, vercel deploy, etc.)\n");

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

  try {
    const resp = await fetch(INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testEvent),
    });

    if (resp.ok) {
      ok(`Event delivered (HTTP ${resp.status})`);
      print("\n  Check your Convalytics dashboard → Custom Events");
      print(`  Look for: convalytics_verify\n`);
      print(`  Dashboard: ${DASHBOARD_URL}\n`);
      if (dotfile && dotfile.claimUrl && dotfile.writeKey === writeKey) {
        print(`  Claim URL: ${dotfile.claimUrl}\n`);
      }
    } else {
      const body = await resp.text().catch(() => "");
      const msg = body || `HTTP ${resp.status}`;
      if (resp.status === 401) {
        error(`Invalid write key. Get your key from ${DASHBOARD_URL}`);
      } else {
        error(`Ingest returned ${resp.status}: ${msg}`);
      }
      process.exit(1);
    }
  } catch (e) {
    error(`Network error: ${e.message}`);
    process.exit(1);
  }
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

function isValidDeploymentSlug(slug) {
  // Expect Convex production deployment slug format: word-word-123
  return /^[a-z]+-[a-z]+-\d+$/.test(slug);
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