import { box } from "./parts.js";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const whole = (v, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : fallback;
};

function pairX(out, base, xi, xo, y0, y1, z0, z1, material) {
  out.push(box(base + "_r", [xi, y0, z0], [xo, y1, z1], material));
  out.push(box(base + "_l", [-xo, y0, z0], [-xi, y1, z1], material));
}

function pairZ(out, base, x0, x1, zi, zo, y0, y1, material) {
  out.push(box(base + "_b", [x0, y0, zi], [x1, y1, zo], material));
  out.push(box(base + "_f", [x0, y0, -zo], [x1, y1, -zi], material));
}

function quad(out, base, xi, xo, zi, zo, y0, y1, material) {
  const combos = [
    [1, 1, "rb"],
    [1, -1, "rf"],
    [-1, 1, "lb"],
    [-1, -1, "lf"]
  ];
  for (const [sx, sz, tag] of combos) {
    const x0 = sx > 0 ? xi : -xo;
    const x1 = sx > 0 ? xo : -xi;
    const z0 = sz > 0 ? zi : -zo;
    const z1 = sz > 0 ? zo : -zi;
    out.push(box(base + "_" + tag, [x0, y0, z0], [x1, y1, z1], material));
  }
}

function perimeter(out, base, hw, thick, y0, y1, material) {
  out.push(box(base + "_f", [-hw, y0, -hw], [hw, y1, -hw + thick], material));
  out.push(box(base + "_b", [-hw, y0, hw - thick], [hw, y1, hw], material));
  out.push(box(base + "_l", [-hw, y0, -hw + thick], [-hw + thick, y1, hw - thick], material));
  out.push(box(base + "_r", [hw - thick, y0, -hw + thick], [hw, y1, hw - thick], material));
}

const SIDES = ["front", "back", "left", "right"];

function sideBar(out, name, side, along0, along1, y0, y1, hw, depth) {
  if (side === "front") {
    out.push(box(name, [along0, y0, -hw], [along1, y1, -hw + depth], "brass_dark"));
  } else if (side === "back") {
    out.push(box(name, [along0, y0, hw - depth], [along1, y1, hw], "brass_dark"));
  } else if (side === "left") {
    out.push(box(name, [-hw, y0, along0], [-hw + depth, y1, along1], "brass_dark"));
  } else {
    out.push(box(name, [hw - depth, y0, along0], [hw, y1, along1], "brass_dark"));
  }
}

function sidePlate(out, name, side, along0, along1, y0, y1, hw, material) {
  const d0 = hw - 0.06;
  const d1 = hw + 0.14;
  if (side === "front") {
    out.push(box(name, [along0, y0, -d1], [along1, y1, -d0], material));
  } else if (side === "back") {
    out.push(box(name, [along0, y0, d0], [along1, y1, d1], material));
  } else if (side === "left") {
    out.push(box(name, [-d1, y0, along0], [-d0, y1, along1], material));
  } else {
    out.push(box(name, [d0, y0, along0], [d1, y1, along1], material));
  }
}

const LANTERN_STYLES = ["street", "hanging", "table"];

export const LANTERN_PARAMS = {
  height: { type: "number", default: 18, min: 6, max: 26, description: "overall height budget; drives post length on street, cage length when hanging" },
  width: { type: "number", default: 6, min: 3, max: 10, description: "cage width and therefore the lantern's girth" },
  style: { type: "string", default: "street", options: LANTERN_STYLES, description: "street post, hanging lantern or short table lamp" },
  panels: { type: "number", default: 4, min: 3, max: 8, description: "vertical bars per cage side; changes both density and part count" },
  glow: { type: "boolean", default: true, description: "add the emissive-looking gem core and side insets" },
  roof: { type: "boolean", default: true, description: "add the two stepped roof tiers" },
  ring: { type: "boolean", default: true, description: "add the iron carry ring on top" }
};

