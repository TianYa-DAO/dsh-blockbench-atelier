import { randomUUID } from "node:crypto";
import { open, unlink } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, resolve } from "node:path";
import { PNG } from "pngjs";
import { analyzeTexture, color, paintRect } from "./texture.js";
import { boxFaces } from "./model.js";

const boundedInteger = (value, min, max, label) => {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  return value;
};

function prepare(spec) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) throw new Error("Expected a model specification object.");
  const name = String(spec.name || "minecraft_creature").trim();
  if (!name || name.length > 120) throw new Error("Model name must be 1 to 120 characters.");
  const width = boundedInteger(spec.atlasWidth ?? 128, 16, 256, "atlasWidth");
  const height = boundedInteger(spec.atlasHeight ?? 128, 16, 256, "atlasHeight");
  if ((width & (width - 1)) !== 0 || (height & (height - 1)) !== 0) throw new Error("Atlas width and height must be powers of two.");
  if (!Array.isArray(spec.parts) || spec.parts.length === 0 || spec.parts.length > 64) throw new Error("parts must contain 1 to 64 cuboids.");
  const palette = {
    primary: color(spec.primaryColor || "#687462"),
    shadow: color(spec.shadowColor || "#38443b"),
    highlight: color(spec.highlightColor || "#99a37b"),
    accent: color(spec.accentColor || "#bb7956")
  };
  const detailRate = spec.detailRate ?? 0.025;
  if (!Number.isFinite(detailRate) || detailRate < 0 || detailRate > 0.12) throw new Error("detailRate must be between 0 and 0.12.");
  const parts = spec.parts.map((part, i) => {
    const from = part?.from, to = part?.to;
    if (!Array.isArray(from) || !Array.isArray(to) || from.length !== 3 || to.length !== 3 || ![...from, ...to].every(Number.isFinite)) throw new Error(`parts[${i}] requires finite from/to vectors.`);
    if (from.some((v, j) => v >= to[j] || to[j] - v > 64)) throw new Error(`parts[${i}] bounds must be positive and no larger than 64 units on each axis.`);
    const sizes = to.map((v, j) => Math.max(1, Math.ceil(v - from[j])));
    const uvWidth = 2 * (sizes[0] + sizes[2]), uvHeight = sizes[1] + 2 * sizes[2];
    if (uvWidth + 2 > width || uvHeight + 2 > height) throw new Error(`parts[${i}] UV net (${uvWidth}x${uvHeight}) cannot fit the ${width}x${height} atlas.`);
    const pivot = part.pivot ?? from.map((v, j) => (v + to[j]) / 2);
    const rotation = part.rotation ?? [0, 0, 0];
    if (![...pivot, ...rotation].every(Number.isFinite) || pivot.length !== 3 || rotation.length !== 3) throw new Error(`parts[${i}] pivot and rotation must be finite 3-vectors.`);
    return { name: String(part.name || `part_${i + 1}`).slice(0, 80), from, to, pivot, rotation, sizes, uvWidth, uvHeight, color: part.color ? color(part.color) : null };
  });
  // Deterministic shelf packing keeps each cuboid UV island separate and adds a one-pixel gutter.
  let x = 1, y = 1, rowHeight = 0;
  for (const part of parts) {
    if (x + part.uvWidth + 1 > width) { x = 1; y += rowHeight + 1; rowHeight = 0; }
    if (y + part.uvHeight + 1 > height) throw new Error("UV nets do not fit the requested atlas; enlarge it or simplify/split the geometry.");
    part.uvOrigin = [x, y];
    x += part.uvWidth + 1;
    rowHeight = Math.max(rowHeight, part.uvHeight);
  }
  const seedText = `${name}:${parts.map(p => p.name).join(",")}`;
  let seed = 2166136261;
  for (const char of seedText) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const rng = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const texture = new PNG({ width, height, filterType: 4 });
  const elements = [], groups = [], children = [];
  for (const [index, part] of parts.entries()) {
    const [u, v] = part.uvOrigin, [w, h, d] = part.sizes;
    const rectangles = {
      west: [[u, v + d], d, h, "primary"], north: [[u + d, v + d], w, h, "primary"],
      east: [[u + d + w, v + d], d, h, "shadow"], south: [[u + 2 * d + w, v + d], w, h, "primary"],
      up: [[u + d, v], w, d, "highlight"], down: [[u + d + w, v], w, d, "shadow"]
    };
    for (const [face, [origin, faceWidth, faceHeight, tone]] of Object.entries(rectangles)) {
      const fill = part.color || palette[tone];
      paintRect(texture, [origin[0], origin[1], faceWidth, faceHeight], fill);
      if (!part.color && detailRate > 0 && faceWidth * faceHeight >= 16) {
        const total = Math.floor(faceWidth * faceHeight * detailRate);
        for (let i = 0; i < total; i++) {
          const accent = rng() < 0.18 ? palette.accent : (rng() < 0.5 ? palette.highlight : palette.shadow);
          paintRect(texture, [origin[0] + Math.floor(rng() * faceWidth), origin[1] + Math.floor(rng() * faceHeight), 1, 1], accent);
        }
      }
    }
    const elementId = randomUUID(), groupId = randomUUID();
    elements.push({ name: part.name, type: "cube", uuid: elementId, from: part.from, to: part.to, origin: part.pivot,
      rotation: part.rotation, faces: boxFaces([u, v], part.sizes, 0), inflate: 0, shade: true, visibility: true,
      export: true, locked: false });
    groups.push({ name: part.name, uuid: groupId, origin: part.pivot, rotation: [0, 0, 0], children: [elementId],
      export: true, visibility: true, shade: true, color: index % 7 });
    children.push({ uuid: groupId, children: [elementId] });
  }
  const textureBytes = PNG.sync.write(texture, { checkCRC: true });
  const rootId = randomUUID();
  groups.push({ name: "root", uuid: rootId, origin: [0, 0, 0], rotation: [0, 0, 0],
    children: children.map(child => child.uuid), export: true, visibility: true, shade: true, color: 0 });
  const model = {
    meta: { format_version: "5.0", model_format: "bedrock", box_uv: false },
    name, model_identifier: name.toLowerCase().replace(/[^a-z0-9_]+/g, "_"),
    resolution: { width, height },
    elements, groups,
    outliner: [{ name: "root", uuid: rootId, origin: [0, 0, 0], rotation: [0, 0, 0], children }],
    textures: [{ name: `${name}.png`, id: "0", width, height, uv_width: width, uv_height: height,
      particle: false, use_as_default: true, file_format: "png", render_mode: "default", render_sides: "auto",
      visible: true, internal: true, saved: true, uuid: randomUUID(), source: `data:image/png;base64,${textureBytes.toString("base64")}` }]
  };
  return { model, textureBytes, summary: { name, pathSafeName: basename(name), parts: parts.length, atlas: `${width}x${height}`, pixelScale: "1x logical UV", detailRate } };
}

