import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { connect as netConnect } from "node:net";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { createHash } from "node:crypto";
import { decodePng, pickB64, pngSize } from "./live-codec.js";
import { OP_CATALOG, OP_CATALOG_NOTE } from "./op-catalog.js";

let lastSee = null;

const PLUGIN_VERSION = "0.3.0";
const HOST = "127.0.0.1";
const DEFAULT_PORT = 9878;
const root = fileURLToPath(new URL("../", import.meta.url));

function resolvePort() {
  const raw = Number(process.env.BB_RT_PORT);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return DEFAULT_PORT;
}

const PORT = resolvePort();
const UNREACHABLE = "Blockbench 未运行或 bb-bridge 插件未加载：连不上 " + HOST + ":" + String(PORT);
const FIX_HINT = "Start Blockbench, enable the bb-bridge plugin and grant its net permission (Always allow for this plugin), then retry. Override the port with BB_RT_PORT.";
const CONNECT_TIMEOUT = 3000;
const DEFAULT_TIMEOUT = 60000;
const IDLE_CLOSE_MS = 60000;
const MAX_FRAME = 32 * 1024 * 1024;

function unreachableError(cause) {
  const err = new Error(UNREACHABLE);
  err.cause = cause;
  err.bbUnreachable = true;
  return err;
}

function describeFailure(e) {
  if (!e) return UNREACHABLE;
  if (e.bbUnreachable) return UNREACHABLE;
  const code = e.code || "";
  if (["ECONNREFUSED", "ECONNRESET", "ECONNABORTED", "EHOSTUNREACH", "ENOTFOUND", "EPIPE", "ETIMEDOUT"].includes(code)) return UNREACHABLE;
  const msg = String(e.message || e);
  if (msg.indexOf("ECONNREFUSED") >= 0) return UNREACHABLE;
  if (msg.indexOf("channel closed") >= 0) return UNREACHABLE;
  return msg;
}

let socket = null;
let socketReady = null;
let rxBuf = "";
let nextId = 0;
let idleTimer = null;
const pending = new Map();

function clearIdle() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function armIdle() {
  clearIdle();
  idleTimer = setTimeout(function () {
    if (pending.size === 0) closeSocket(unreachableError(new Error("channel idle closed")));
  }, IDLE_CLOSE_MS);
  if (idleTimer && typeof idleTimer.unref === "function") idleTimer.unref();
}

function failAllPending(err) {
  const entries = Array.from(pending.entries());
  pending.clear();
  for (const entry of entries) {
    clearTimeout(entry[1].timer);
    entry[1].reject(err);
  }
}

function closeSocket(err) {
  const s = socket;
  socket = null;
  socketReady = null;
  rxBuf = "";
  clearIdle();
  if (s) {
    try {
      s.destroy();
    } catch (e) {
      void e;
    }
  }
  failAllPending(err || unreachableError(new Error("channel closed")));
}

function onFrame(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch (e) {
    return;
  }
  if (!msg || typeof msg !== "object") return;
  const entry = pending.get(msg.id);
  if (!entry) return;
  pending.delete(msg.id);
  clearTimeout(entry.timer);
  if (msg.ok === true) {
    entry.resolve(msg.result === undefined ? null : msg.result);
  } else {
    const text = typeof msg.error === "string" && msg.error ? msg.error : "channel reported ok=false";
    entry.reject(new Error(text));
  }
  if (pending.size === 0) armIdle();
}

function onData(chunk) {
  rxBuf += chunk.toString("utf8");
  if (rxBuf.length > MAX_FRAME) {
    closeSocket(new Error("channel frame exceeded " + String(MAX_FRAME) + " bytes without a newline"));
    return;
  }
  let idx;
  while ((idx = rxBuf.indexOf(String.fromCharCode(10))) >= 0) {
    const line = rxBuf.slice(0, idx).trim();
    rxBuf = rxBuf.slice(idx + 1);
    if (line) onFrame(line);
  }
}

