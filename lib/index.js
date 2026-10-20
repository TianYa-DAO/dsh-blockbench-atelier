import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { analyzeModel, loadModel, validateModel } from "./model.js";
import { createModel } from "./generate.js";
import { inspectTexture } from "./texture.js";
import { registerLive } from "./live.js";
import { forgeModel, listFamilies } from "./model-forge.js";

export const name = "dsh-blockbench-atelier";
export const inject = ["skills", "tools"];
const root = fileURLToPath(new URL("../", import.meta.url));
const definitions = [
  { name: "mc-blockbench-modeling", description: "Create and review Bedrock Blockbench cuboid models: sample-derived design patterns, hierarchy, pivots, rotations, 6-face and box UVs, export limits, and reference-aware iteration." },
  { name: "mc-pixel-textures", description: "Design Minecraft pixel-art texture atlases with logical UV resolution, palette roles, alpha, separate overlays, nearest-neighbor scaling, and measurable—not subjective—texture analysis." }
].map(skill => {
  const dir = join(root, "skills", skill.name);
  return { ...skill, invocation: { modelInvocable: true, userInvocable: true }, provider: name, source: "bundled", rank: 600,
    resourceBase: { kind: "directory", path: dir }, locator: { dir }, path: join(dir, "SKILL.md") };
});

const provider = {
  name: "dsh-blockbench-atelier",
  list: async () => [...definitions],
  async get(candidate) {
    const dir = candidate?.locator?.dir;
    if (typeof dir !== "string") return undefined;
    const raw = (await readFile(join(dir, "SKILL.md"), "utf8")).replace(/\r\n/g, "\n");
    const end = raw.indexOf("\n---\n", 4);
    if (!raw.startsWith("---\n") || end < 0) throw new Error(`Invalid skill frontmatter: ${candidate.name}`);
    return { ...candidate, content: raw.slice(end + 5).trimStart() };
  }
};

