import { box, resolve } from "./parts.js";

const clampNum = (v, lo, hi, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
};

const clampInt = (v, lo, hi, fallback) => Math.round(clampNum(v, lo, hi, fallback));

function span(name, x1, x2, y1, y2, z1, z2, material) {
  const axis = (a, b) => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (hi - lo >= 0.5) return [lo, hi];
    const c = (lo + hi) / 2;
    return [c - 0.25, c + 0.25];
  };
  const ax = axis(x1, x2);
  const ay = axis(y1, y2);
  const az = axis(z1, z2);
  return box(name, [ax[0], ay[0], az[0]], [ax[1], ay[1], az[1]], material);
}

const WING_PARAMS = {
  span: { type: "number", default: 22, min: 12, max: 40, description: "horizontal reach of the wing tip" },
  height: { type: "number", default: 16, min: 8, max: 28, description: "height of the leading tip above the shoulder" },
  ribs: { type: "number", default: 4, min: 3, max: 6, description: "finger bones and membrane bays" },
  membrane: { type: "boolean", default: true, description: "fill the bays between fingers" },
  claw: { type: "boolean", default: true, description: "iron claws on every finger tip" }
};

export function buildWing(input) {
  const p = resolve(WING_PARAMS, input);
  const reach = clampInt(p.span, 12, 40, 22);
  const tall = clampInt(p.height, 8, 28, 16);
  const ribs = clampInt(p.ribs, 3, 6, 4);
  const withMembrane = p.membrane !== false;
  const withClaw = p.claw !== false;
  const out = [];
  const shoulderX = 2;
  const elbowX = Math.max(4, Math.round(reach * 0.22));
  const wristX = Math.max(6, Math.round(reach * 0.42));
  const elbowY = Math.max(3, Math.round(tall * 0.28));
  const wristY = Math.max(5, Math.round(tall * 0.55));
  out.push(span("wing_back_plate", -3, 3, 0, 5, -1.5, 1.5, "leather_dark"));
  out.push(span("wing_spine", -1, 1, 4, 9, -1.25, 1.25, "iron"));
  out.push(span("wing_hub", -2, 2, 6, 9, -2, 2, "brass"));
  out.push(span("wing_hub_gem", -1, 1, 7, 9, -2.5, -1.75, "gem"));
  for (const side of [1, -1]) {
    const tag = side > 0 ? "r" : "l";
    const px = v => side * v;
    out.push(span("wing_shoulder_" + tag, px(shoulderX - 1), px(shoulderX + 2), 0, 4, -1.5, 1.5, "leather_dark"));
    out.push(span("wing_arm_" + tag, px(shoulderX), px(elbowX), 2, 5, -1, 1, "leather"));
    out.push(span("wing_forearm_" + tag, px(elbowX), px(wristX), elbowY, elbowY + 2, -1, 1, "leather"));
    out.push(span("wing_elbow_" + tag, px(elbowX - 1), px(elbowX + 1), elbowY - 1, elbowY + 3, -1.5, 1.5, "brass"));
    out.push(span("wing_wrist_" + tag, px(wristX - 1), px(wristX + 1), wristY - 1, wristY + 3, -1.5, 1.5, "brass_dark"));
    out.push(span("wing_guard_" + tag, px(shoulderX - 2), px(shoulderX + 2), 4, 6, -2, 2, "brass"));
    out.push(span("wing_vane_up_" + tag, px(wristX - 2), px(wristX + 3), wristY + 2, wristY + 4, -0.75, 0.75, "leather_dark"));
    out.push(span("wing_vane_low_" + tag, px(wristX + 2), px(wristX + 6), Math.max(1, wristY - 4), Math.max(2, wristY - 2), -0.6, 0.6, "leather"));
    const tips = [];
    for (let i = 0; i < ribs; i++) {
      const t = ribs === 1 ? 0 : i / (ribs - 1);
      const tipX = Math.round(wristX + (reach - wristX) * (0.12 + 0.88 * t));
      const tipY = Math.max(2, Math.round(tall * (1 - 0.72 * t)));
      tips.push({ x: tipX, y: tipY });
      const loY = Math.min(tipY, wristY);
      const hiY = Math.max(tipY, wristY) + 1;
      out.push(span("wing_rib_" + i + "_" + tag, px(wristX), px(tipX), loY, hiY, -1, 1, "leather_dark"));
      if (withClaw) {
        out.push(span("wing_claw_" + i + "_" + tag, px(tipX - 1), px(tipX + 1), tipY, tipY + 2, -0.75, 0.75, "iron"));
      }
    }
    if (withMembrane) {
      for (let i = 0; i + 1 < tips.length; i++) {
        const upper = tips[i];
        const lower = tips[i + 1];
        const midX = Math.round((wristX + lower.x) / 2);
        const lowY = Math.max(1, Math.min(upper.y, lower.y) - 1);
        const highY = Math.max(upper.y, lower.y);
        out.push(span("wing_mem_a_" + i + "_" + tag, px(wristX), px(midX), lowY, highY, -0.5, 0.5, "leather"));
        out.push(span("wing_mem_b_" + i + "_" + tag, px(midX), px(lower.x), lowY, Math.max(lowY + 1, highY - 2), -0.5, 0.5, "leather_dark"));
      }
    }
  }
  return out;
}

