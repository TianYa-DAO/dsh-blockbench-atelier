import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";

export const MAX_PIXELS = 4096 * 4096;

export function decodePng(buffer) {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error("Expected a PNG image.");
  }
  const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
  if (!width || !height || width * height > MAX_PIXELS) throw new Error("PNG exceeds the 16M pixel limit.");
  return PNG.sync.read(buffer, { checkCRC: true });
}

export function embeddedPng(texture) {
  const source = texture?.source;
  if (typeof source !== "string" || !source.startsWith("data:image/png;base64,")) {
    throw new Error("No embedded PNG; supply the external PNG path explicitly.");
  }
  if (source.length > 48_000_000) throw new Error("Embedded PNG exceeds the size limit.");
  return Buffer.from(source.slice("data:image/png;base64,".length), "base64");
}

const round = value => Math.round(value * 10000) / 10000;
const powerOfTwo = value => value > 0 && (value & (value - 1)) === 0;

export function analyzeTexture(buffer, logicalSize) {
  const png = decodePng(buffer), { width, height, data } = png;
  const counts = new Map();
  let opaque = 0, transparent = 0, translucent = 0, lumaSum = 0;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  let edges = 0, edgePairs = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4, a = data[i + 3];
      if (a === 0) { transparent++; continue; }
      if (a === 255) opaque++; else translucent++;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      const hex = "#" + Buffer.from(data.subarray(i, i + 3)).toString("hex");
      counts.set(hex, (counts.get(hex) || 0) + 1);
      const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      lumaSum += luma;
      for (const j of [x + 1 < width ? i + 4 : -1, y + 1 < height ? i + width * 4 : -1]) {
        if (j < 0 || data[j + 3] === 0) continue;
        edgePairs++;
        if (Math.max(...[0, 1, 2].map(c => Math.abs(data[i + c] - data[j + c]))) >= 24) edges++;
      }
    }
  }
  const visible = opaque + translucent, total = width * height;
  const logical = logicalSize || { width, height };
  const topColors = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 12)
    .map(([hex, pixels]) => ({ hex, pixels, visibleFraction: round(pixels / visible) }));
  return {
    width, height, logicalWidth: logical.width, logicalHeight: logical.height,
    pixelScale: { x: width / logical.width, y: height / logical.height },
    powerOfTwo: powerOfTwo(width) && powerOfTwo(height),
    alpha: { opaque, transparent, translucent, visibleFraction: round(visible / total) },
    visibleBounds: visible ? [minX, minY, maxX + 1, maxY + 1] : null,
    uniqueVisibleColors: counts.size, topColors,
    meanVisibleLuma: visible ? round(lumaSum / visible) : 0,
    highContrastNeighborFraction: edgePairs ? round(edges / edgePairs) : 0,
    caveats: ["Color counts describe the atlas, not a material palette or artistic quality score.",
      "Transparency alone does not imply emission. Verify the target renderer."]
  };
}

export async function inspectTexture(file, logicalSize) {
  return analyzeTexture(await readFile(file), logicalSize);
}

export function color(hex) {
  if (typeof hex !== "string" || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) {
    throw new Error("Color must be #RRGGBB or #RRGGBBAA.");
  }
  const bytes = [...Buffer.from(hex.slice(1), "hex")];
  return bytes.length === 3 ? [...bytes, 255] : bytes;
}

export function paintRect(png, rect, rgba) {
  const [x, y, w, h] = rect;
  if (![x, y, w, h].every(Number.isInteger) || x < 0 || y < 0 || w < 0 || h < 0 || x + w > png.width || y + h > png.height) {
    throw new Error("Paint rectangle must use integer pixels inside the atlas.");
  }
  for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) {
    png.data.set(rgba, (row * png.width + col) * 4);
  }
}
