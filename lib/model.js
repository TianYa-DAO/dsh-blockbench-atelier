import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { analyzeTexture, embeddedPng } from "./texture.js";

export const FACE_NAMES = ["north", "east", "south", "west", "up", "down"];
const vector = (value, n = 3) => Array.isArray(value) && value.length === n && value.every(Number.isFinite);
const rounded = value => Math.round(value * 10000) / 10000;

export async function loadModel(file) {
  if ((await stat(file)).size > 32_000_000) throw new Error("Model exceeds the 32 MB limit.");
  const bytes = await readFile(file);
  const model = JSON.parse(bytes.toString("utf8"));
  if (!model || !Array.isArray(model.elements)) throw new Error("Expected a Blockbench .bbmodel with elements.");
  return { model, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export function logicalSize(model, texture) {
  return { width: texture?.uv_width ?? model.resolution?.width ?? texture?.width,
    height: texture?.uv_height ?? model.resolution?.height ?? texture?.height };
}

export function textureIndex(model, reference) {
  if (reference === null || reference === undefined) return -1;
  if (Number.isInteger(reference)) return reference >= 0 && reference < (model.textures?.length || 0) ? reference : -1;
  return (model.textures || []).findIndex(t => t.uuid === reference);
}

export function boxFaces(offset, size, texture = 0) {
  const [u, v] = offset, [w, h, d] = size;
  const rectangles = {
    west: [u, v + d, u + d, v + d + h], north: [u + d, v + d, u + d + w, v + d + h],
    east: [u + d + w, v + d, u + 2 * d + w, v + d + h],
    south: [u + 2 * d + w, v + d, u + 2 * d + 2 * w, v + d + h],
    up: [u + d, v, u + d + w, v + d], down: [u + d + w, v, u + 2 * d + w, v + d]
  };
  return Object.fromEntries(FACE_NAMES.map(name => [name, { uv: rectangles[name], texture }]));
}

function hierarchy(model) {
  const groups = new Map((model.groups || []).map(g => [g.uuid, g]));
  const nodes = [], elementOwners = new Map();
  function visit(items, parent = null, depth = 0) {
    if (depth > 256) throw new Error("Outliner exceeds the supported hierarchy depth.");
    for (const item of items || []) {
      if (typeof item === "string") { elementOwners.set(item, parent); continue; }
      if (!item || typeof item !== "object") continue;
      const group = groups.get(item.uuid) || item;
      nodes.push({ uuid: item.uuid, name: group.name || "unnamed", parent, depth,
        origin: group.origin || [0, 0, 0], rotation: group.rotation || [0, 0, 0] });
      visit(item.children, item.uuid, depth + 1);
    }
  }
  visit(model.outliner);
  return { nodes, elementOwners };
}

export function analyzeModel(model) {
  const cubes = model.elements.filter(e => e.type === "cube" || (!e.type && e.from));
  const validCubes = cubes.filter(e => vector(e.from) && vector(e.to));
  const { nodes, elementOwners } = hierarchy(model);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let planes = 0, fractionalDimensions = 0, rotatedCubes = 0, boxUvCubes = 0, mirroredUvCubes = 0;
  for (const e of validCubes) {
    const size = e.to.map((v, i) => v - e.from[i]);
    if (size.some(v => v === 0)) planes++;
    if (size.some(v => !Number.isInteger(v))) fractionalDimensions++;
    if (e.rotation?.some(v => v !== 0)) rotatedCubes++;
    if (e.box_uv ?? model.meta?.box_uv) boxUvCubes++;
    if (e.mirror_uv) mirroredUvCubes++;
    for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], e.from[i], e.to[i]); max[i] = Math.max(max[i], e.from[i], e.to[i]); }
  }
  const faceStats = { active: 0, reversedRectangles: 0, fractionalCoordinates: 0, degenerate: 0, outOfBounds: 0 };
  const uvMasks = (model.textures || []).map(t => {
    const s = logicalSize(model, t);
    return Number.isInteger(s.width) && Number.isInteger(s.height) && s.width > 0 && s.height > 0 && s.width * s.height <= 16_777_216
      ? { ...s, pixels: new Uint8Array(s.width * s.height) } : null;
  });
  for (const e of validCubes) for (const face of Object.values(e.faces || {})) {
    const idx = textureIndex(model, face.texture);
    if (idx < 0 || !vector(face.uv, 4)) continue;
    faceStats.active++;
    const [u1, v1, u2, v2] = face.uv;
    if (u1 > u2 || v1 > v2) faceStats.reversedRectangles++;
    if (face.uv.some(v => !Number.isInteger(v))) faceStats.fractionalCoordinates++;
    if (u1 === u2 || v1 === v2) faceStats.degenerate++;
    const s = logicalSize(model, model.textures[idx]);
    if (Math.min(u1, u2) < 0 || Math.min(v1, v2) < 0 || Math.max(u1, u2) > s.width || Math.max(v1, v2) > s.height) faceStats.outOfBounds++;
    const mask = uvMasks[idx];
    if (!mask) continue;
    for (let y = Math.max(0, Math.floor(Math.min(v1, v2))); y < Math.min(mask.height, Math.ceil(Math.max(v1, v2))); y++) {
      for (let x = Math.max(0, Math.floor(Math.min(u1, u2))); x < Math.min(mask.width, Math.ceil(Math.max(u1, u2))); x++) mask.pixels[y * mask.width + x] = 1;
    }
  }
  return {
    name: model.name, modelIdentifier: model.model_identifier || null, format: model.meta?.model_format || "unknown",
    formatVersion: model.meta?.format_version || null, resolution: model.resolution || null,
    elements: model.elements.length, cubes: cubes.length,
    otherElements: model.elements.filter(e => !cubes.includes(e)).map(e => ({ name: e.name, type: e.type })),
    planes, fractionalDimensions, rotatedCubes, boxUvCubes, mirroredUvCubes,
    rawBounds: validCubes.length ? { min, max, size: max.map((v, i) => rounded(v - min[i])) } : null,
    boundsNote: "Raw cube coordinates only: hierarchy rotation, cube rotation and inflate are not baked. Not a rendered AABB.",
    groups: nodes.length, maxGroupDepth: Math.max(0, ...nodes.map(g => g.depth)),
    rotatedGroups: nodes.filter(g => g.rotation.some(v => v !== 0)).length,
    hierarchy: nodes.slice(0, 400), unparentedElements: model.elements.filter(e => !elementOwners.has(e.uuid)).length,
    animations: (model.animations || []).map(a => ({ name: a.name, length: a.length, loop: a.loop })),
    faceStats,
    uvCoverage: uvMasks.map(mask => mask ? rounded(mask.pixels.reduce((a, b) => a + b, 0) / mask.pixels.length) : null),
    textures: (model.textures || []).map(t => {
      const s = logicalSize(model, t), result = { name: t.name, id: t.id, ...s, embedded: typeof t.source === "string" && t.source.startsWith("data:") };
      try { result.image = analyzeTexture(embeddedPng(t), s); } catch (error) { result.imageError = error.message; }
      return result;
    })
  };
}