const HORN_PARAMS = {
  height: { type: "number", default: 14, min: 6, max: 26, description: "total horn height" },
  curve: { type: "number", default: 3, min: 0, max: 6, description: "outward drift per horn" },
  segments: { type: "number", default: 5, min: 4, max: 7, description: "taper steps from base to tip" },
  bands: { type: "boolean", default: true, description: "brass rings around alternate segments" },
  spikes: { type: "boolean", default: true, description: "iron barbs on the outer edge" }
};

export function buildHorn(input) {
  const p = resolve(HORN_PARAMS, input);
  const tall = clampInt(p.height, 6, 26, 14);
  const curve = clampInt(p.curve, 0, 6, 3);
  const segs = clampInt(p.segments, 4, 7, 5);
  const withBands = p.bands !== false;
  const withSpikes = p.spikes !== false;
  const out = [];
  const stepY = Math.max(2, Math.round(tall / segs));
  out.push(span("horn_band_center", -4, 4, 0, 2, -2, 2, "leather_dark"));
  out.push(span("horn_band_left", -7, -4, 0, 2, -1.5, 1.5, "leather"));
  out.push(span("horn_band_right", 4, 7, 0, 2, -1.5, 1.5, "leather"));
  out.push(span("horn_band_gem", -1.5, 1.5, 1, 3, -2.5, -1.5, "gem"));
  for (const side of [1, -1]) {
    const tag = side > 0 ? "r" : "l";
    const px = v => side * v;
    const baseX = 4;
    out.push(span("horn_socket_" + tag, px(baseX - 1), px(baseX + 2), 1, 5, -1.5, 1.5, "brass"));
    out.push(span("horn_base_ring_" + tag, px(baseX - 1.5), px(baseX + 2.5), 0, 2, -2, 2, "brass_dark"));
    for (let i = 0; i < segs; i++) {
      const t = i / segs;
      const half = Math.max(0.5, 2.2 - 1.6 * t);
      const cx = baseX + Math.round(curve * t);
      const y0 = 4 + i * stepY;
      const y1 = y0 + stepY;
      out.push(span("horn_seg_" + i + "_" + tag, px(cx - half), px(cx + half), y0, y1, -half, half, "stone_dark"));
      out.push(span("horn_ridge_" + i + "_" + tag, px(cx - half), px(cx + half), y0, y0 + 1, -half - 0.5, -half + 0.5, "iron"));
      if (withBands && i > 0 && i % 2 === 0) {
        out.push(span("horn_band_" + i + "_" + tag, px(cx - half - 0.5), px(cx + half + 0.5), y0, y0 + 1, -half - 0.5, half + 0.5, "brass_dark"));
      }
      if (withSpikes && i % 2 === 1) {
        out.push(span("horn_spike_" + i + "_" + tag, px(cx + half), px(cx + half + 1), y0 + 1, y0 + 2, -0.5, 0.5, "brass"));
      }
    }
    const tipX = baseX + curve;
    const tipY = 4 + segs * stepY;
    out.push(span("horn_tip_" + tag, px(tipX - 0.5), px(tipX + 0.5), tipY, tipY + 2, -0.5, 0.5, "brass_dark"));
  }
  return out;
}

