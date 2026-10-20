import { box } from "./parts.js";

const SIDES = [1, -1];

function clampParam(spec, raw) {
  if (raw === undefined || raw === null) return spec.default;
  if (spec.type === "number") {
    const n = Number(raw);
    if (!Number.isFinite(n)) return spec.default;
    const lo = spec.min === undefined ? -Infinity : spec.min;
    const hi = spec.max === undefined ? Infinity : spec.max;
    return Math.max(lo, Math.min(hi, n));
  }
  if (spec.type === "boolean") return !!raw;
  return String(raw);
}

function readParams(specs, input) {
  const src = input || {};
  const out = {};
  for (const key of Object.keys(specs)) out[key] = clampParam(specs[key], src[key]);
  return out;
}

function pair(out, name, from, to, material) {
  for (const side of SIDES) {
    const x0 = side * from[0];
    const x1 = side * to[0];
    out.push(box(
      name + (side > 0 ? "_l" : "_r"),
      [Math.min(x0, x1), from[1], from[2]],
      [Math.max(x0, x1), to[1], to[2]],
      material
    ));
  }
}

function stepped(out, prefix, yBase, height, steps, halfBase, halfTip, zHalf, material) {
  for (let i = 0; i < steps; i++) {
    const a = i / steps;
    const b = (i + 1) / steps;
    const hw = halfBase + (halfTip - halfBase) * b;
    out.push(box(
      prefix + "_" + (i < 10 ? "0" + String(i) : String(i)),
      [-hw, yBase + height * a, -zHalf],
      [hw, yBase + height * b, zHalf],
      material
    ));
  }
}

function wraps(out, prefix, yBase, length, count, halfX, halfZ, matA, matB) {
  const step = length / count;
  for (let i = 0; i < count; i++) {
    out.push(box(
      prefix + "_" + String(i),
      [-halfX, yBase + step * i, -halfZ],
      [halfX, yBase + step * (i + 1), halfZ],
      i % 2 === 0 ? matA : matB
    ));
  }
}

export const AXE_PARAMS = {
  haftLen: { type: "number", default: 22, min: 12, max: 34, description: "haft length between butt cap and axe head" },
  headSize: { type: "number", default: 6.2, min: 3.4, max: 10, description: "axe head height" },
  bladeReach: { type: "number", default: 4.6, min: 2.2, max: 8, description: "how far the bit extends from the haft" },
  beard: { type: "number", default: 2.2, min: 0, max: 4.5, description: "hanging beard below the bit; 0 disables it" },
  gripLen: { type: "number", default: 6.4, min: 2, max: 12, description: "leather grip length" },
  doubleBit: { type: "boolean", default: false, description: "mirror the bit to both sides instead of a poll" },
  topSpike: { type: "boolean", default: true, description: "add the tapered spike above the head" },
  langets: { type: "boolean", default: true, description: "add the metal straps running down from the socket" }
};

export const SPEAR_PARAMS = {
  shaftLen: { type: "number", default: 26, min: 14, max: 40, description: "shaft length between butt and collar" },
  headLen: { type: "number", default: 7.5, min: 3.5, max: 13, description: "spear head length above the collar" },
  headWidth: { type: "number", default: 1.5, min: 0.7, max: 3.2, description: "half width of the head base" },
  gripLen: { type: "number", default: 7, min: 2, max: 14, description: "leather grip length" },
  barbs: { type: "boolean", default: true, description: "add the two backward hooks under the head" },
  wings: { type: "boolean", default: true, description: "add the winged guard plates at the collar" },
  tassel: { type: "boolean", default: true, description: "hang tassel strips from the collar" },
  buttSpike: { type: "boolean", default: true, description: "taper the butt into a spike" }
};

export const HAMMER_PARAMS = {
  haftLen: { type: "number", default: 20, min: 10, max: 32, description: "haft length between butt cap and head" },
  headWidth: { type: "number", default: 9, min: 4.5, max: 14, description: "full head width along x" },
  headHeight: { type: "number", default: 4.6, min: 2.4, max: 7.5, description: "head height" },
  headDepth: { type: "number", default: 5.2, min: 2.6, max: 8, description: "head depth along z" },
  gripLen: { type: "number", default: 6, min: 2, max: 12, description: "leather grip length" },
  crossPeen: { type: "boolean", default: false, description: "replace the back face with a tapered peen" },
  faceSpikes: { type: "boolean", default: false, description: "add four studs on the striking face" },
  sidePlates: { type: "boolean", default: true, description: "add brass side plates on the head" }
};