function ensureSocket() {
  if (socket && !socket.destroyed) return Promise.resolve(socket);
  if (socketReady) return socketReady;
  const attempt = new Promise(function (resolve, reject) {
    let settled = false;
    let s;
    try {
      s = netConnect({ host: HOST, port: PORT });
    } catch (e) {
      reject(unreachableError(e));
      return;
    }
    const timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      try {
        s.destroy();
      } catch (e) {
        void e;
      }
      socket = null;
      socketReady = null;
      reject(unreachableError(new Error("connect timed out after " + String(CONNECT_TIMEOUT) + "ms")));
    }, CONNECT_TIMEOUT);
    if (timer && typeof timer.unref === "function") timer.unref();
    try {
      s.setNoDelay(true);
    } catch (e) {
      void e;
    }
    s.on("connect", function () {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket = s;
      rxBuf = "";
      s.on("data", onData);
      s.on("error", function (e) {
        if (socket === s) closeSocket(unreachableError(e));
      });
      s.on("close", function () {
        if (socket === s) closeSocket(unreachableError(new Error("channel closed by peer")));
      });
      armIdle();
      resolve(s);
    });
    s.on("error", function (e) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket = null;
      socketReady = null;
      reject(unreachableError(e));
    });
  });
  socketReady = attempt;
  attempt.catch(function () {
    socketReady = null;
  });
  return attempt;
}

function channelRequest(method, params, timeoutMs) {
  const budget = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT;
  return ensureSocket().then(function (s) {
    return new Promise(function (resolve, reject) {
      const id = (nextId += 1);
      const payload = JSON.stringify({ id: id, method: method, params: params || {} }) + String.fromCharCode(10);
      const timer = setTimeout(function () {
        pending.delete(id);
        reject(new Error("channel request '" + method + "' timed out after " + String(budget) + "ms"));
        closeSocket(unreachableError(new Error("channel response timed out")));
      }, budget);
      if (timer && typeof timer.unref === "function") timer.unref();
      pending.set(id, { resolve: resolve, reject: reject, timer: timer });
      try {
        s.write(payload);
      } catch (e) {
        pending.delete(id);
        clearTimeout(timer);
        reject(unreachableError(e));
      }
    });
  });
}


function pngDir() {
  const d = resolve(tmpdir(), "bb-rt");
  mkdirSync(d, { recursive: true });
  return d;
}

function savePng(buf, tag) {
  const dir = pngDir();
  const ts = Date.now();
  let file = join(dir, String(ts) + ".png");
  let n = 1;
  while (existsSync(file)) {
    file = join(dir, String(ts) + "-" + String(n) + ".png");
    n += 1;
  }
  writeFileSync(file, buf);
  const dim = pngSize(buf);
  const out = { png: file, bytes: buf.length };
  if (dim) {
    out.width = dim.width;
    out.height = dim.height;
  } else {
    out.warning = "channel body is not a recognizable PNG";
  }
  if (tag) out.tag = tag;
  return out;
}



async function maybeAttach(ctx, pngPath, fileName) {
  try {
    const attachments = ctx && typeof ctx.get === "function" ? ctx.get("attachments") : null;
    if (!attachments || typeof attachments.saveImage !== "function") return null;
    const data = readFileSync(pngPath);
    const ref = await attachments.saveImage({ data: data, mediaType: "image/png", name: fileName });
    return { attachmentId: ref.attachmentId, mediaType: ref.mediaType, bytes: ref.bytes, width: ref.width, height: ref.height };
  } catch (e) {
    return null;
  }
}

function presetFile() {
  return process.env.BB_RT_PRESET_FILE || join(root, "presets.json");
}