const CROWN_PARAMS = {
  radius: { type: "number", default: 6.5, min: 4, max: 10, description: "ring radius measured to the band centre" },
  height: { type: "number", default: 3, min: 2, max: 6, description: "band height around the head" },
  points: { type: "number", default: 8, min: 6, max: 12, description: "merlon count around the ring" },
  gems: { type: "boolean", default: true, description: "inlay alternating merlons with gems" },
  plume: { type: "boolean", default: true, description: "iron crest above the front" }
};

export function buildCrown(input) {
  const p = resolve(CROWN_PARAMS, input);
  const radius = clampNum(p.radius, 4, 10, 6.5);
  const bandH = clampInt(p.height, 2, 6, 3);
  const pts = clampInt(p.points, 6, 12, 8);
  const withGems = p.gems !== false;
  const withPlume = p.plume !== false;
  const out = [];
  const snap = v => Math.round(v * 2) / 2;
  const step = (Math.PI * 2) / pts;
  for (let k = 0; k < pts; k++) {
    const ang = step * k;
    const cx = snap(Math.cos(ang) * radius);
    const cz = snap(Math.sin(ang) * radius);
    const half = Math.max(1.5, snap((Math.PI * radius / pts) * 0.62));
    const innerR = radius * 0.82;
    const ix = snap(Math.cos(ang) * innerR);
    const iz = snap(Math.sin(ang) * innerR);
    out.push(span("crown_band_" + k, cx - half, cx + half, 0, bandH, cz - half, cz + half, "brass"));
    out.push(span("crown_rim_" + k, cx - half, cx + half, bandH, bandH + 1, cz - half, cz + half, "iron"));
    out.push(span("crown_inner_" + k, ix - half * 0.7, ix + half * 0.7, 0, bandH, iz - half * 0.7, iz + half * 0.7, "leather"));
    const base = bandH + 1;
    const midH = Math.max(1, Math.round(bandH * 0.9));
    out.push(span("crown_point_lo_" + k, cx - half * 0.6, cx + half * 0.6, base, base + midH, cz - half * 0.6, cz + half * 0.6, "brass"));
    out.push(span("crown_point_hi_" + k, cx - half * 0.34, cx + half * 0.34, base + midH, base + midH + midH, cz - half * 0.34, cz + half * 0.34, "brass_dark"));
    if (withGems && k % 2 === 0) {
      const gd = radius + 0.5;
      const gx = snap(Math.cos(ang) * gd);
      const gz = snap(Math.sin(ang) * gd);
      const gy = Math.max(1, Math.round(bandH * 0.35));
      out.push(span("crown_gem_" + k, gx - 0.75, gx + 0.75, gy, gy + 2, gz - 0.75, gz + 0.75, "gem"));
    }
  }
  if (withPlume) {
    const top = bandH + 1 + Math.max(1, Math.round(bandH * 0.9)) * 2;
    out.push(span("crown_plume_base", -1.5, 1.5, bandH + 1, bandH + 3, -1.5, 1.5, "iron"));
    out.push(span("crown_plume_mid", -1, 1, bandH + 3, top, -1, 1, "iron"));
    out.push(span("crown_plume_tip", -0.5, 0.5, top, top + 3, -0.5, 0.5, "brass"));
  }
  return out;
}

export const FAMILIES = {
  "creature-wing": {
    FAMILY: "creature-wing",
    LABEL: "Creature wing pair: arm bones, finger ribs, membrane bays, iron claws",
    PARAMS: WING_PARAMS,
    build: buildWing
  },
  "creature-horn": {
    FAMILY: "creature-horn",
    LABEL: "Paired horns: tapered stone steps, brass bands, iron barbs, brow band",
    PARAMS: HORN_PARAMS,
    build: buildHorn
  },
  "armor-crown": {
    FAMILY: "armor-crown",
    LABEL: "Crown: radial band, two-tier merlons, gem inlays, crest plume",
    PARAMS: CROWN_PARAMS,
    build: buildCrown
  }
};
