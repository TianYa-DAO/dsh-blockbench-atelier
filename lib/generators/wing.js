import { box } from "./parts.js";

export const FAMILY = "creature-wing";
export const QUALITY = "draft";
export const LABEL = "Wing pair: swept leading arm, stepped membrane panels, ribs and claws";

export const PARAMS = {
  span: { type: "number", default: 22, min: 12, max: 40, description: "half span reached by the wing tip" },
  height: { type: "number", default: 16, min: 8, max: 28, description: "how high the tip rises above the shoulder" },
  ribs: { type: "number", default: 4, min: 2, max: 6, description: "rib bones across the membrane" },
  membrane: { type: "boolean", default: true, description: "fill the wing surface between the bones" },
  claw: { type: "boolean", default: true, description: "steel claw at the wing tip" }
};

function lerp(a, b, t) { return a + (b - a) * t; }

export function build(input) {
  const p = Object.assign({}, { span: 22, height: 16, ribs: 4, membrane: true, claw: true }, input || {});
  const span = Math.max(12, Math.min(40, Number(p.span) || 22));
  const height = Math.max(8, Math.min(28, Number(p.height) || 16));
  const ribs = Math.max(2, Math.min(6, Math.round(Number(p.ribs) || 4)));
  const steps = 10;
  const x0 = 1.4;
  const y0 = 9.0;
  const top = y0 + height;
  const tipX = span / 2;
  const drop = height * 0.72;
  const dx = (tipX - x0) / steps;
  const out = [];
  for (const side of [1, -1]) {
    const tag = side > 0 ? "r" : "l";
    const px = v => side * v;
    const xr = (a, b) => { const A = px(Math.min(a, b)), B = px(Math.max(a, b)); return [Math.min(A, B), Math.max(A, B)]; };
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const span1 = xr(x0 + dx * i, x0 + dx * (i + 1));
      const xa = span1[0];
      const xb = span1[1];
      const leadTop = y0 + height * Math.sin(t1 * Math.PI * 0.78);
      const leadBase = y0 + height * Math.sin(t0 * Math.PI * 0.78) - 0.5;
      const trail = y0 - drop * Math.pow(t1, 0.85);
      const lo = Math.min(trail, leadBase);
      const hi = Math.max(leadBase, leadTop);
      if (p.membrane) {
        out.push(box("wing_panel_" + tag + "_" + String(i).padStart(2, "0"), [xa, lo, -0.32], [xb, hi, 0.32], "leather"));
        out.push(box("wing_inner_" + tag + "_" + String(i).padStart(2, "0"), [xa, lo, -0.36], [xb, lo + Math.max(0.6, (hi - lo) * 0.22), 0.36], "leather_dark"));
      }
      out.push(box("wing_lead_" + tag + "_" + String(i).padStart(2, "0"), [xa, hi - 0.45, -0.5], [xb, hi + 0.3, 0.5], "brass"));
      if (i % Math.max(1, Math.floor(steps / ribs)) === 0 && i > 0) {
        const rib = xr(Math.min(x0 + dx * i - 0.22, x0 + dx * i + 0.22), Math.max(x0 + dx * i - 0.22, x0 + dx * i + 0.22));
        out.push(box("wing_rib_" + tag + "_" + i, [rib[0], lo, -0.62], [rib[1], hi, 0.62], "brass"));
      }
    }
    const tipTop = top + 0.4;
    if (p.claw) {
      const claw = xr(tipX - 0.35, tipX + 0.35);
      out.push(box("wing_claw_" + tag, [claw[0], tipTop - 1.1, -0.3], [claw[1], tipTop + 1.0, 0.3], "steel_bright"));
    }
    const shoulder = xr(x0 - 0.6, x0 + 1.3);
    out.push(box("wing_shoulder_" + tag, [shoulder[0], y0 - 1.4, -0.9], [shoulder[1], y0 + 1.6, 0.9], "iron"));
    const guard = xr(x0 - 1.1, x0 + 1.6);
    out.push(box("wing_guard_" + tag, [guard[0], y0 + 1.6, -0.7], [guard[1], y0 + 2.8, 0.7], "brass"));
  }
  out.push(box("wing_hub", [-1.3, y0 - 1.0, -1.0], [1.3, y0 + 2.2, 1.0], "iron"));
  out.push(box("wing_hub_gem", [-0.7, y0, -1.15], [0.7, y0 + 1.4, -1.0], "gem"));
  out.push(box("wing_hub_gem_b", [-0.7, y0, 1.0], [0.7, y0 + 1.4, 1.15], "gem"));
  return out;
}