export function validateModel(model) {
  const issues = [], issue = (severity, code, path, message) => issues.push({ severity, code, path, message });
  if (!model || !Array.isArray(model.elements)) return { ok: false, errors: 1, warnings: 0, issues: [{ severity: "error", code: "MODEL", path: "elements", message: "Expected an elements array." }] };
  const textures = Array.isArray(model.textures) ? model.textures : [];
  const ids = new Set();
  const objects = [...(model.groups || []), ...model.elements];
  for (const [i, object] of objects.entries()) {
    if (!object.uuid || ids.has(object.uuid)) issue("error", "UUID", `objects[${i}]`, "Missing or duplicate UUID.");
    ids.add(object.uuid);
  }
  const placements = new Set();
  function visit(items, depth = 0) {
    if (!Array.isArray(items)) { issue("error", "OUTLINER", "outliner", "Children must be arrays."); return; }
    if (depth > 256) { issue("error", "DEPTH", "outliner", "Hierarchy depth exceeds 256."); return; }
    for (const item of items) {
      const id = typeof item === "string" ? item : item?.uuid;
      if (!id || !ids.has(id)) issue("error", "REFERENCE", "outliner", `Unknown reference: ${id}`);
      if (placements.has(id)) issue("error", "PLACEMENT", "outliner", `Duplicate placement: ${id}`);
      placements.add(id);
      if (item && typeof item === "object") visit(item.children, depth + 1);
    }
  }
  visit(model.outliner || []);
  for (const g of model.groups || []) {
    if (!vector(g.origin) || (g.rotation && !vector(g.rotation))) issue("error", "GROUP_TRANSFORM", g.name, "Invalid group pivot or rotation.");
  }
  for (const [i, e] of model.elements.entries()) {
    const path = `elements[${i}](${e.name})`;
    if (e.export === false) continue;
    if (!placements.has(e.uuid)) issue("warning", "UNPARENTED", path, "Element is absent from the outliner.");
    if (e.type === "locator") { if (!vector(e.position)) issue("error", "LOCATOR", path, "Invalid locator position."); continue; }
    if (e.type && e.type !== "cube") { issue("warning", "UNSUPPORTED_ELEMENT", path, "This validator only checks cubes and locators."); continue; }
    if (!vector(e.from) || !vector(e.to)) { issue("error", "BOUNDS", path, "Cube bounds must be finite 3-vectors."); continue; }
    if ((e.origin && !vector(e.origin)) || (e.rotation && !vector(e.rotation))) issue("error", "TRANSFORM", path, "Invalid cube pivot or rotation.");
    if (e.from.some((v, j) => v > e.to[j])) issue("error", "NEGATIVE_SIZE", path, "Cube has reversed geometry bounds; do not confuse this with mirrored UV.");
    const dims = e.to.map((v, j) => v - e.from[j]);
    if (dims.filter(v => v === 0).length >= 2) issue("warning", "LINE_CUBE", path, "Two or more zero dimensions; verify intended visibility.");
    for (const [name, face] of Object.entries(e.faces || {})) {
      if (face.texture === null || face.texture === undefined) continue;
      const idx = textureIndex(model, face.texture);
      if (idx < 0) { issue("error", "TEXTURE_REF", `${path}.${name}`, "Face references a missing texture array index/UUID (not texture.id)."); continue; }
      if (!vector(face.uv, 4)) { issue("error", "UV", `${path}.${name}`, "UV must be a finite 4-vector."); continue; }
      const s = logicalSize(model, textures[idx]);
      const [u1, v1, u2, v2] = face.uv;
      if (Math.min(u1, u2) < 0 || Math.min(v1, v2) < 0 || Math.max(u1, u2) > s.width || Math.max(v1, v2) > s.height) issue("error", "UV_BOUNDS", `${path}.${name}`, "UV rectangle exceeds logical atlas dimensions.");
      if (face.rotation !== undefined && ![0, 90, 180, 270].includes(face.rotation)) issue("error", "UV_ROTATION", `${path}.${name}`, "Face rotation must be a quarter turn.");
    }
    if ((e.box_uv ?? model.meta?.box_uv) && !vector(e.uv_offset, 2)) issue("warning", "BOX_OFFSET", path, "Box UV lacks uv_offset; saved face UV may be intentional. Reopen and verify before exporting.");
  }
  for (const [i, t] of textures.entries()) {
    const s = logicalSize(model, t), path = `textures[${i}]`;
    if (![s.width, s.height].every(v => Number.isInteger(v) && v > 0)) { issue("error", "RESOLUTION", path, "Logical texture dimensions must be positive integers."); continue; }
    if (typeof t.source === "string" && t.source.startsWith("data:")) {
      try {
        const a = analyzeTexture(embeddedPng(t), s);
        if ((t.width && t.width !== a.width) || (t.height && t.height !== a.height)) issue("warning", "IMAGE_METADATA", path, "PNG dimensions disagree with texture metadata.");
        if (!Number.isInteger(a.pixelScale.x) || !Number.isInteger(a.pixelScale.y) || a.pixelScale.x !== a.pixelScale.y) issue("warning", "PIXEL_SCALE", path, "PNG is not a uniform integer upscale of the logical atlas.");
      } catch (error) { issue("error", "PNG", path, error.message); }
    } else issue("warning", "EXTERNAL_TEXTURE", path, "External texture was not read; inspect it separately.");
  }
  const errors = issues.filter(i => i.severity === "error").length, warnings = issues.length - errors;
  return { ok: errors === 0, errors, warnings, issues: issues.slice(0, 100), omittedIssues: Math.max(0, issues.length - 100),
    limitations: ["Structural check only; does not validate rendered appearance, seams, animation or game compatibility.", "Reversed UVs, overlapping UVs and single-axis zero-thickness planes are legal."] };
}