function buildAxe(input) {
  const p = readParams(AXE_PARAMS, input);
  const out = [];
  let y = 0;

  stepped(out, "axe_butt_spike", y, 1.2, 2, 0.34, 0.62, 0.34, "steel_dark");
  y += 1.2;
  out.push(box("axe_butt_cap", [-1.0, y, -1.0], [1.0, y + 1.0, 1.0], "steel_dark"));
  y += 1.0;

  const haftTop = y + p.haftLen;
  stepped(out, "axe_haft", y, p.haftLen, 6, 0.86, 0.6, 0.86, "wood");

  wraps(out, "axe_grip", y + 0.6, Math.min(p.gripLen, p.haftLen - 1.2), 4, 1.0, 1.0, "leather", "leather_dark");

  if (p.langets) {
    const l0 = haftTop - 3.6;
    pair(out, "axe_langet", [0.62, l0, -0.34], [1.02, l0 + 3.2, 0.34], "brass");
  }

  y = haftTop;
  out.push(box("axe_socket_low", [-1.18, y, -1.18], [1.18, y + 1.3, 1.18], "steel_dark"));
  out.push(box("axe_socket_high", [-0.96, y + 1.3, -0.96], [0.96, y + 2.5, 0.96], "brass"));

  const headBase = y + 1.1;
  const reach = p.bladeReach;
  const bitOuter = 1.05 + reach;

  out.push(box("axe_bit_cheek", [1.05, headBase + 0.5, -0.92], [1.05 + reach * 0.55, headBase + p.headSize * 0.62, 0.92], "steel"));
  out.push(box("axe_bit_web", [1.05 + reach * 0.4, headBase + 0.9, -0.64], [bitOuter - 0.9, headBase + p.headSize * 0.86, 0.64], "steel_dark"));
  out.push(box("axe_bit_edge", [bitOuter - 0.9, headBase + 0.7, -0.52], [bitOuter, headBase + p.headSize, 0.52], "steel_bright"));

  if (p.doubleBit) {
    out.push(box("axe_bit_cheek_r", [-1.05 - reach * 0.55, headBase + 0.5, -0.92], [-1.05, headBase + p.headSize * 0.62, 0.92], "steel"));
    out.push(box("axe_bit_web_r", [-bitOuter + 0.9, headBase + 0.9, -0.64], [-1.05 - reach * 0.4, headBase + p.headSize * 0.86, 0.64], "steel_dark"));
    out.push(box("axe_bit_edge_r", [-bitOuter, headBase + 0.7, -0.52], [-bitOuter + 0.9, headBase + p.headSize, 0.52], "steel_bright"));
  } else {
    out.push(box("axe_poll_back", [-1.05 - reach, headBase + 1.0, -0.62], [-1.05, headBase + p.headSize * 0.74, 0.62], "steel_dark"));
    out.push(box("axe_poll_face", [-1.05 - reach, headBase + 1.35, -0.36], [-1.05 - reach + reach * 0.22, headBase + p.headSize * 0.6, 0.36], "steel_bright"));
  }

  if (p.beard > 0.05) {
    out.push(box("axe_beard_hook", [1.05 + reach * 0.16, headBase - p.beard, -0.46], [1.05 + reach * 0.72, headBase + 0.62, 0.46], "steel"));
    out.push(box("axe_beard_tip", [1.05 + reach * 0.5, headBase - p.beard - 0.5, -0.3], [1.05 + reach * 0.78, headBase - p.beard + 0.16, 0.3], "steel_bright"));
  }

  pair(out, "axe_rivet", [1.18, headBase + 1.2, -0.26], [1.52, headBase + 1.7, 0.26], "brass");
  out.push(box("axe_socket_jewel", [-0.3, y + 1.55, -1.3], [0.3, y + 2.15, -0.96], "gem"));

  if (p.topSpike) {
    stepped(out, "axe_top_spike", y + 2.5, 2.6, 3, 0.66, 0.16, 0.66, "steel_dark");
    out.push(box("axe_top_tip", [-0.12, y + 5.1, -0.12], [0.12, y + 5.7, 0.12], "steel_bright"));
  } else {
    out.push(box("axe_top_cap", [-0.72, y + 2.5, -0.72], [0.72, y + 3.0, 0.72], "brass"));
  }

  return out;
}

