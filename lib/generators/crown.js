import { box } from "./parts.js";

export const FAMILY = "armor-crown";
export const LABEL = "Crown: octagonal band, twin-tier merlons, gems and crest plume";

export const PARAMS = {
  radius: { type: "number", default: 6.5, min: 4, max: 10, description: "outer radius of the band" },
  height: { type: "number", default: 3, min: 2, max: 6, description: "band height" },
  points: { type: "number", default: 8, min: 6, max: 12, description: "merlon count, clamped to 4-8 anchors" },
  gems: { type: "boolean", default: true, description: "gem inlays on the four outer faces" },
  plume: { type: "boolean", default: true, description: "centre crest plume with a top gem" }
};

function ringBoxes(prefix, r, y0, y1, material) {
  const side = r * 0.78;
  const outer = r;
  const thick = Math.max(0.9, r * 0.18);
  const inner = side - thick;
  const out = [];
  out.push(box(prefix + "_front", [-side, y0, -outer], [side, y1, -outer + thick], material));
  out.push(box(prefix + "_back", [-side, y0, outer - thick], [side, y1, outer], material));
  out.push(box(prefix + "_left", [-outer, y0, -side], [-outer + thick, y1, side], material));
  out.push(box(prefix + "_right", [outer - thick, y0, -side], [outer, y1, side], material));
  const lo = side - thick;
  const hi = side;
  out.push(box(prefix + "_cf", [-hi, y0, -hi], [-lo, y1, -lo], material));
  out.push(box(prefix + "_cb", [-hi, y0, lo], [-lo, y1, hi], material));
  out.push(box(prefix + "_cl", [lo, y0, -hi], [hi, y1, -lo], material));
  out.push(box(prefix + "_cr", [lo, y0, lo], [hi, y1, hi], material));
  void inner;
  return out;
}

export function build(input) {
  const p = Object.assign({}, { radius: 6.5, height: 3, points: 8, gems: true, plume: true }, input || {});
  const r = Math.max(4, Math.min(10, Number(p.radius) || 6.5));
  const h = Math.max(2, Math.min(6, Number(p.height) || 3));
  const out = [];
  out.push(...ringBoxes("band", r, 0, h, "brass"));
  out.push(...ringBoxes("rim", r, h, h + 0.5, "brass_dark"));
  const lining = Math.max(0.6, r * 0.1);
  const sideIn = r * 0.78 - Math.max(0.9, r * 0.18) - lining;
  out.push(box("lining_front", [-sideIn, 0.4, -r * 0.5], [sideIn, h - 0.4, -r * 0.5 + lining], "leather"));
  out.push(box("lining_back", [-sideIn, 0.4, r * 0.5 - lining], [sideIn, h - 0.4, r * 0.5], "leather"));
  const anchorR = r * 0.76;
  const anchors = [];
  for (let k = 0; k < 8; k++) {
    const a = (Math.PI * 2 * k) / 8 + Math.PI / 8;
    anchors.push([Math.cos(a) * anchorR, Math.sin(a) * anchorR]);
  }
  const total = Math.max(4, Math.min(8, Math.round(Number(p.points) || 8)));
  const picked = [];
  for (let k = 0; k < total; k++) picked.push(anchors[Math.round((k * 8) / total) % 8]);
  const pointH = Math.max(1.6, r * 0.42);
  picked.forEach(([ax, az], i) => {
    const loW = 0.85;
    out.push(box("merlon_lo_" + i, [ax - loW, h + 0.5, az - loW], [ax + loW, h + 0.5 + pointH * 0.6, az + loW], "brass"));
    out.push(box("merlon_hi_" + i, [ax - 0.5, h + 0.5 + pointH * 0.6, az - 0.5], [ax + 0.5, h + 0.5 + pointH, az + 0.5], "steel_bright"));
  });
  if (p.gems) {
    const gy0 = h * 0.32;
    const gy1 = h * 0.32 + Math.max(1.0, h * 0.42);
    out.push(box("gem_n", [-0.55, gy0, -r - 0.14], [0.55, gy1, -r], "gem"));
    out.push(box("gem_s", [-0.55, gy0, r], [0.55, gy1, r + 0.14], "gem"));
    out.push(box("gem_w", [-r - 0.14, gy0, -0.55], [-r, gy1, 0.55], "gem"));
    out.push(box("gem_e", [r, gy0, -0.55], [r + 0.14, gy1, 0.55], "gem"));
  }
  if (p.plume) {
    const top = h + 0.5;
    out.push(box("plume_base", [-0.75, top, -0.75], [0.75, top + 0.5, 0.75], "iron"));
    out.push(box("plume_shaft", [-0.4, top + 0.5, -0.4], [0.4, top + 2.6, 0.4], "brass_dark"));
    out.push(box("plume_top", [-0.6, top + 2.6, -0.6], [0.6, top + 3.4, 0.6], "gem"));
  }
  return out;
}