async function createExclusive(file, data, created) {
  const handle = await open(file, "wx");
  created.push(file);
  try { await handle.writeFile(data); } finally { await handle.close(); }
}

export async function createModel(spec, { modelPath, atlasPath } = {}) {
  if (typeof modelPath !== "string" || !modelPath || !isAbsolute(modelPath)) throw new Error("modelPath must be an explicit absolute path.");
  const target = resolve(modelPath);
  if (extname(target).toLowerCase() !== ".bbmodel") throw new Error("modelPath must end in .bbmodel.");
  if (atlasPath !== undefined && (typeof atlasPath !== "string" || !isAbsolute(atlasPath) || extname(atlasPath).toLowerCase() !== ".png")) throw new Error("atlasPath must be an absolute .png path.");
  const atlasTarget = atlasPath ? resolve(atlasPath) : undefined;
  if (atlasTarget && atlasTarget.toLowerCase() === target.toLowerCase()) throw new Error("modelPath and atlasPath must be different.");
  const result = prepare(spec), created = [];
  try {
    if (atlasTarget) await createExclusive(atlasTarget, result.textureBytes, created);
    await createExclusive(target, Buffer.from(JSON.stringify(result.model, null, 2) + "\n"), created);
  } catch (error) {
    await Promise.all(created.map(file => unlink(file).catch(() => {})));
    if (error.code === "EEXIST") throw new Error("Output already exists; choose a new path. Existing files are never overwritten.");
    if (["ENOENT", "ENOTDIR", "EACCES"].includes(error.code)) throw new Error(`Cannot write the requested output: ${error.message}`);
    throw error;
  }
  return { ...result.summary, modelPath: target, ...(atlasTarget ? { atlasPath: atlasTarget } : {}), embeddedTexture: true,
    texture: analyzeTexture(result.textureBytes, { width: result.model.resolution.width, height: result.model.resolution.height }) };
}

export async function createFromSpecFile(specFile, outputFile, atlasPath) {
  const { readFile } = await import("node:fs/promises");
  return createModel(JSON.parse(await readFile(specFile, "utf8")), { modelPath: outputFile, atlasPath });
}
