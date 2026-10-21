import { box } from "./parts.js";

export const FAMILY = "creature-wing";
export const LABEL = "Wing pair: rotated membrane fan with finger bones and claws";

export const PARAMS = {
  span: { type: "number", default: 22, min: 12, max: 40, description: "how far the wing tip reaches from the hub" },
  height: { type: "number", default: 16, min: 8, max: 28, description: "how high the leading edge rises" },
  ribs: { type: "number", default: 4, min: 2, max: 6, description: "finger bones across the fan" },
  membrane: { type: "boolean", default: true, description: "fill the membrane between the fingers" },
  claw: { type: "boolean", default: true, description: "steel claw at the leading tip" }
};

function fanPanel(name, sx, sy, r0, r1, chord, deg, side, material) {
  const from = side > 0 ? [sx + r0, sy - chord / 2, -0.22] : [-(sx + r1), sy - chord / 2, -0.22];
  const to = side > 0 ? [sx + r1, sy + chord / 2, 0.22] : [-(sx + r0), sy + chord / 2, 0.22];
  return Object.assign(box(name, from, to, material), { origin: [side * sx, sy, 0], rotation: [0, 0, side * deg] });
}

export function build(input) {
  const p = Object.assign({}, { span: 22, height: 16, ribs: 4, membrane: true, claw: true }, input || {});
  const span = Math.max(12, Math.min(40, Number(p.span) || 22));
  const height = Math.max(8, Math.min(28, Number(p.height) || 16));
  const ribs = Math.max(2, Math.min(6, Math.round(Number(p.ribs) || 4)));
  const sx = 1.6;
  const sy = 10.0;
  const rmax = span / 2;
  const leadDeg = 14 + (height / 28) * 16;
  const trailDeg = -46;
  const panels = Math.max(4, Math.min(9, ribs + 3));
  const out = [];
  for (const side of [1, -1]) {
    const tag = side > 0 ? "r" : "l";
    for (let i = 0; i < panels; i++) {
      const t = i / (panels - 1);
      const deg = leadDeg + (trailDeg - leadDeg) * t;
      const reach = rmax * (1 - 0.34 * t);
      const chord = Math.max(1.1, reach * 0.34);
      if (p.membrane) out.push(fanPanel("wing_panel_" + tag + "_" + i, sx, sy, 1.1, reach, chord, deg, side, i % 2 === 0 ? "leather" : "leather_dark"));
      const fdeg = deg + (trailDeg - leadDeg) / panels / 2;
      const freach = rmax * (1 - 0.34 * t) + 0.5;
      out.push(fanPanel("wing_finger_" + tag + "_" + i, sx, sy, 0.9, freach, 0.7, fdeg, side, "brass"));
    }
    out.push(fanPanel("wing_shadow_" + tag, sx, sy, 1.0, rmax * 0.9, Math.max(1.2, rmax * 0.3), leadDeg + (trailDeg - leadDeg) * 0.5, side, "iron"));
    if (p.claw) {
      out.push(fanPanel("wing_claw_" + tag, sx, sy, rmax - 0.4, rmax + 1.4, 0.85, leadDeg, side, "steel_bright"));
    }
    out.push(box("wing_shoulder_" + tag, [side > 0 ? sx - 0.9 : -(sx + 1.4), sy - 1.5, -1.0], [side > 0 ? sx + 1.4 : -(sx - 0.9), sy + 1.7, 1.0], "iron"));
    out.push(box("wing_guard_" + tag, [side > 0 ? sx - 1.3 : -(sx + 1.8), sy + 1.7, -0.8], [side > 0 ? sx + 1.8 : -(sx - 1.3), sy + 2.9, 0.8], "brass"));
  }
  out.push(box("wing_hub", [-1.4, sy - 1.1, -1.1], [1.4, sy + 2.3, 1.1], "iron"));
  out.push(box("wing_hub_gem", [-0.7, sy - 0.1, -1.25], [0.7, sy + 1.3, -1.1], "gem"));
  out.push(box("wing_hub_gem_b", [-0.7, sy - 0.1, 1.1], [0.7, sy + 1.3, 1.25], "gem"));
  let floor = Infinity;
  for (const part of out) floor = Math.min(floor, part.from[1], part.to[1]);
  if (Number.isFinite(floor) && floor !== 0) {
    for (const part of out) {
      part.from[1] = Math.round((part.from[1] - floor) * 1000) / 1000;
      part.to[1] = Math.round((part.to[1] - floor) * 1000) / 1000;
      if (part.origin) part.origin[1] = Math.round((part.origin[1] - floor) * 1000) / 1000;
    }
  }
  return out;
}