// Emit dist/.well-known/agent-skills/index.json for the Agent Skills
// Discovery RFC v0.2.0. Lists the convalytics-setup skill (the SKILL.md
// living in the convex-component repo) with a SHA-256 digest computed
// from the live source so agents can verify integrity.
//
// Spec: https://github.com/cloudflare/agent-skills-discovery-rfc

import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_SOURCE_URL =
  "https://raw.githubusercontent.com/Dan-Cleary/convalytics-convex-component/main/SKILL.md";
const SKILL_PUBLIC_URL = "https://convalytics.dev/skill.md";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(
  __dirname,
  "../dist/.well-known/agent-skills/index.json",
);

const res = await fetch(SKILL_SOURCE_URL);
if (!res.ok) {
  throw new Error(
    `Failed to fetch SKILL.md (${res.status} ${res.statusText}) from ${SKILL_SOURCE_URL}`,
  );
}
const body = await res.text();
const digest = createHash("sha256").update(body).digest("hex");

const index = {
  $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
  skills: [
    {
      name: "convalytics-setup",
      type: "skill-md",
      description:
        "Install Convalytics analytics in a Convex project. Provisions a project, installs the convalytics-dev backend component, writes the analytics singleton, instruments page views and custom events, and verifies ingestion before the human claims the project.",
      url: SKILL_PUBLIC_URL,
      digest: `sha256:${digest}`,
    },
  ],
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(index, null, 2) + "\n");
console.log(`wrote ${outPath} (digest: sha256:${digest.slice(0, 12)}…)`);
