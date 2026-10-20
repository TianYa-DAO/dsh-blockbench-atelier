import { PNG } from "pngjs";
import { ATLAS_SIZE, ATLAS_COLS, TILE, MATERIAL_NAMES, paintTile } from "./materials.js";

export function buildAtlas(usedMaterials) {
  const used = [...new Set(usedMaterials)];
  for (const name of used) if (!MATERIAL_NAMES.includes(name)) throw new Error("unknown material: " + name);
  if (used.length > ATLAS_COLS) throw new Error("at most " + ATLAS_COLS + " materials per atlas, got " + used.length);
  const png = new PNG({ width: ATLAS_SIZE, height: ATLAS_SIZE });
  png.data.fill(0);
  for (let i = 0; i < ATLAS_SIZE * ATLAS_SIZE; i++) png.data[i * 4 + 3] = 255;
  const slots = new Map();
  used.forEach((name, slot) => {
    slots.set(name, slot);
    const px = paintTile(name);
    const ox = slot * TILE;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const src = (y * TILE + x) * 4;
        const dst = ((y * ATLAS_SIZE) + ox + x) * 4;
        png.data[dst] = px[src];
        png.data[dst + 1] = px[src + 1];
        png.data[dst + 2] = px[src + 2];
        png.data[dst + 3] = 255;
      }
    }
  });
  return { png, slots, size: ATLAS_SIZE };
}

export function uvFor(slot) {
  const t = slot * 2;
  return [t, 0, t + 2, 2];
}

export function atlasPngBuffer(atlas) {
  return PNG.sync.write(atlas.png);
}