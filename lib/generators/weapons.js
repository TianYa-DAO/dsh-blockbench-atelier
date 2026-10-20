import { box } from "./parts.js";

const PRESETS = {
  longsword: { length: 17.3, width: 2.35, segments: 14, guardSpan: 14.8, grip: 5.0 },
  greatsword: { length: 24.0, width: 3.1, segments: 18, guardSpan: 17.0, grip: 6.4 },
  dagger: { length: 9.0, width: 1.9, segments: 9, guardSpan: 7.6, grip: 3.2 }
};

export const PARAMS = {
  variant: { type: "string", default: "longsword", options: Object.keys(PRESETS), description: "silhouette preset" },
  length: { type: "number", default: 17.3, min: 6, max: 34, description: "blade length above the guard" },
  width: { type: "number", default: 2.35, min: 1.0, max: 4.6, description: "half width at the blade base" },
  segments: { type: "number", default: 14, min: 6, max: 24, description: "taper segments; below 12 the steps become visible" },
  guardSpan: { type: "number", default: 14.8, min: 6, max: 24, description: "full width of the crossguard" },
  grip: { type: "number", default: 5.0, min: 2, max: 9, description: "grip length" },
  gems: { type: "boolean", default: true, description: "add gems on both sides of guard and pommel" },
  runes: { type: "boolean", default: true, description: "use the rune material on the blade spine" }
};

export const FAMILY = "weapon-sword";
export const LABEL = "Sword family: longsword, greatsword, dagger";

export function build(input) {
  const params = Object.assign({}, PARAMS, input || {});
  const chosen = PRESETS[params.variant] || PRESETS.longsword;
  const length = Number(params.length) || chosen.length;
  const width = Number(params.width) || chosen.width;
  const segments = Math.max(6, Math.min(24, Math.round(Number(params.segments) || chosen.segments)));
  const guardSpan = Number(params.guardSpan) || chosen.guardSpan;
  const grip = Number(params.grip) || chosen.grip;
  const spineMat = params.runes ? "steel_dark" : "steel";
  const out = [];
  const y0 = grip + 1.9 + 2.6;
  const y1 = y0 + length;
  for (let i = 0; i < segments; i++) {
    const a = i / segments;
    const b = (i + 1) / segments;
    const segY0 = y0 + (y1 - y0) * a;
    const segY1 = y0 + (y1 - y0) * b;
    const hw = Math.max(width * Math.pow(1 - a, 0.62), width * Math.pow(1 - b, 0.62));
    const name = "blade_" + String(i).padStart(2, "0");
    if (hw >= 0.75) {
      out.push(box(name + "_spine", [-0.45, segY0, -0.7], [0.45, segY1, 0.7], spineMat));
      out.push(box(name + "_edge_l", [-hw, segY0, -0.44], [-0.45, segY1, 0.44], "steel_bright"));
      out.push(box(name + "_edge_r", [0.45, segY0, -0.44], [hw, segY1, 0.44], "steel_bright"));
    } else {
      out.push(box(name + "_spine", [-hw, segY0, -0.4], [hw, segY1, 0.4], "steel_bright"));
    }
  }
  const guardY = grip + 1.0;
  out.push(box("blade_collar", [-1.3, guardY + 2.4, -1.05], [1.3, guardY + 3.2, 1.05], "brass_dark"));
  out.push(box("guard_center", [-1.75, guardY, -1.75], [1.75, guardY + 2.6, 1.75], "brass"));
  const innerEdge = Math.max(1.9, guardSpan * 0.24);
  out.push(box("guard_inner_l", [-innerEdge, guardY + 0.5, -1.3], [-1.75, guardY + 2.2, 1.3], "brass_dark"));
  out.push(box("guard_inner_r", [1.75, guardY + 0.5, -1.3], [innerEdge, guardY + 2.2, 1.3], "brass_dark"));
  const wingEdge = Math.max(innerEdge + 1.2, guardSpan * 0.42);
  out.push(box("guard_wing_l", [-wingEdge, guardY + 1.1, -1.0], [-innerEdge, guardY + 2.5, 1.0], "brass"));
  out.push(box("guard_wing_r", [innerEdge, guardY + 1.1, -1.0], [wingEdge, guardY + 2.5, 1.0], "brass"));
  const tipEdge = Math.max(wingEdge + 1.0, guardSpan * 0.5);
  out.push(box("guard_tip_l", [-tipEdge, guardY + 1.9, -0.72], [-wingEdge, guardY + 3.1, 0.72], "brass"));
  out.push(box("guard_tip_r", [wingEdge, guardY + 1.9, -0.72], [tipEdge, guardY + 3.1, 0.72], "brass"));
  if (params.gems) {
    out.push(box("guard_jewel_f", [-0.8, guardY + 0.8, -1.92], [0.8, guardY + 2.0, -1.75], "gem"));
    out.push(box("guard_jewel_b", [-0.8, guardY + 0.8, 1.75], [0.8, guardY + 2.0, 2.0], "gem"));
  }
  const bandCount = Math.max(3, Math.round(grip));
  for (let i = 0; i < bandCount; i++) {
    const by = (grip / bandCount) * i;
    const material = i % 2 === 0 ? "leather" : "leather_dark";
    out.push(box("grip_" + (i % 2 === 0 ? "a" : "b") + i, [-1.05, by, -0.9], [1.05, by + grip / bandCount, 0.9], material));
  }
  out.push(box("pommel_neck", [-0.85, -0.5, -0.85], [0.85, 0, 0.85], "brass_dark"));
  out.push(box("pommel_ball", [-2.0, -2.6, -1.8], [2.0, -0.5, 1.8], "brass"));
  out.push(box("pommel_spike", [-0.6, -3.2, -0.6], [0.6, -2.6, 0.6], "brass_dark"));
  if (params.gems) {
    out.push(box("pommel_jewel_f", [-1.0, -2.1, -1.96], [1.0, -0.9, -1.8], "gem"));
    out.push(box("pommel_jewel_b", [-1.0, -2.1, 1.8], [1.0, -0.9, 1.96], "gem"));
  }
  return out;
}