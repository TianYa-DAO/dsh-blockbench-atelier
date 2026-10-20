import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const files = [
  "lib/index.js", "lib/model.js", "lib/texture.js", "lib/generate.js", "lib/live.js", "lib/live-codec.js",
  "bin/bb-atelier.js", "scripts/check.js", "tests/model.test.js", "tests/texture.test.js", "tests/live.test.js"
];

for (const file of files) {
  if (!existsSync(file)) throw new Error(`Required project file is missing: ${file}`);
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

for (const file of ["README.md", "LICENSE", "references/sample-derived-guidelines.md",
  "references/live-channel-contract.md", "addon/bb-bridge.js",
  "skills/mc-blockbench-modeling/SKILL.md", "skills/mc-pixel-textures/SKILL.md", "examples/creature.json"]) {
  if (!existsSync(file)) throw new Error(`Required package content is missing: ${file}`);
}

process.stdout.write(`Checked ${files.length} JavaScript files and required package content.\n`);