function readPresets() {
  try {
    const data = JSON.parse(readFileSync(presetFile(), "utf8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch (e) {
    return {};
  }
}

function writePresets(all) {
  const f = presetFile();
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify(all, null, 2) + String.fromCharCode(10), "utf8");
  return f;
}

function renderJson(_args, result) {
  return JSON.stringify(result);
}

const OUTPUT = { schema: { type: "object", additionalProperties: true }, render: renderJson };

function skillDefinitions() {
  const dir = join(root, "skills", "blockbench-modeling");
  if (!existsSync(join(dir, "SKILL.md"))) return [];
  return [{
    name: "blockbench-modeling",
    description: "Drive Blockbench over the bb-rt direct channel: create and edit cuboid models, groups, textures and UVs, render previews, roll back batches, and export Bedrock geometry and animations.",
    invocation: { modelInvocable: true, userInvocable: true },
    provider: "dsh-blockbench-atelier",
    source: "bundled",
    rank: 600,
    resourceBase: { kind: "directory", path: dir },
    locator: { dir: dir },
    path: join(dir, "SKILL.md")
  }];
}

const definitions = skillDefinitions();

const provider = {
  name: "dsh-blockbench-atelier",
  list: async function () {
    return definitions.slice();
  },
  get: async function (candidate) {
    const dir = candidate && candidate.locator ? candidate.locator.dir : undefined;
    if (typeof dir !== "string") return undefined;
    const raw = readFileSync(join(dir, "SKILL.md"), "utf8");
    const fence = String.fromCharCode(10) + "---" + String.fromCharCode(10);
    const end = raw.indexOf(fence, 4);
    if (raw.indexOf("---" + String.fromCharCode(10)) !== 0 || end < 0) throw new Error("Invalid skill frontmatter: " + String(candidate.name));
    return Object.assign({}, candidate, { content: raw.slice(end + 5).trimStart() });
  }
};

function doctorBase() {
  return { plugin: "dsh-blockbench-atelier", pluginVersion: PLUGIN_VERSION, endpoint: HOST + ":" + String(PORT), presetFile: presetFile() };
}

export function registerLive(ctx) {
  if (definitions.length && ctx.skills && typeof ctx.skills.registerProvider === "function") {
    ctx.skills.registerProvider(function () {
      return provider;
    });
  }

  ctx.tools.register(defineTool({
    name: "mc_live_see",
    description: "Render the current Blockbench model to a PNG and return the file path plus pixel size. This is the fast visual feedback loop: change something, call this, look at the result. Use read_image on the returned path.",
    parameters: {
      width: { type: "integer", description: "Image width in pixels; default 512." },
      height: { type: "integer", description: "Image height in pixels; default 512." },
      max_size: { type: "integer", description: "Square frame shortcut: sets width and height to this value (clamped 64-2048) when width/height are omitted. Use it to control token cost." },
      angle: { type: "string", description: "Camera angle: front, back, left, right, top, bottom or iso. Default is the current view." },
      force: { type: "boolean", description: "Write and return the frame even when it is byte-identical to the previous one. Default false reuses the previous path to save tokens." }
    },
    output: OUTPUT,
    isConcurrencySafe: () => true,
    timeoutMs: 120000,
    async execute(args) {
      const params = {};
      if (args.width !== undefined) params.width = args.width;
      if (args.height !== undefined) params.height = args.height;
      if (args.angle !== undefined) params.angle = args.angle;
      if (args.max_size !== undefined && args.width === undefined && args.height === undefined) {
        const cap = Math.max(64, Math.min(2048, Math.floor(args.max_size)));
        params.width = cap;
        params.height = cap;
      }
      const result = await channelRequest("see", params, 120000);
      const b64 = pickB64(result);
      if (!b64) throw new Error("channel returned no png_b64 for see (the bridge refused to produce a frame)");
      const buf = decodePng(b64);
      if (!buf.length) throw new Error("channel returned an empty png_b64 payload");
      const digest = createHash("sha256").update(buf).digest("hex");
      if (args.force !== true && lastSee && lastSee.digest === digest) {
        return Object.assign({ ok: true, reused: true, note: "identical to the previous frame; pass force=true to write a new file" }, lastSee.meta);
      }
      const saved = savePng(buf, "see");
      lastSee = { digest, meta: Object.assign({}, saved, { strategy: result.strategy, variance: result.variance }) };
      const attached = await maybeAttach(ctx, saved.png, "blockbench-see.png");
      if (attached) return Object.assign({ ok: true }, saved, { strategy: result.strategy, variance: result.variance, attachment: attached });
      return Object.assign({ ok: true }, saved, { strategy: result.strategy, variance: result.variance });
    }
  }));

  ctx.tools.register(defineTool({
    name: "mc_live_do",
    description: "Run a batch of Blockbench operations in one round trip on the Blockbench side (the inner loop). The agent only sees the summary, not the intermediate steps. Use see=true to also render a preview PNG, and txn=rollback to undo the whole batch afterwards so you can try something and back out.",
    parameters: {
      ops: { type: "array", required: true, description: "Operations to run in order; each entry is {op, args}.", items: { type: "object", additionalProperties: true, properties: { op: { type: "string", required: true }, args: { type: "object", additionalProperties: true } } } },
      see: { type: "boolean", description: "Render a preview PNG after the batch and return its file path." },
      txn: { type: "string", description: "keep (default) stores the changes; rollback undoes the whole batch." },
      stop_on_error: { type: "boolean", description: "Stop at the first failing op; default true." }
    },
    output: OUTPUT,
    isConcurrencySafe: () => false,
    timeoutMs: 300000,
    async execute(args) {
      if (!Array.isArray(args.ops)) throw new Error("ops must be an array of {op, args} entries");
      const params = { ops: args.ops, stop_on_error: args.stop_on_error === undefined ? true : !!args.stop_on_error, see: args.see === true };
      if (args.txn === "rollback" || args.txn === "keep") params.txn = args.txn;
      const data = await channelRequest("batch", params, 300000);
      const out = {};
      if (data && typeof data === "object") {
        for (const k of Object.keys(data)) {
          if (k === "see_png_b64" || k === "png_b64") continue;
          out[k] = data[k];
        }
      }
      const b64 = pickB64(data);
      if (b64) {
        const buf = decodePng(b64);
        if (buf.length) {
          const saved = savePng(buf, "batch");
          const attached = await maybeAttach(ctx, saved.png, "blockbench-batch.png");
          out.see = attached ? Object.assign({}, saved, { attachment: attached }) : saved;
        } else {
          out.see = { error: "batch returned an empty png payload" };
        }
      }
      return out;
    }
  }));

  ctx.tools.register(defineTool({
    name: "mc_live_eval",
    description: "Escape hatch: run arbitrary JavaScript inside Blockbench with a persistent kernel object K shared across calls. Use it for anything the fixed ops do not cover (material rebinding, Codecs.project.parse, custom geometry loops) and to keep helper functions between calls, e.g. K.buildBlade = function(...){...}. Returns the JSON-safe return value plus K's keys. Runs with full Blockbench privileges on the local channel; nothing leaves the machine.",
    parameters: {
      code: { type: "string", required: true, description: "Body of an async function; use return to send a value back to DSH. K is the persistent kernel, args is the parsed args object." },
      args: { type: "object", additionalProperties: true, description: "Values exposed to the code as args." }
    },
    output: OUTPUT,
    isConcurrencySafe: () => false,
    timeoutMs: 120000,
    async execute(args) {
      if (typeof args.code !== "string" || !args.code.trim()) throw new Error("code must be a non-empty string");
      const params = { code: args.code };
      if (args.args && typeof args.args === "object") params.args = args.args;
      return channelRequest("eval", params, 120000);
    }
  }));

  ctx.tools.register(defineTool({
    name: "mc_live_state",
    description: "Read the current Blockbench project state: project summary, cubes, groups, textures and animations. Use it to see what exists before editing.",
    parameters: {},
    output: OUTPUT,
    isConcurrencySafe: () => true,
    timeoutMs: 60000,
    async execute() {
      return channelRequest("state", {}, 60000);
    }
  }));

  ctx.tools.register(defineTool({
    name: "mc_live_ops",
    description: "List every operation with argument shapes, when to use it and when not to. Answered from the local catalog (no round trip) so it works even while Blockbench is busy; pass live=true to ask the running Blockbench instead.",
    parameters: {
      live: { type: "boolean", description: "Ask the running Blockbench for its own op list instead of the local catalog." }
    },
    output: OUTPUT,
    isConcurrencySafe: () => true,
    timeoutMs: 60000,
    async execute(args) {
      if (args && args.live === true) return channelRequest("ops", {}, 60000);
      return { ok: true, source: "local", count: OP_CATALOG.length, ops: OP_CATALOG, note: OP_CATALOG_NOTE };
    }
  }));

  ctx.tools.register(defineTool({
    name: "mc_live_txn",
    description: "Transaction control for the Blockbench undo stack: undo, redo, mark a restore point, or roll back to the last mark. Pairs with mc_live_do txn=rollback for safe experimentation.",
    parameters: {
      action: { type: "string", required: true, description: "undo, redo, mark or rollback_to." }
    },
    output: OUTPUT,
    isConcurrencySafe: () => false,
    timeoutMs: 60000,
    async execute(args) {
      const allowed = ["undo", "redo", "mark", "rollback_to"];
      if (!allowed.includes(args.action)) throw new Error("action must be one of: " + allowed.join(", "));
      return channelRequest("history", { action: args.action }, 60000);
    }
  }));

  ctx.tools.register(defineTool({
    name: "mc_live_export",
    description: "Export the current Blockbench project to a file on disk and return the absolute path written.",
    parameters: {
      format: { type: "string", required: true, description: "Export format: bedrock_geo, bedrock_anim, gltf or png." },
      path: { type: "string", required: true, description: "Absolute destination path." }
    },
    output: OUTPUT,
    isConcurrencySafe: () => false,
    timeoutMs: 180000,
    async execute(args) {
      return channelRequest("export", { format: args.format, path: args.path }, 180000);
    }
  }));

  ctx.tools.register(defineTool({
    name: "mc_live_preset",
    description: "Local JSON recipe library for repeatable op batches: list saved recipes, save the ops you just validated under a name, or apply a saved recipe to the live model.",
    parameters: {
      action: { type: "string", required: true, description: "list, save or apply." },
      name: { type: "string", description: "Recipe name; required for save and apply." },
      ops: { type: "array", description: "Operations to store; required for save.", items: { type: "object", additionalProperties: true, properties: { op: { type: "string", required: true }, args: { type: "object", additionalProperties: true } } } }
    },
    output: OUTPUT,
    isConcurrencySafe: () => false,
    timeoutMs: 300000,
    async execute(args) {
      const file = presetFile();
      const all = readPresets();
      if (args.action === "list") {
        return { ok: true, file: file, presets: Object.keys(all).sort(), count: Object.keys(all).length };
      }
      if (args.action === "save") {
        if (typeof args.name !== "string" || !args.name) throw new Error("name is required when action=save");
        if (!Array.isArray(args.ops)) throw new Error("ops must be an array when action=save");
        all[args.name] = { ops: args.ops, savedAt: new Date().toISOString() };
        writePresets(all);
        return { ok: true, file: file, saved: args.name, ops: args.ops.length };
      }
      if (args.action === "apply") {
        if (typeof args.name !== "string" || !args.name) throw new Error("name is required when action=apply");
        const entry = all[args.name];
        if (!entry || !Array.isArray(entry.ops)) throw new Error("no such preset: " + args.name + " (run action=list)");
        const data = await channelRequest("batch", { ops: entry.ops, stop_on_error: true }, 300000);
        const out = { ok: true, applied: args.name };
        if (data && typeof data === "object") {
          for (const k of Object.keys(data)) {
            if (k === "see_png_b64" || k === "png_b64") continue;
            out[k] = data[k];
          }
        }
        return out;
      }
      throw new Error("action must be one of: list, save, apply");
    }
  }));

  ctx.tools.register(defineTool({
    name: "mc_live_doctor",
    description: "bb-rt channel operations: doctor (full acceptance check, returns kind=ok only when Blockbench and the bb-bridge plugin are actually reachable), status (health payload plus kind), probe (raw health round trip).",
    parameters: {
      op: { type: "string", required: true, description: "doctor, status or probe." }
    },
    output: OUTPUT,
    isConcurrencySafe: () => true,
    timeoutMs: 60000,
    async execute(args) {
      const base = doctorBase();
      let health;
      try {
        health = await channelRequest("health", {}, 30000);
      } catch (e) {
        if (args.op === "probe") return Object.assign({}, base, { kind: "unreachable", ok: false, error: describeFailure(e), fix: FIX_HINT });
        return Object.assign({}, base, { kind: "unreachable", ok: false, error: describeFailure(e), fix: FIX_HINT });
      }
      if (!health || health.ok !== true) {
        if (args.op === "probe") return Object.assign({}, base, { kind: "degraded", ok: false, health: health });
        return Object.assign({}, base, { kind: "degraded", ok: false, health: health, error: (health && health.error) || "channel reported ok=false", fix: FIX_HINT });
      }
      if (args.op === "probe") return health;
      if (args.op === "status") return Object.assign({}, base, { kind: "ok", ok: true, health: health });
      return Object.assign({}, base, {
        kind: "ok",
        ok: true,
        channel: { plugin: health.plugin, version: health.version },
        blockbench: health.blockbench,
        project: health.project,
        format: health.format,
        counts: { elements: health.elements, groups: health.groups, textures: health.textures, animations: health.animations }
      });
    }
  }));
}
