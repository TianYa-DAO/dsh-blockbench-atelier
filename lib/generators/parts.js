export function box(name, from, to, material) {
  if (!Array.isArray(from) || !Array.isArray(to)) throw new Error("box needs from/to arrays: " + name);
  return { name, from, to, material };
}

export function mirrorX(part, suffix) {
  return {
    name: part.name + (suffix || "_r"),
    from: [-part.to[0], part.from[1], part.from[2]],
    to: [-part.from[0], part.to[1], part.to[2]],
    material: part.material
  };
}

export function taper(halfWidthAt, exponent) {
  return Math.max(0.12, halfWidthAt * Math.pow(1 - 0, exponent || 1));
}

export function boundsOf(parts) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const part of parts) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], part.from[i], part.to[i]);
      max[i] = Math.max(max[i], part.from[i], part.to[i]);
    }
  }
  return { min, max, size: max.map((v, i) => Math.round((v - min[i]) * 1000) / 1000) };
}

export function round3(v) { return Math.round(v * 1000) / 1000; }

export function resolve(PARAMS, input) {
  const out = {};
  for (const [key, spec] of Object.entries(PARAMS)) {
    out[key] = spec && typeof spec === "object" && Object.prototype.hasOwnProperty.call(spec, "default") ? spec.default : spec;
  }
  return Object.assign(out, input || {});
}