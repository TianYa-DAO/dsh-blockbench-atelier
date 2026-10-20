#!/usr/bin/env node
import { readFile, readdir, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { analyzeModel, loadModel, validateModel } from "../lib/model.js";
import { createFromSpecFile } from "../lib/generate.js";
import { inspectTexture } from "../lib/texture.js";

const help = `Blockbench Atelier - offline Blockbench inspection and Bedrock starter generation

Commands:
  inspect <model.bbmodel>
  validate <model.bbmodel>
  texture <image.png> [--logical WIDTH HEIGHT]
  create <spec.json> <new-model.bbmodel> [new-atlas.png]
  catalog <sample-directory> [output.json]
`;

export async function catalog(directory) {
  const base = resolve(directory), files = [];
  async function walk(dir, depth = 0) {
    if (depth > 8 || files.length >= 250) return;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const file = join(dir, entry.name);
      if (entry.isDirectory()) await walk(file, depth + 1);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".bbmodel")) files.push(file);
    }
  }
  await walk(base);
  const results = [];
  for (const file of files) {
    try {
      const { model, sha256 } = await loadModel(file);
      const { name, modelIdentifier, format, formatVersion, resolution, elements, cubes, otherElements, planes,
        fractionalDimensions, rotatedCubes, boxUvCubes, mirroredUvCubes, rawBounds, boundsNote, groups,
        maxGroupDepth, rotatedGroups, unparentedElements, animations, faceStats, uvCoverage, textures } = analyzeModel(model);
      results.push({ file: basename(file), sha256, name, modelIdentifier, format, formatVersion, resolution, elements,
        cubes, otherElements, planes, fractionalDimensions, rotatedCubes, boxUvCubes, mirroredUvCubes, rawBounds,
        boundsNote, groups, maxGroupDepth, rotatedGroups, unparentedElements, animations, faceStats, uvCoverage,
        textures: textures.map(t => ({ name: t.name, width: t.width, height: t.height, logicalWidth: t.uv_width,
          logicalHeight: t.uv_height, embedded: t.embedded, image: t.image, imageError: t.imageError })) });
    } catch (error) { results.push({ file: basename(file), error: error.message }); }
  }
  return { sampleCount: results.length, scannedDirectory: base, assetsCopied: false,
    limitation: "Static project measurements do not prove appearance, quality, animation, render output, license, or export compatibility.", samples: results };
}

export async function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;
  try {
    let result;
    if (command === "inspect" && args[0]) { const { model, sha256 } = await loadModel(args[0]); result = { sha256, ...analyzeModel(model) }; }
    else if (command === "validate" && args[0]) { const { model } = await loadModel(args[0]); result = validateModel(model); }
    else if (command === "texture" && args[0]) {
      let logicalSize;
      if (args[1] === "--logical" && args.length === 4) logicalSize = { width: Number(args[2]), height: Number(args[3]) };
      else if (args.length !== 1) throw new Error("Usage: texture <image.png> [--logical WIDTH HEIGHT]");
      result = await inspectTexture(args[0], logicalSize);
    } else if (command === "create" && args.length >= 2 && args.length <= 3) {
      result = await createFromSpecFile(args[0], args[1], args[2]);
    } else if (command === "catalog" && args[0]) {
      result = await catalog(args[0]);
      if (args[1]) {
        const target = resolve(args[1]);
        const info = await stat(target).catch(() => null);
        if (info) throw new Error("Catalog output already exists; choose a new path.");
        const { open } = await import("node:fs/promises"), handle = await open(target, "wx");
        try { await handle.writeFile(JSON.stringify(result, null, 2) + "\n"); } finally { await handle.close(); }
        result.writtenTo = target;
      }
    } else { process.stdout.write(help); process.exitCode = 2; return; }
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } catch (error) { process.stderr.write(`bb-atelier: ${error.message}\n`); process.exitCode = 1; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
