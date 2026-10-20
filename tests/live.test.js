import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PNG } from "pngjs";
import { decodePng, pickB64, pngSize } from "../lib/live-codec.js";

function makePng(width, height) {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) { png.data[i] = 10; png.data[i + 1] = 20; png.data[i + 2] = 30; png.data[i + 3] = 255; }
  return PNG.sync.write(png);
}

test("pngSize reads dimensions from a real PNG header", () => {
  const buf = makePng(7, 3);
  assert.deepEqual(pngSize(buf), { width: 7, height: 3 });
});

test("pngSize rejects buffers that are not PNG", () => {
  assert.equal(pngSize(Buffer.from("not a png at all, definitely long enough")), null);
  assert.equal(pngSize(Buffer.alloc(4)), null);
  assert.equal(pngSize(null), null);
});

test("decodePng accepts raw base64 and data URLs", () => {
  const buf = makePng(2, 2);
  const raw = buf.toString("base64");
  assert.deepEqual(decodePng(raw), buf);
  assert.deepEqual(decodePng("data:image/png;base64," + raw), buf);
  assert.equal(decodePng("").length, 0);
});

test("pickB64 prefers the documented payload keys", () => {
  assert.equal(pickB64({ png_b64: "AAA" }), "AAA");
  assert.equal(pickB64({ see_png_b64: "BBB" }), "BBB");
  assert.equal(pickB64({ png_b64: "", see_png_b64: "CCC" }), "CCC");
  assert.equal(pickB64("plain"), "plain");
  assert.equal(pickB64({}), "");
  assert.equal(pickB64(null), "");
});

test("live module declares the eight direct-channel tools and exports the registrar", () => {
  const source = readFileSync(new URL("../lib/live.js", import.meta.url), "utf8");
  assert.match(source, /export function registerLive\(ctx\)/);
  const names = [...source.matchAll(/name: "(mc_live_[a-z_]+)"/g)].map(m => m[1]).sort();
  assert.deepEqual(names, ["mc_live_do", "mc_live_doctor", "mc_live_export", "mc_live_ops", "mc_live_preset", "mc_live_see", "mc_live_state", "mc_live_txn"]);
  assert.doesNotMatch(source, /export const name =/);
  assert.doesNotMatch(source, /export const inject =/);
});

test("plugin entry wires the live registrar alongside the offline tools", () => {
  const source = readFileSync(new URL("../lib/index.js", import.meta.url), "utf8");
  assert.match(source, /import \{ registerLive \} from "\.\/live\.js"/);
  assert.match(source, /registerLive\(ctx\)/);
  assert.match(source, /export const name = "dsh-blockbench-atelier"/);
});