export function buildLantern(input) {
  const p = Object.assign({ height: 18, width: 6, style: "street", panels: 4, glow: true, roof: true, ring: true }, input || {});
  const height = clamp(whole(p.height, 18), 6, 26);
  const width = clamp(whole(p.width, 6), 3, 10);
  const panels = clamp(whole(p.panels, 4), 3, 8);
  const style = LANTERN_STYLES.includes(String(p.style)) ? String(p.style) : "street";
  const hw = width / 2;
  const out = [];
  let y = 0;

  if (style === "street") {
    out.push(box("base_a", [-hw - 1.1, 0, -hw - 1.1], [hw + 1.1, 1.2, hw + 1.1], "stone_dark"));
    out.push(box("base_b", [-hw - 0.5, 1.2, -hw - 0.5], [hw + 0.5, 2.2, hw + 0.5], "stone"));
    y = 2.2;
  } else if (style === "table") {
    out.push(box("base_plate", [-hw - 1.4, 0, -hw - 1.4], [hw + 1.4, 1.1, hw + 1.4], "stone_dark"));
    out.push(box("base_rim", [-hw - 0.9, 1.1, -hw - 0.9], [hw + 0.9, 1.7, hw + 0.9], "stone"));
    y = 1.7;
  } else {
    out.push(box("base_cap", [-hw, 0, -hw], [hw, 0.6, hw], "wood"));
    perimeter(out, "base_rim", hw, 0.4, 0.6, 1.0, "stone_dark");
    y = 1.0;
  }

  const collarH = 0.9;
  const roofH = p.roof ? 2.3 : 0;
  const ringH = p.ring && style !== "table" ? 0.3 : 0;
  const finialH = 1.7;
  let cageH;
  let postH;
  if (style === "hanging") {
    cageH = clamp(whole(height * 0.72, 8), 5, 16);
    postH = 0;
  } else {
    cageH = clamp(whole(width * 1.05 + 2, 6), 5, 13);
    const fixed = y + collarH + cageH + roofH + finialH + ringH;
    postH = style === "table" ? Math.max(0.8, (height - fixed) * 0.25) : Math.max(1.5, height - fixed);
    postH = Math.round(postH * 100) / 100;
  }

  if (postH > 0.4) {
    out.push(box("post", [-0.9, y, -0.9], [0.9, y + postH, 0.9], "wood"));
    if (postH >= 2.4) {
      for (let i = 0; i < 3; i++) {
        const by = y + (postH * (i + 1)) / 4;
        out.push(box("post_band_" + i, [-1.22, by - 0.38, -1.22], [1.22, by + 0.38, 1.22], "iron"));
      }
    }
    y += postH;
  }

  out.push(box("collar", [-hw - 0.15, y, -hw - 0.15], [hw + 0.15, y + collarH, hw + 0.15], "brass_dark"));
  y += collarH;

  const cageBase = y;
  const cageTop = y + cageH;
  quad(out, "cage_post", hw - 0.5, hw, hw - 0.5, hw, cageBase, cageTop, "iron");
  perimeter(out, "cage_rail_b", hw, 0.6, cageBase, cageBase + 0.6, "brass_dark");
  perimeter(out, "cage_rail_t", hw, 0.6, cageTop - 0.6, cageTop, "brass_dark");

  const slot = (2 * hw) / panels;
  const barW = Math.max(0.18, slot * 0.55);
  for (const side of SIDES) {
    for (let i = 0; i < panels; i++) {
      const c = -hw + slot * (i + 0.5);
      const barName = "panel_" + side + "_" + i;
      sideBar(out, barName, side, c - barW / 2, c + barW / 2, cageBase + 0.6, cageTop - 0.6, hw, 0.45);
    }
  }

  if (p.glow) {
    const gw = Math.min(hw * 0.45, 0.9);
    const gy0 = cageBase + cageH * 0.3;
    const gy1 = cageTop - cageH * 0.3;
    out.push(box("glow_core", [-hw * 0.55, cageBase + 0.9, -hw * 0.55], [hw * 0.55, cageTop - 0.9, hw * 0.55], "gem"));
    out.push(box("glow_front", [-gw, gy0, -hw - 0.14], [gw, gy1, -hw + 0.06], "gem"));
    out.push(box("glow_back", [-gw, gy0, hw - 0.06], [gw, gy1, hw + 0.14], "gem"));
    out.push(box("glow_left", [-hw - 0.14, gy0, -gw], [-hw + 0.06, gy1, gw], "gem"));
    out.push(box("glow_right", [hw - 0.06, gy0, -gw], [hw + 0.14, gy1, gw], "gem"));
  }

  y = cageTop;

  if (p.roof) {
    out.push(box("roof_a", [-hw - 0.8, y, -hw - 0.8], [hw + 0.8, y + 1.1, hw + 0.8], "brass_dark"));
    out.push(box("roof_b", [-hw - 0.2, y + 1.1, -hw - 0.2], [hw + 0.2, y + 2.3, hw + 0.2], "iron"));
    y += 2.3;
  }

  out.push(box("finial_stem", [-0.35, y, -0.35], [0.35, y + 1.0, 0.35], "brass_dark"));
  out.push(box("finial_ball", [-0.7, y + 1.0, -0.7], [0.7, y + 1.7, 0.7], "gem"));
  y += finialH;

  if (style === "hanging") {
    pairX(out, "hanger_strap", 0.25, 0.55, y, y + 1.6, -0.3, 0.3, "leather_dark");
    out.push(box("hanger_bridge", [-0.55, y + 1.6, -0.55], [0.55, y + 1.9, 0.55], "brass_dark"));
    y += 1.9;
  }

  if (p.ring && style !== "table") {
    out.push(box("ring_n", [-0.9, y, -1.15], [0.9, y + 0.3, -0.85], "iron"));
    out.push(box("ring_s", [-0.9, y, 0.85], [0.9, y + 0.3, 1.15], "iron"));
    pairX(out, "ring_side", 0.85, 1.15, y, y + 0.3, -0.85, 0.85, "iron");
  }

  return out;
}

