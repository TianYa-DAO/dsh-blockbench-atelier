import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const files = [
  "lib/index.js", "lib/model.js", "lib/texture.js", "lib/generate.js", "lib/live.js", "lib/live-codec.js", "lib/op-catalog.js", "lib/model-forge.js", "lib/wish.js", "lib/generators/index.js", "lib/generators/materials.js", "lib/generators/atlas.js", "lib/generators/parts.js", "lib/generators/weapons.js", "lib/generators/props.js", "lib/generators/polearms.js", "lib/generators/creature.js", "lib/generators/crown.js", "lib/generators/wing.js",
  "bin/bb-atelier.js", "scripts/check.js", "tests/model.test.js", "tests/texture.test.js", "tests/live.test.js", "tests/generators.test.js", "tests/wish.test.js", "tests/toggles.test.js", "tests/blade.test.js"
];

for (const file of files) {
  if (!existsSync(file)) throw new Error(`Required project file is missing: ${file}`);
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

for (const file of ["README.md", "LICENSE", "references/sample-derived-guidelines.md",
  "references/live-channel-contract.md", "references/modeling-playbook.md", "addon/bb-bridge.js", "llms.txt", "CHANGELOG.md",
  "skills/mc-blockbench-modeling/SKILL.md", "skills/mc-pixel-textures/SKILL.md", "examples/creature.json"]) {
  if (!existsSync(file)) throw new Error(`Required package content is missing: ${file}`);
}

process.stdout.write(`Checked ${files.length} JavaScript files and required package content.\n`);
