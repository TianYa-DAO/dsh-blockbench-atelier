export const TILE = 16;
export const ATLAS_COLS = 8;
export const ATLAS_SIZE = TILE * ATLAS_COLS;

export const MATERIALS = {
  steel: { tone: [150, 162, 176], kind: "bright" },
  steel_dark: { tone: [92, 102, 116], kind: "dark", rune: [120, 240, 246] },
  steel_bright: { tone: [214, 224, 236], kind: "bright" },
  brass: { tone: [186, 140, 54], kind: "warm", rivets: true },
  brass_dark: { tone: [130, 96, 36], kind: "warm" },
  leather: { tone: [108, 68, 44], kind: "leather", wrap: 0 },
  leather_dark: { tone: [78, 50, 32], kind: "leather", wrap: 3 },
  gem: { tone: [140, 248, 252], kind: "gem" },
  wood: { tone: [124, 88, 52], kind: "grain" },
  stone: { tone: [128, 133, 137], kind: "stone" },
  stone_dark: { tone: [86, 91, 95], kind: "stone" },
  iron: { tone: [108, 108, 118], kind: "dark" }
};

export const MATERIAL_NAMES = Object.keys(MATERIALS);

function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }
function noise(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) & 0x7fffffff;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) & 0xff) / 255;
}

export function paintPixel(name, x, y) {
  const spec = MATERIALS[name];
  if (!spec) throw new Error("unknown material: " + name);
  const [r, g, b] = spec.tone;
  const n = noise(x, y, name.length * 31);
  const v = (n - 0.5) * 10;
  let out = [clamp(r + v), clamp(g + v), clamp(b + v), 255];
  const vertical = (y / (TILE - 1)) - 0.5;
  const edgeLeft = x < 2 ? 1 : x < 4 ? 0.5 : 0;
  const edgeRight = x > TILE - 3 ? -1 : x > TILE - 5 ? -0.5 : 0;
  const shade = 1 - vertical * 0.28 + edgeLeft * 0.22 + edgeRight * 0.16;
  out = [clamp(out[0] * shade), clamp(out[1] * shade), clamp(out[2] * shade), 255];
  if (spec.kind === "warm") {
    out = [clamp(out[0]), clamp(out[1] * 0.78), clamp(out[2] * 0.3), 255];
    if (spec.rivets && (x + y) % 9 === 0 && x > 2 && y > 2) out = [clamp(r * 0.6), clamp(g * 0.5), clamp(b * 0.25), 255];
  }
  if (spec.kind === "leather") {
    const wrap = (x + y + (spec.wrap || 0)) % 6 < 2 ? 16 : 0;
    out = [clamp(out[0] * 0.95 + wrap), clamp(out[1] * 0.62 + wrap), clamp(out[2] * 0.4 + wrap), 255];
  }
  if (spec.kind === "gem") {
    const d = Math.hypot(x - 7.5, y - 7.5) / 7.5;
    const t = Math.min(1, d);
    out = [clamp(150 - t * 110), clamp(248 - t * 96), clamp(252 - t * 60), 255];
    if ((x + y) % 11 === 0) out = [220, 255, 255, 255];
  }
  if (spec.kind === "grain") {
    const ring = (Math.floor((y + Math.sin(x * 0.7) * 1.5) / 3) % 2) ? 12 : -8;
    out = [clamp(out[0] + ring), clamp(out[1] + ring), clamp(out[2] + ring), 255];
  }
  if (spec.kind === "stone") {
    const speck = n > 0.86 ? -22 : n < 0.12 ? 16 : 0;
    out = [clamp(out[0] + speck), clamp(out[1] + speck), clamp(out[2] + speck), 255];
  }
  if (spec.kind === "dark" && spec.rune) {
    if (x >= 6 && x <= 9 && y % 6 < 2) out = [spec.rune[0], spec.rune[1], spec.rune[2], 255];
  }
  return out;
}

export function paintTile(name) {
  const px = new Uint8Array(TILE * TILE * 4);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const c = paintPixel(name, x, y);
      const i = (y * TILE + x) * 4;
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = c[3];
    }
  }
  return px;
}