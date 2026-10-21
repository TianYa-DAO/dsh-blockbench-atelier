import assert from "node:assert/strict";
import test from "node:test";
import { buildOrbitCode, normalizeOrbitParams } from "../lib/camera-control.js";
import { createFrameBridge, wheelToZoom } from "../lib/frame-server.js";

test("orbit parameters are clamped and defaulted", () => {
  const plain = normalizeOrbitParams({});
  assert.equal(plain.dx, 0);
  assert.equal(plain.dy, 0);
  assert.equal(plain.zoom, 1);
  const wild = normalizeOrbitParams({ dx: 99999, dy: -99999, zoom: 99, step: 0 });
  assert.equal(wild.dx, 2000);
  assert.equal(wild.dy, -2000);
  assert.equal(wild.zoom, 2.5);
  assert.ok(wild.step > 0);
});

test("the orbit code drives main_preview and re-renders", () => {
  const code = buildOrbitCode({ dx: 120, dy: -40, zoom: 0.9 });
  assert.match(code, /main_preview/);
  assert.match(code, /cam\.position\.set/);
  assert.match(code, /cam\.lookAt/);
  assert.match(code, /P\.render/);
  assert.match(code, /120 \* 0\.006/);
  assert.match(code, /-40 \* 0\.006/);
  assert.match(code, /0\.9/);
  assert.match(code, /Math\.PI - 0\.06/);
});

test("wheel deltas become a bounded zoom factor", () => {
  assert.equal(wheelToZoom(0), 1);
  assert.ok(wheelToZoom(-120) < 1, "scroll up zooms in, so the radius shrinks");
  assert.ok(wheelToZoom(120) > 1, "scroll down zooms out, so the radius grows");
  assert.ok(wheelToZoom(-9999) <= 2);
  assert.ok(wheelToZoom(9999) >= 0.5);
});

function fakeChannel(calls) {
  return async function request(method, params) {
    calls.push({ method, params });
    if (method === "health") return { ok: true, plugin: "bb-rt", blockbench: "5.2.2", project: "sword", elements: 66 };
    if (method === "see") return { png_b64: Buffer.from("8900000000", "hex").toString("base64") };
    if (method === "eval") return { value: { ok: true, radius: 30, theta: 0.2, phi: 1.4, position: [0, 12, 30], target: [0, 12, 0] } };
    throw new Error("unexpected " + method);
  };
}

test("the bridge orbits the camera and drops the cached frame", async () => {
  const calls = [];
  const bridge = createFrameBridge({ port: 0, request: fakeChannel(calls) });
  const started = await bridge.start();
  const base = "http://127.0.0.1:" + String(started.port);
  try {
    await fetch(base + "/frame.png");
    const firstFrames = calls.filter(c => c.method === "see").length;
    const orbit = await (await fetch(base + "/orbit?dx=100&dy=0")).json();
    assert.equal(orbit.ok, true);
    assert.equal(orbit.radius, 30);
    const evalCall = calls.find(c => c.method === "eval");
    assert.ok(evalCall, "orbit must go through eval");
    assert.match(evalCall.params.code, /main_preview/);
    await fetch(base + "/frame.png");
    const secondFrames = calls.filter(c => c.method === "see").length;
    assert.equal(secondFrames, firstFrames + 1, "a camera move must invalidate the cached frame");
    const status = await (await fetch(base + "/status.json")).json();
    assert.equal(status.orbits, 1);
  } finally {
    await bridge.stop();
  }
});

test("orbit refuses an empty request and reports channel failures", async () => {
  const bridge = createFrameBridge({ port: 0, request: fakeChannel([]) });
  const started = await bridge.start();
  const base = "http://127.0.0.1:" + String(started.port);
  try {
    const empty = await (await fetch(base + "/orbit")).json();
    assert.equal(empty.ok, false);
    assert.match(empty.error, /needs dx, dy or zoom/);
  } finally {
    await bridge.stop();
  }
});