function buildSpear(input) {
  const p = readParams(SPEAR_PARAMS, input);
  const out = [];
  let y = 0;

  if (p.buttSpike) {
    stepped(out, "spear_butt_spike", y, 1.5, 2, 0.24, 0.58, 0.24, "steel_dark");
    y += 1.5;
    out.push(box("spear_butt_ring", [-0.78, y, -0.78], [0.78, y + 0.7, 0.78], "brass"));
  } else {
    out.push(box("spear_butt_cap", [-0.8, y, -0.8], [0.8, y + 0.9, 0.8], "iron"));
  }
  y += 0.8;

  const shaftTop = y + p.shaftLen;
  stepped(out, "spear_shaft", y, p.shaftLen, 7, 0.64, 0.54, 0.64, "wood");

  wraps(out, "spear_grip", y + 0.8, Math.min(p.gripLen, p.shaftLen - 1.0), 4, 0.78, 0.78, "leather", "leather_dark");
  const gripTop = y + 0.8 + Math.min(p.gripLen, p.shaftLen - 1.0);
  pair(out, "spear_grip_ring", [0.66, gripTop - 0.5, -0.66], [0.9, gripTop, 0.66], "brass");

  y = shaftTop;
  out.push(box("spear_collar_low", [-0.92, y, -0.92], [0.92, y + 0.9, 0.92], "brass"));
  out.push(box("spear_collar_high", [-0.76, y + 0.9, -0.76], [0.76, y + 1.6, 0.76], "brass"));
  pair(out, "spear_collar_rivet", [0.76, y + 0.16, -0.18], [1.0, y + 0.58, 0.18], "steel_bright");

  if (p.wings) {
    pair(out, "spear_wing", [0.7, y + 0.3, -0.32], [1.9, y + 1.35, 0.32], "steel");
    pair(out, "spear_wing_tip", [1.85, y + 0.55, -0.2], [2.45, y + 1.1, 0.2], "steel_bright");
  }

  const headBase = y + 1.6;
  const headTop = headBase + p.headLen;
  out.push(box("spear_head_collar", [-0.52, headBase - 0.42, -0.52], [0.52, headBase + 0.24, 0.52], "steel_dark"));
  const steps = 5;
  for (let i = 0; i < steps; i++) {
    const a = i / steps;
    const b = (i + 1) / steps;
    const hw = Math.max(0.16, p.headWidth * (1 - b * 0.92));
    const hz = Math.max(0.16, p.headWidth * 0.55 * (1 - b * 0.9));
    out.push(box(
      "spear_head_" + (i < 10 ? "0" + String(i) : String(i)),
      [-hw, headBase + p.headLen * a, -hz],
      [hw, headBase + p.headLen * b, hz],
      i === 0 ? "steel_dark" : "steel"
    ));
  }
  out.push(box("spear_head_spine", [-0.1, headBase + 0.2, -Math.max(0.14, p.headWidth * 0.36)], [0.1, headTop - 0.6, Math.max(0.14, p.headWidth * 0.36)], "steel_bright"));
  out.push(box("spear_head_tip", [-0.14, headTop - 0.5, -0.14], [0.14, headTop + 0.9, 0.14], "steel_bright"));

  if (p.barbs) {
    pair(out, "spear_barb", [0.42, headBase - 0.9, -0.16], [1.62, headBase + 1.1, 0.16], "steel_dark");
    pair(out, "spear_barb_tip", [1.5, headBase - 1.5, -0.12], [1.92, headBase - 0.5, 0.12], "steel_bright");
  }

  pair(out, "spear_rivet", [0.76, y + 0.3, -0.2], [1.0, y + 0.62, 0.2], "steel_bright");

  if (p.tassel) {
    pair(out, "spear_tassel_a", [0.34, y - 2.2, -0.16], [0.72, y + 0.2, 0.16], "leather");
    pair(out, "spear_tassel_b", [0.2, y - 3.1, -0.12], [0.5, y - 1.9, 0.12], "leather_dark");
  }

  return out;
}

