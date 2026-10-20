import { randomUUID } from "node:crypto";
import { buildAtlas, uvFor, atlasPngBuffer } from "./generators/atlas.js";
import { getFamily, listFamilies } from "./generators/index.js";
import { boundsOf, round3 } from "./generators/parts.js";
import { validateModel } from "./model.js";

const FACES = ["north", "east", "south", "west", "up", "down"];

export function forgeModel(spec) {
  const family = String((spec && spec.family) || "");
  const mod = getFamily(family);
  const parts = mod.build((spec && spec.params) || {});
  if (!Array.isArray(parts) || parts.length === 0) throw new Error("family produced no parts: " + family);
  const materials = [...new Set(parts.map(p => p.material))];
  const atlas = buildAtlas(materials);
  const textureName = String((spec && spec.name) || family).replace(/[^a-z0-9_]/gi, "_");
  const elements = parts.map(part => {
    const slot = atlas.slots.get(part.material);
    const uv = uvFor(slot, part.uvRange);
    const faces = {};
    for (const face of FACES) faces[face] = { uv: uv.slice(), texture: 0 };
    return {
      name: part.name,
      uuid: randomUUID(),
      type: "cube",
      from: part.from.map(round3),
      to: part.to.map(round3),
      origin: Array.isArray(part.origin) ? part.origin.map(round3) : [0, 0, 0],
      rotation: Array.isArray(part.rotation) ? part.rotation.map(r => round3(Number(r) || 0)) : [0, 0, 0],
      box_uv: false,
      export: true,
      mirror_uv: false,
      shade: true,
      faces
    };
  });
  const png = atlasPngBuffer(atlas);
  const model = {
    meta: { format_version: "5.0", model_format: "bedrock", box_uv: false },
    name: textureName,
    model_identifier: "",
    resolution: { width: 16, height: 16 },
    elements,
    groups: [],
    outliner: elements.map(e => e.uuid),
    textures: [{
      name: textureName,
      id: "0",
      width: atlas.size,
      height: atlas.size,
      uv_width: 16,
      uv_height: 16,
      source: "data:image/png;base64," + png.toString("base64")
    }]
  };
  const validation = validateModel(model);
  return {
    model,
    json: JSON.stringify(model),
    png,
    stats: {
      family,
      parameters: mod.build ? undefined : null,
      elements: elements.length,
      faces: elements.length * FACES.length,
      materials,
      bounds: boundsOf(parts),
      validate: { ok: validation.ok, errors: validation.errors, warnings: validation.warnings }
    }
  };
}

export { listFamilies };