export const CHEST_PARAMS = {
  width: { type: "number", default: 13, min: 6, max: 16, description: "overall chest width across x" },
  depth: { type: "number", default: 9, min: 5, max: 14, description: "overall chest depth across z" },
  height: { type: "number", default: 8, min: 4, max: 14, description: "body height below the lid" },
  bands: { type: "number", default: 3, min: 1, max: 5, description: "number of iron bands wrapped around the body" },
  lid: { type: "boolean", default: true, description: "add the stepped lid with rim and brass arch" },
  lock: { type: "boolean", default: true, description: "add the brass lock plate with gem keyhole" },
  feet: { type: "boolean", default: true, description: "raise the body on four iron feet" }
};

export function buildChest(input) {
  const p = Object.assign({ width: 13, depth: 9, height: 8, bands: 3, lid: true, lock: true, feet: true }, input || {});
  const W = clamp(whole(p.width, 13), 6, 16);
  const D = clamp(whole(p.depth, 9), 5, 14);
  const H = clamp(whole(p.height, 8), 4, 14);
  const bands = clamp(whole(p.bands, 3), 1, 5);
  const hw = W / 2;
  const hd = D / 2;
  const wall = 0.9;
  const out = [];
  let y = 0;

  if (p.feet) {
    const fi = Math.max(1.4, hw - 2.2);
    const fo = Math.max(fi + 0.6, hw - 0.5);
    const zi = Math.max(1.2, hd - 2.0);
    const zo = Math.max(zi + 0.5, hd - 0.5);
    quad(out, "foot", fi, fo, zi, zo, 0, 1.2, "iron");
    y = 1.2;
  }

  const bodyBase = y;
  const bodyTop = bodyBase + H;
  out.push(box("floor", [-hw + wall, bodyBase, -hd + wall], [hw - wall, bodyBase + 0.7, hd - wall], "leather_dark"));
  out.push(box("wall_f", [-hw, bodyBase, -hd], [hw, bodyTop, -hd + wall], "wood"));
  out.push(box("wall_b", [-hw, bodyBase, hd - wall], [hw, bodyTop, hd], "wood"));
  out.push(box("wall_l", [-hw, bodyBase, -hd + wall], [-hw + wall, bodyTop, hd - wall], "wood"));
  out.push(box("wall_r", [hw - wall, bodyBase, -hd + wall], [hw, bodyTop, hd - wall], "wood"));

  const bandH = Math.min(0.5, H / (bands * 2.2));
  for (let i = 0; i < bands; i++) {
    const by = bodyBase + (H * (i + 0.5)) / bands - bandH / 2;
    out.push(box("band_f_" + i, [-hw, by, -hd], [hw, by + bandH, -hd + 0.24], "iron"));
    out.push(box("band_b_" + i, [-hw, by, hd - 0.24], [hw, by + bandH, hd], "iron"));
    pairX(out, "band_s_" + i, hw - 0.24, hw, by, by + bandH, -hd + 0.24, hd - 0.24, "iron");
  }

  quad(out, "corner", hw - 0.9, hw, hd - 0.9, hd, bodyBase, bodyTop, "steel_dark");

  const strapY = bodyBase + H * 0.24;
  pairX(out, "strap", hw - 0.06, hw + 0.08, strapY, strapY + 0.6, -hd + 0.9, hd - 0.9, "leather_dark");
  const handleY = bodyBase + H * 0.34;
  pairX(out, "handle", hw + 0.1, hw + 0.38, handleY, handleY + 2.0, -0.5, 0.5, "iron");

  if (p.lid) {
    let ly = bodyTop;
    out.push(box("lid_top", [-hw - 0.35, ly, -hd - 0.35], [hw + 0.35, ly + 0.9, hd + 0.35], "wood"));
    out.push(box("lid_rim", [-hw - 0.5, ly + 0.9, -hd - 0.5], [hw + 0.5, ly + 1.5, hd + 0.5], "iron"));
    out.push(box("lid_arch_a", [-hw + 0.4, ly + 1.5, -hd + 0.4], [hw - 0.4, ly + 2.2, hd - 0.4], "brass"));
    if (hw > 1.6 && hd > 1.6) {
      out.push(box("lid_arch_b", [-hw + 1.2, ly + 2.2, -hd + 1.2], [hw - 1.2, ly + 2.7, hd - 1.2], "brass"));
    }
  }

  if (p.lock) {
    const lh = Math.max(1.2, Math.min(2.4, H * 0.45));
    const ly2 = bodyBase + (H - lh) / 2;
    out.push(box("lock_plate", [-1.5, ly2, -hd - 0.24], [1.5, ly2 + lh, -hd], "brass"));
    out.push(box("lock_keyhole", [-0.45, ly2 + lh * 0.3, -hd - 0.36], [0.45, ly2 + lh * 0.68, -hd - 0.24], "gem"));
    const si = Math.max(1.7, hw - 2.6);
    const so = Math.min(hw - 0.3, si + 0.8);
    if (so > si) {
      pairX(out, "lock_strap", si, so, ly2, ly2 + lh, -hd - 0.18, -hd, "iron");
    }
  }

  return out;
}

