import assert from "node:assert/strict";
import { PNG } from "pngjs";
import test from "node:test";
import { analyzeTexture, color, decodePng, paintRect } from "../lib/texture.js";

function fixture() {
  const png = new PNG({ width: 2, height: 2 });
  png.data.set([
    255, 0, 0, 255, 255, 0, 0, 0,
    0, 255, 0, 128, 0, 0, 255, 255
  ]);
  return png;
}

test("texture analysis separates physical and logical pixels and counts alpha", () => {
  const stats = analyzeTexture(PNG.sync.write(fixture()), { width: 1, height: 1 });
  assert.equal(stats.width, 2);
  assert.equal(stats.height, 2);
  assert.deepEqual(stats.pixelScale, { x: 2, y: 2 });
  assert.deepEqual(stats.alpha, { opaque: 2, transparent: 1, translucent: 1, visibleFraction: 0.75 });
  assert.equal(stats.uniqueVisibleColors, 3);
});

test("PNG decoding rejects invalid signatures and images over the pixel cap", () => {
  assert.throws(() => decodePng(Buffer.from("not a png")), /PNG image/);
  const header = Buffer.alloc(24);
  header.set([137, 80, 78, 71, 13, 10, 26, 10]);
  header.writeUInt32BE(4096, 16);
  header.writeUInt32BE(4097, 20);
  assert.throws(() => decodePng(header), /16M pixel limit/);
});

test("colors validate hex formats and rectangle painting enforces atlas bounds", () => {
  assert.deepEqual(color("#123456"), [18, 52, 86, 255]);
  assert.deepEqual(color("#12345678"), [18, 52, 86, 120]);
  assert.throws(() => color("red"), /#RRGGBB/);
  const png = fixture();
  paintRect(png, [0, 0, 1, 1], [1, 2, 3, 4]);
  assert.deepEqual([...png.data.slice(0, 4)], [1, 2, 3, 4]);
  assert.throws(() => paintRect(png, [2, 1, 1, 1], [0, 0, 0, 255]), /inside the atlas/);
});
