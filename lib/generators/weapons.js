import { box, resolve } from "./parts.js";

const PRESETS = {
  longsword: { length: 20.0, width: 2.7, thickness: 0.9, guardSpan: 7.6, grip: 4.8, segments: 16, gems: true, runes: false },
  greatsword: { length: 26.0, width: 3.4, thickness: 1.1, guardSpan: 9.6, grip: 6.2, segments: 20, gems: true, runes: false },
  dagger: { length: 10.0, width: 2.0, thickness: 0.7, guardSpan: 4.6, grip: 3.2, segments: 12, gems: true, runes: false }
};

export const FAMILY = "weapon-sword";
export const LABEL = "Sword family: longsword, greatsword, dagger";

export const PARAMS = {
  variant: { type: "string", default: "longsword", options: Object.keys(PRESETS), description: "silhouette preset" },
  length: { type: "number", default: 20, min: 6, max: 34, description: "blade length above the guard" },
  width: { type: "number", default: 2.7, min: 1.0, max: 4.6, description: "half width of the blade at its base" },
  thickness: { type: "number", default: 0.9, min: 0.4, max: 2.0, description: "blade thickness; real blades are about a fifth of their width" },
  segments: { type: "number", default: 16, min: 6, max: 24, description: "taper segments; below 12 the steps become visible" },
  guardSpan: { type: "number", default: 7.6, min: 3, max: 16, description: "full width of the crossguard; about 2.5 to 3 times the blade width" },
  grip: { type: "number", default: 4.8, min: 2, max: 9, description: "grip length" },
  gems: { type: "boolean", default: true, description: "add gems on both sides of guard and pommel" },
  runes: { type: "boolean", default: false, description: "glowing rune material in the fuller; off by default so a plain blade reads as real steel" }
};

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
  const out = [];
  const pommelTop = 2.1;
  out.push(box("pommel_cap", [-0.7, 0, -0.7], [0.7, 0.5, 0.7], "brass_dark"));
  out.push(box("pommel_ball", [-0.95, 0.5, -0.85], [0.95, 2.1, 0.85], "brass"));
  out.push(box("pommel_neck", [-0.5, pommelTop, -0.5], [0.5, pommelTop + 0.4, 0.5], "brass_dark"));
  const gripBase = pommelTop + 0.4;
  const gripTop = gripBase + grip;
  const bands = Math.max(3, Math.round(grip));
  for (let i = 0; i < bands; i++) {
    const y0 = gripBase + (grip / bands) * i;
    const y1 = y0 + grip / bands;
    const material = i % 2 === 0 ? "leather" : "leather_dark";
    out.push(box("grip_" + (i % 2 === 0 ? "a" : "b") + i, [-0.55, y0, -0.5], [0.55, y1, 0.5], material));
  }
  const guardH = 0.9;
  out.push(box("guard_center", [-0.85, gripTop, -(thick + 0.2)], [0.85, gripTop + guardH, thick + 0.2], "brass"));
  const armLen = Math.max(0.8, guardSpan / 2 - 0.85);
  const armStep = armLen / 3;
  for (const side of [1, -1]) {
    const tag = side > 0 ? "r" : "l";
    for (let i = 0; i < 3; i++) {
      const a = 0.85 + armStep * i;
      const b = 0.85 + armStep * (i + 1);
      const drop = 0.22 * i;
      const dz = Math.max(0.35, thick + 0.2 - 0.12 * i);
      const x0 = side > 0 ? a : -b;
      const x1 = side > 0 ? b : -a;
      const material = i === 2 ? "brass_dark" : "brass";
      out.push(box("guard_arm_" + tag + "_" + i, [x0, gripTop + drop, -dz], [x1, gripTop + guardH - drop * 0.6, dz], material));
    }
  }
  if (params.gems) {
    out.push(box("guard_gem_f", [-0.55, gripTop + 0.18, -(thick + 0.34)], [0.55, gripTop + 0.72, -(thick + 0.2)], "gem"));
    out.push(box("guard_gem_b", [-0.55, gripTop + 0.18, thick + 0.2], [0.55, gripTop + 0.72, thick + 0.34], "gem"));
    out.push(box("pommel_gem_f", [-0.5, 1.0, -0.99], [0.5, 1.8, -0.85], "gem"));
    out.push(box("pommel_gem_b", [-0.5, 1.0, 0.85], [0.5, 1.8, 0.99], "gem"));
  }
  const bladeBase = gripTop + guardH;
  const bladeTop = bladeBase + length;
  const span = bladeTop - bladeBase;
  const halfAt = t => Math.max(0.14, width * Math.pow(1 - t, 0.55));
  const slice = (y0, y1) => ({ u1: 0, u2: 1, v1: (bladeTop - y1) / span, v2: (bladeTop - y0) / span });
  for (let i = 0; i < segments; i++) {
    const a = i / segments;
    const b = (i + 1) / segments;
    const y0 = bladeBase + span * a;
    const y1 = bladeBase + span * b;
    const hw = Math.max(halfAt(a), halfAt(b));
    const name = "blade_" + String(i).padStart(2, "0");
    const range = slice(y0, y1);
    if (hw >= 0.5) {
      const bevel = Math.min(0.34, hw * 0.42);
      out.push(Object.assign(box(name + "_fuller", [-hw + bevel, y0, -thick], [hw - bevel, y1, thick], fuller), { uvRange: range }));
      out.push(Object.assign(box(name + "_edge_l", [-hw, y0, -thick * 0.62], [-hw + bevel, y1, thick * 0.62], "steel_bright"), { uvRange: range }));
      out.push(Object.assign(box(name + "_edge_r", [hw - bevel, y0, -thick * 0.62], [hw, y1, thick * 0.62], "steel_bright"), { uvRange: range }));
    } else {
      out.push(Object.assign(box(name + "_tip", [-hw, y0, -thick * 0.5], [hw, y1, thick * 0.5], "steel_bright"), { uvRange: range }));
    }
  }
  return out;
}