export const SIGN_PARAMS = {
  height: { type: "number", default: 16, min: 8, max: 30, description: "post height above the plinth" },
  width: { type: "number", default: 12, min: 6, max: 20, description: "crossbeam span across x" },
  arms: { type: "number", default: 2, min: 1, max: 3, description: "number of stacked crossbeams; the signature of a paifang gate" },
  plaque: { type: "boolean", default: true, description: "hang the framed name board between the beams" },
  roof: { type: "boolean", default: true, description: "add stepped tile caps over each crossbeam" },
  ornaments: { type: "boolean", default: true, description: "add the top finial and the hanging side tassels" }
};

export function buildSign(input) {
  const p = Object.assign({ height: 16, width: 12, arms: 2, plaque: true, roof: true, ornaments: true }, input || {});
  const H = clamp(whole(p.height, 16), 8, 30);
  const W = clamp(whole(p.width, 12), 6, 20);
  const arms = clamp(whole(p.arms, 2), 1, 3);
  const hw = W / 2;
  const postHalf = 0.85;
  const postX = Math.max(1.7, hw * 0.52);
  const out = [];
  let y = 0;

  pairX(out, "plinth_a", postX - postHalf - 0.9, postX + postHalf + 0.9, 0, 1.0, -(postHalf + 0.9), postHalf + 0.9, "stone_dark");
  pairX(out, "plinth_b", postX - postHalf - 0.5, postX + postHalf + 0.5, 1.0, 1.7, -(postHalf + 0.5), postHalf + 0.5, "stone");
  pairX(out, "plinth_c", postX - postHalf - 0.25, postX + postHalf + 0.25, 1.7, 2.3, -(postHalf + 0.25), postHalf + 0.25, "stone_dark");
  y = 2.3;

  pairX(out, "post_foot", postX - postHalf - 0.3, postX + postHalf + 0.3, y, y + 0.7, -(postHalf + 0.3), postHalf + 0.3, "stone");
  y += 0.7;

  const postTop = y + H;
  pairX(out, "post", postX - postHalf, postX + postHalf, y, postTop, -postHalf, postHalf, "wood");

  for (let i = 0; i < 4; i++) {
    const cy = Math.min(postTop - 0.7, y + (postTop - y) * (0.22 + 0.19 * i));
    pairX(out, "collar_" + i, postX - postHalf - 0.25, postX + postHalf + 0.25, cy, cy + 0.6, -postHalf - 0.25, postHalf + 0.25, "iron");
  }
  pairX(out, "post_cap", postX - postHalf - 0.3, postX + postHalf + 0.3, postTop - 0.1, postTop + 0.7, -(postHalf + 0.3), postHalf + 0.3, "brass");

  const beamFactor = (a) => (arms === 1 ? 0.62 : 0.5 + (0.34 * a) / (arms - 1));
  for (let a = 0; a < arms; a++) {
    const by = y + (postTop - y) * beamFactor(a);
    const bh = 1.15;
    out.push(box("beam_" + a, [-hw, by, -postHalf - 0.35], [hw, by + bh, postHalf + 0.35], "stone_dark"));
    pairX(out, "beam_cap_" + a, hw - 0.9, hw + 0.5, by - 0.25, by + bh + 0.25, -postHalf - 0.6, postHalf + 0.6, "brass");
    pairX(out, "beam_brace_" + a, hw * 0.35, hw * 0.72, by - 0.55, by, -postHalf - 0.2, postHalf + 0.2, "brass");
    out.push(box("beam_knot_" + a, [-0.7, by + bh, -postHalf - 0.62], [0.7, by + bh + 0.45, postHalf + 0.62], "brass"));
    if (p.roof) {
      out.push(box("roof_c_" + a, [-hw - 1.1, by + bh, -postHalf - 0.7], [hw + 1.1, by + bh + 0.55, postHalf + 0.7], "stone_dark"));
      pairX(out, "roof_s_" + a, hw - 2.2, hw + 1.9, by + bh + 0.55, by + bh + 1.1, -postHalf - 1.0, postHalf + 1.0, "brass");
    }
  }

  if (p.plaque) {
    const topBeam = y + (postTop - y) * beamFactor(arms - 1);
    const ph = Math.max(2.2, (postTop - y) * 0.2);
    const py = Math.max(y + 1.0, topBeam - ph - 1.2);
    const pw = Math.max(1.8, Math.min(hw * 0.62, 4.6));
    out.push(box("plaque_board", [-pw, py, -0.55], [pw, py + ph, 0.55], "wood"));
    out.push(box("plaque_cap_t", [-pw - 0.35, py + ph, -0.75], [pw + 0.35, py + ph + 0.5, 0.75], "iron"));
    out.push(box("plaque_cap_b", [-pw - 0.35, py - 0.5, -0.75], [pw + 0.35, py, 0.75], "iron"));
    pairX(out, "plaque_edge", pw, pw + 0.35, py, py + ph, -0.75, 0.75, "iron");
    if (p.ornaments) {
      const gy = py + ph * 0.3;
      out.push(box("plaque_gem", [-0.9, gy, -0.74], [0.9, gy + 1.2, -0.55], "gem"));
    }
  }

  if (p.ornaments) {
    out.push(box("finial_stem", [-0.4, postTop, -0.4], [0.4, postTop + 1.2, 0.4], "brass"));
    out.push(box("finial_ball", [-0.85, postTop + 1.2, -0.85], [0.85, postTop + 2.0, 0.85], "gem"));
    for (let a = 0; a < arms; a++) {
      const by = y + (postTop - y) * beamFactor(a);
      const ty = Math.max(0.4, by - 2.4);
      pairX(out, "tassel_" + a, hw + 0.5, hw + 1.15, ty, by, -0.35, 0.35, "leather_dark");
    }
  }

  return out;
}

export const FAMILIES = {
  "prop-lantern": {
    FAMILY: "prop-lantern",
    LABEL: "Lantern props: street lamp, hanging lantern, table lamp",
    PARAMS: LANTERN_PARAMS,
    build: buildLantern
  },
  "prop-chest": {
    FAMILY: "prop-chest",
    LABEL: "Chest props: banded storage chest with stepped lid",
    PARAMS: CHEST_PARAMS,
    build: buildChest
  },
  "prop-sign": {
    FAMILY: "prop-sign",
    LABEL: "Sign props: roadsign board and multi-beam paifang gate",
    PARAMS: SIGN_PARAMS,
    build: buildSign
  }
};
