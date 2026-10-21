import { box, resolve } from "./parts.js";

const PRESETS = {
  longsword: { length: 20, width: 2.6, thickness: 0.55, guardSpan: 6.0, grip: 4.2, segments: 16, gems: true, runes: false },
  greatsword: { length: 26, width: 3.2, thickness: 0.65, guardSpan: 7.4, grip: 5.4, segments: 20, gems: true, runes: false },
  dagger: { length: 10, width: 1.5, thickness: 0.45, guardSpan: 3.6, grip: 3.0, segments: 12, gems: true, runes: false }
};

export const FAMILY = "weapon-sword";
export const LABEL = "Sword family: longsword, greatsword, dagger";

export const PARAMS = {
  variant: { type: "string", default: "longsword", options: Object.keys(PRESETS), description: "silhouette preset" },
  length: { type: "number", default: 20, min: 6, max: 34, description: "blade length above the guard" },
  width: { type: "number", default: 2.6, min: 0.8, max: 5.0, description: "full blade width; a real blade runs six to ten times longer than it is wide" },
  thickness: { type: "number", default: 0.55, min: 0.2, max: 1.6, description: "full blade thickness across the flat; a real blade is roughly a fifth of its width" },
  segments: { type: "number", default: 16, min: 6, max: 24, description: "taper segments; below 12 the steps become visible" },
  guardSpan: { type: "number", default: 6.0, min: 3, max: 16, description: "full width of the crossguard; about 2.3 times the blade width" },
  grip: { type: "number", default: 4.2, min: 2, max: 9, description: "grip length" },
  gems: { type: "boolean", default: true, description: "add gems on both sides of guard and pommel" },
  runes: { type: "boolean", default: false, description: "glowing rune material in the fuller; off by default so a plain blade reads as real steel" }
};

const SHOULDER = 0.75;
const DISTAL = 0.11;

export function taperAt(halfWidth, t) {
  if (t <= SHOULDER) return halfWidth * (1 - DISTAL * (t / SHOULDER));
  const shoulder = halfWidth * (1 - DISTAL);
  const k = (t - SHOULDER) / (1 - SHOULDER);
  return Math.max(0.1, shoulder * Math.pow(1 - k, 0.62));
}

export function build(input) {
  const provided = Object.assign({}, input || {});
  const variant = provided.variant || resolve(PARAMS, {}).variant;
  const base = PRESETS[variant] || PRESETS.longsword;
  const params = Object.assign({}, base, provided);
  const length = Number(params.length);
  const width = Number(params.width);
  const thick = Number(params.thickness);
  const guardSpan = Number(params.guardSpan);
  const grip = Number(params.grip);
  const segments = Math.max(6, Math.min(24, Math.round(Number(params.segments))));
  const fuller = params.runes ? "steel_dark" : "steel";
  const half = width / 2;
  const hz = thick / 2;
  const out = [];
  out.push(box("pommel_cap", [-0.6, 0, -0.6], [0.6, 0.4, 0.6], "brass_dark"));
  out.push(box("pommel_ball", [-0.75, 0.4, -0.7], [0.75, 1.9, 0.7], "brass"));
  out.push(box("pommel_neck", [-0.45, 1.9, -0.45], [0.45, 2.3, 0.45], "brass_dark"));
  const gripBase = 2.3;
  const gripTop = gripBase + grip;
  const bands = Math.max(3, Math.round(grip));
  for (let i = 0; i < bands; i++) {
    const y0 = gripBase + (grip / bands) * i;
    const y1 = y0 + grip / bands;
    const material = i % 2 === 0 ? "leather" : "leather_dark";
    out.push(box("grip_" + (i % 2 === 0 ? "a" : "b") + i, [-0.55, y0, -0.5], [0.55, y1, 0.5], material));
  }
  const guardH = 0.8;
  const guardDepth = Math.max(0.85, thick + 0.35);
  out.push(box("guard_center", [-0.85, gripTop, -guardDepth], [0.85, gripTop + guardH, guardDepth], "brass"));
  const armLen = Math.max(0.7, guardSpan / 2 - 0.85);
  const armStep = armLen / 3;
  for (const side of [1, -1]) {
    const tag = side > 0 ? "r" : "l";
    for (let i = 0; i < 3; i++) {
      const a = 0.85 + armStep * i;
      const b = 0.85 + armStep * (i + 1);
      const drop = 0.16 * i;
      const dz = Math.max(0.3, guardDepth - 0.14 * i);
      const x0 = side > 0 ? a : -b;
      const x1 = side > 0 ? b : -a;
      const material = i === 2 ? "brass_dark" : "brass";
      out.push(box("guard_arm_" + tag + "_" + i, [x0, gripTop + drop, -dz], [x1, gripTop + guardH - drop * 0.6, dz], material));
    }
  }
  if (params.gems) {
    out.push(box("guard_gem_f", [-0.5, gripTop + 0.16, -guardDepth - 0.14], [0.5, gripTop + 0.64, -guardDepth], "gem"));
    out.push(box("guard_gem_b", [-0.5, gripTop + 0.16, guardDepth], [0.5, gripTop + 0.64, guardDepth + 0.14], "gem"));
    out.push(box("pommel_gem_f", [-0.4, 0.9, -0.84], [0.4, 1.6, -0.7], "gem"));
    out.push(box("pommel_gem_b", [-0.4, 0.9, 0.7], [0.4, 1.6, 0.84], "gem"));
  }
  const bladeBase = gripTop + guardH;
  const bladeTop = bladeBase + length;
  const span = bladeTop - bladeBase;
  const slice = (y0, y1) => ({ u1: 0, u2: 1, v1: (bladeTop - y1) / span, v2: (bladeTop - y0) / span });
  for (let i = 0; i < segments; i++) {
    const a = i / segments;
    const b = (i + 1) / segments;
    const y0 = bladeBase + span * a;
    const y1 = bladeBase + span * b;
    const hw = Math.max(taperAt(half, a), taperAt(half, b));
    const name = "blade_" + String(i).padStart(2, "0");
    const range = slice(y0, y1);
    if (hw >= 0.42) {
      const bevel = Math.min(0.26, hw * 0.42);
      out.push(Object.assign(box(name + "_fuller", [-hw + bevel, y0, -hz], [hw - bevel, y1, hz], fuller), { uvRange: range }));
      out.push(Object.assign(box(name + "_edge_l", [-hw, y0, -hz * 0.62], [-hw + bevel, y1, hz * 0.62], "steel_bright"), { uvRange: range }));
      out.push(Object.assign(box(name + "_edge_r", [hw - bevel, y0, -hz * 0.62], [hw, y1, hz * 0.62], "steel_bright"), { uvRange: range }));
    } else {
      out.push(Object.assign(box(name + "_tip", [-hw, y0, -hz * 0.5], [hw, y1, hz * 0.5], "steel_bright"), { uvRange: range }));
    }
  }
  return out;
}