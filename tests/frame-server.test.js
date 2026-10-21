import assert from "node:assert/strict";
import test from "node:test";
import { createFrameBridge } from "../lib/frame-server.js";

const PNG_BYTES = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

function fakeRequest(calls) {
  return async function request(method) {
    calls.push(method);
    if (method === "health") return { ok: true, plugin: "bb-rt", version: "0.4.0", blockbench: "5.2.2", project: "wish", format: "bedrock", elements: 66, textures: 1, animations: 0 };
    if (method === "see") return { png_b64: PNG_BYTES.toString("base64"), width: 480, height: 480 };
    throw new Error("unexpected method " + method);
  };
}

async function withBridge(fn) {
  const calls = [];
  const bridge = createFrameBridge({ port: 0, request: fakeRequest(calls) });
  const started = await bridge.start();
  assert.equal(started.ok, true, "bridge must listen");
  const base = "http://127.0.0.1:" + String(started.port);
  try {
    await fn(base, calls, bridge);
  } finally {
    await bridge.stop();
  }
}

test("status.json reports the live channel facts", async () => {
  await withBridge(async base => {
    const response = await fetch(base + "/status.json");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    const body = await response.json();
    assert.equal(body.channel.connected, true);
    assert.equal(body.channel.project, "wish");
    assert.equal(body.channel.elements, 66);
    assert.equal(typeof body.port, "number");
  });
});

test("frame.png serves real png bytes", async () => {
  await withBridge(async base => {
    const response = await fetch(base + "/frame.png");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    const buffer = Buffer.from(await response.arrayBuffer());
    assert.deepEqual(buffer, PNG_BYTES);
  });
});

test("repeated frame requests reuse the cache inside the ttl", async () => {
  await withBridge(async (base, calls) => {
    await fetch(base + "/frame.png");
    await fetch(base + "/frame.png");
    await fetch(base + "/frame.png");
    const frameCalls = calls.filter(m => m === "see").length;
    assert.equal(frameCalls, 1, "three rapid frames must hit the channel once, got " + frameCalls);
  });
});

test("a broken channel reports 503 without throwing", async () => {
  const bridge = createFrameBridge({ port: 0, request: async () => { throw new Error("channel down"); } });
  const started = await bridge.start();
  try {
    const response = await fetch("http://127.0.0.1:" + String(started.port) + "/frame.png");
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.match(body.error, /channel down/);
  } finally {
    await bridge.stop();
  }
});

test("unknown paths 404 and the root serves the snapshot", async () => {
  await withBridge(async base => {
    const missing = await fetch(base + "/nope");
    assert.equal(missing.status, 404);
    const root = await fetch(base + "/");
    assert.equal(root.status, 200);
    const body = await root.json();
    assert.equal(typeof body.frames, "number");
  });
});