function buildHammer(input) {
  const p = readParams(HAMMER_PARAMS, input);
  const out = [];
  let y = 0;

  stepped(out, "hammer_butt_spike", y, 1.0, 2, 0.3, 0.66, 0.3, "steel_dark");
  y += 1.0;
  out.push(box("hammer_butt_cap", [-1.02, y, -1.02], [1.02, y + 1.0, 1.02], "iron"));
  y += 1.0;

  const haftTop = y + p.haftLen;
  stepped(out, "hammer_haft", y, p.haftLen, 6, 0.88, 0.64, 0.88, "wood");

  wraps(out, "hammer_grip", y + 0.5, Math.min(p.gripLen, p.haftLen - 1.0), 4, 1.02, 1.02, "leather", "leather_dark");

  out.push(box("hammer_haft_collar", [-0.98, haftTop - 1.1, -0.98], [0.98, haftTop + 0.3, 0.98], "brass"));

  const headMid = haftTop + 1.1 + p.headHeight * 0.5;
  const hy0 = headMid - p.headHeight * 0.5;
  const hy1 = headMid + p.headHeight * 0.5;
  const hx = p.headWidth * 0.5;
  const hz = p.headDepth * 0.5;

  out.push(box("hammer_head_core", [-hx * 0.82, hy0, -hz * 0.82], [hx * 0.82, hy1, hz * 0.82], "iron"));
  out.push(box("hammer_head_band_low", [-hx * 0.9, hy0, -hz * 0.9], [hx * 0.9, hy0 + 0.7, hz * 0.9], "steel_dark"));
  out.push(box("hammer_head_band_high", [-hx * 0.9, hy1 - 0.7, -hz * 0.9], [hx * 0.9, hy1, hz * 0.9], "steel_dark"));

  pair(out, "hammer_face_plate", [hx * 0.78, hy0 + 0.5, -hz * 0.72], [hx, hy1 - 0.5, hz * 0.72], "steel");
  pair(out, "hammer_face_boss", [hx, hy0 + 1.0, -hz * 0.46], [hx + 1.4, hy1 - 1.0, hz * 0.46], "steel_bright");

  if (p.crossPeen) {
    out.push(box("hammer_peen_root", [-hx - 1.1, headMid - p.headHeight * 0.32, -hz * 0.6], [-hx * 0.78, headMid + p.headHeight * 0.32, hz * 0.6], "iron"));
    out.push(box("hammer_peen_mid", [-hx - 2.0, headMid - p.headHeight * 0.22, -hz * 0.42], [-hx - 1.1, headMid + p.headHeight * 0.22, hz * 0.42], "steel_dark"));
    out.push(box("hammer_peen_tip", [-hx - 2.7, headMid - p.headHeight * 0.12, -hz * 0.24], [-hx - 2.0, headMid + p.headHeight * 0.12, hz * 0.24], "steel_bright"));
  } else {
    out.push(box("hammer_back_block", [-hx - 1.4, hy0 + 0.6, -hz * 0.66], [-hx * 0.78, hy1 - 0.6, hz * 0.66], "iron"));
    out.push(box("hammer_back_face", [-hx - 1.4, hy0 + 1.0, -hz * 0.44], [-hx - 1.15, hy1 - 1.0, hz * 0.44], "steel_dark"));
  }

  if (p.sidePlates) {
    pair(out, "hammer_side_plate", [hx * 0.2, hy0 + 0.3, hz * 0.8], [hx * 0.6, hy1 - 0.3, hz * 1.02], "brass");
    pair(out, "hammer_side_rib", [hx * 0.28, hy0 + 0.9, hz * 1.0], [hx * 0.52, hy1 - 0.9, hz * 1.18], "brass");
  }

  pair(out, "hammer_rivet", [hx * 0.42, hy0 + 0.62, -hz * 0.98], [hx * 0.62, hy0 + 1.02, -hz * 0.78], "steel_bright");
  pair(out, "hammer_rivet_top", [hx * 0.42, hy1 - 1.02, -hz * 0.98], [hx * 0.62, hy1 - 0.62, -hz * 0.78], "steel_bright");

  if (p.faceSpikes) {
    pair(out, "hammer_stud", [hx * 0.86, hy0 + 0.85, -0.5], [hx + 0.42, hy0 + 1.35, 0.5], "steel_dark");
    pair(out, "hammer_stud_low", [hx * 0.86, hy1 - 1.35, -0.5], [hx + 0.42, hy1 - 0.85, 0.5], "steel_dark");
  }

  out.push(box("hammer_head_boss", [-0.34, headMid - 0.34, -hz * 1.02], [0.34, headMid + 0.34, -hz * 0.8], "brass"));

  return out;
}

export const FAMILIES = {
  "weapon-axe": { FAMILY: "weapon-axe", LABEL: "Polearm family: single or double bit battle axe", PARAMS: AXE_PARAMS, build: buildAxe },
  "weapon-spear": { FAMILY: "weapon-spear", LABEL: "Polearm family: spear and winged partisan", PARAMS: SPEAR_PARAMS, build: buildSpear },
  "weapon-hammer": { FAMILY: "weapon-hammer", LABEL: "Polearm family: war hammer with cross peen", PARAMS: HAMMER_PARAMS, build: buildHammer }
};