export function apply(ctx) {
  ctx.skills.registerProvider(() => provider);
  registerLive(ctx);

  ctx.tools.register(defineTool({
    name: "mc_bbmodel_inspect",
    description: "Read a user-selected Blockbench .bbmodel and summarize cubes, UV coverage, texture dimensions/palette/alpha, logical-vs-PNG scale, hierarchy and rotations. Reports structural measurements, not artistic or render quality. Does not extract or upload embedded images.",
    parameters: {
      modelPath: { type: "string", required: true, description: "Absolute path to a local .bbmodel selected or specified by the user." }
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render: (_args, result) => [{ type: "text", text: JSON.stringify(result) }]
    },
    isConcurrencySafe: () => true,
    async execute({ modelPath }) {
      const { model, sha256 } = await loadModel(modelPath);
      return { sha256, ...analyzeModel(model) };
    }
  }));

  ctx.tools.register(defineTool({
    name: "mc_bbmodel_validate",
    description: "Read-only structural preflight for a selected Blockbench model: duplicate/missing UUIDs, outliner references, cube bounds, texture references, PNG decoding and per-face UV atlas bounds. Does not certify game rendering, UV seams, support for arbitrary meshes, animation, or format export.",
    parameters: {
      modelPath: { type: "string", required: true, description: "Absolute path to a local .bbmodel selected or specified by the user." }
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render: (_args, result) => [{ type: "text", text: JSON.stringify(result) }]
    },
    isConcurrencySafe: () => true,
    async execute({ modelPath }) {
      const { model } = await loadModel(modelPath);
      return validateModel(model);
    }
  }));

  ctx.tools.register(defineTool({
    name: "mc_texture_analyze",
    description: "Read one user-selected local PNG and report dimensions, alpha, visible bounds, common colors, brightness and local contrast. Supply logicalWidth/logicalHeight separately for high-resolution textures; transparency does not prove emission.",
    parameters: {
      texturePath: { type: "string", required: true, description: "Absolute path to a local PNG selected or specified by the user." },
      logicalWidth: { type: "integer", description: "UV width in logical model pixels, before any image upscale." },
      logicalHeight: { type: "integer", description: "UV height in logical model pixels, before any image upscale." }
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render: (_args, result) => [{ type: "text", text: JSON.stringify(result) }]
    },
    isConcurrencySafe: () => true,
    async execute({ texturePath, logicalWidth, logicalHeight }) {
      if ((logicalWidth === undefined) !== (logicalHeight === undefined)) throw new Error("logicalWidth and logicalHeight must be supplied together.");
      const logicalSize = logicalWidth === undefined ? undefined : { width: logicalWidth, height: logicalHeight };
      if (logicalSize && (!Number.isInteger(logicalWidth) || !Number.isInteger(logicalHeight) || logicalWidth < 1 || logicalHeight < 1 || logicalWidth * logicalHeight > 16_777_216)) throw new Error("Logical dimensions must be positive integers no larger than 16M pixels.");
      return inspectTexture(texturePath, logicalSize);
    }
  }));

  ctx.tools.register(defineTool({
    name: "mc_bbmodel_create",
    description: "Create a new editable Bedrock Blockbench .bbmodel with an embedded generated PNG atlas from explicitly specified cuboid geometry. Output paths must be absolute and must not exist; this tool never overwrites. Requires geometry, palette and destination chosen by the user. For illustration use cases, inspect a sample first and review the generated file in Blockbench.",
    parameters: {
      modelPath: { type: "string", required: true, description: "Absolute path for the new .bbmodel. It must not already exist." },
      atlasPath: { type: "string", description: "Optional absolute path for a new .png copy; it must not already exist." },
      name: { type: "string", required: true, description: "Model and texture name." },
      atlasWidth: { type: "integer", description: "Atlas width in logical model pixels, power of two (16-256); default 128." },
      atlasHeight: { type: "integer", description: "Atlas height in logical model pixels, power of two (16-256); default 128." },
      parts: { type: "array", required: true, items: { type: "object", additionalProperties: true, properties: {
        name: { type: "string", required: true }, from: { type: "array", items: { type: "number" }, required: true },
        to: { type: "array", items: { type: "number" }, required: true },
        pivot: { type: "array", items: { type: "number" } }, rotation: { type: "array", items: { type: "number" } },
        color: { type: "string" }
      } } },
      primaryColor: { type: "string", description: "Base hex color #RRGGBB or #RRGGBBAA." },
      shadowColor: { type: "string" }, highlightColor: { type: "string" }, accentColor: { type: "string" },
      detailRate: { type: "number", description: "Small accent pixel frequency from 0 to 0.12; default 0.025. Use 0 for flat face-tone shading." }
    },
    output: {
      schema: { type: "object", additionalProperties: true },
      render: (_args, result) => [{ type: "text", text: JSON.stringify(result) }]
    },
    async execute({ modelPath, atlasPath, ...spec }) {
      return createModel(spec, { modelPath, atlasPath });
    }
  }));

  ctx.tools.register(defineTool({
    name: "mc_model_recipes",
    description: "List the parametric model families this plugin can forge offline (no Blockbench needed), with every parameter's type, default, range and meaning. Call this before mc_model_forge so you pass real parameters instead of guessing.",
    parameters: {},
    output: { schema: { type: "object", additionalProperties: true }, render: (_args, result) => [{ type: "text", text: JSON.stringify(result) }] },
    isConcurrencySafe: () => true,
    async execute() {
      return { ok: true, families: listFamilies() };
    }
  }));

  ctx.tools.register(defineTool({
    name: "mc_model_forge",
    description: "Wish-style modeling: forge a finished editable .bbmodel from a family plus parameters, completely offline. Emits the geometry, an embedded pixel atlas and per-face UVs, then validates the result and returns element counts, bounds and the validation verdict. Output paths must be absolute and must not already exist.",
    parameters: {
      family: { type: "string", required: true, description: "Family id from mc_model_recipes, for example weapon-sword." },
      params: { type: "object", additionalProperties: true, description: "Family parameters; omitted values fall back to the documented defaults." },
      modelPath: { type: "string", required: true, description: "Absolute path for the new .bbmodel; must not exist." },
      atlasPath: { type: "string", description: "Optional absolute path to also write the generated atlas PNG; must not exist." }
    },
    output: { schema: { type: "object", additionalProperties: true }, render: (_args, result) => [{ type: "text", text: JSON.stringify(result) }] },
    isConcurrencySafe: () => true,
    async execute({ family, params, modelPath, atlasPath }) {
      if (typeof modelPath !== "string" || !isAbsolute(modelPath)) throw new Error("modelPath must be an absolute path");
      if (existsSync(modelPath)) throw new Error("modelPath already exists; this tool never overwrites");
      if (atlasPath !== undefined) {
        if (typeof atlasPath !== "string" || !isAbsolute(atlasPath)) throw new Error("atlasPath must be an absolute path");
        if (existsSync(atlasPath)) throw new Error("atlasPath already exists; this tool never overwrites");
      }
      const forged = forgeModel({ family, params, name: basename(modelPath).replace(/\.bbmodel$/i, "") });
      await mkdir(dirname(modelPath), { recursive: true });
      await writeFile(modelPath, forged.json, "utf8");
      if (atlasPath !== undefined) {
        await mkdir(dirname(atlasPath), { recursive: true });
        await writeFile(atlasPath, forged.png);
      }
      return Object.assign({ ok: true, modelPath, atlasPath: atlasPath === undefined ? null : atlasPath, bytes: forged.json.length }, forged.stats);
    }
  }));
}
