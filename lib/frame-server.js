import { createServer } from "node:http";

const DEFAULT_PANEL_PORT = 9879;
const FRAME_TTL_MS = 800;
const STATUS_TTL_MS = 1000;
const FRAME_TIMEOUT_MS = 20000;
const STATUS_TIMEOUT_MS = 6000;

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(Buffer.byteLength(text)),
    "cache-control": "no-store",
    "access-control-allow-origin": "*"
  });
  res.end(text);
}

function sendText(res, status, text) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8", "access-control-allow-origin": "*" });
  res.end(text);
}

export function resolvePanelPort() {
  const raw = Number(process.env.BB_ATELIER_PANEL_PORT);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 65535) return Math.round(raw);
  return DEFAULT_PANEL_PORT;
}

export function createFrameBridge(options) {
  const opts = options || {};
  const request = typeof opts.request === "function" ? opts.request : null;
  const wantPort = opts.port === undefined ? resolvePanelPort() : Number(opts.port);
  const state = {
    port: wantPort,
    png: null,
    frameAt: 0,
    status: null,
    statusAt: 0,
    lastError: request ? null : "no channel request function wired",
    frames: 0,
    startedAt: Date.now()
  };
  let frameFlight = null;

  async function refreshStatus() {
    if (!request) return null;
    const now = Date.now();
    if (state.status && now - state.statusAt < STATUS_TTL_MS) return state.status;
    try {
      state.status = (await request("health", {}, STATUS_TIMEOUT_MS)) || null;
      state.statusAt = now;
      if (state.status) state.lastError = null;
    } catch (error) {
      state.status = null;
      state.statusAt = now;
      state.lastError = String(error && error.message ? error.message : error);
    }
    return state.status;
  }

  async function refreshFrame() {
    if (!request) return null;
    const now = Date.now();
    if (state.png && now - state.frameAt < FRAME_TTL_MS) return state.png;
    if (frameFlight) return frameFlight;
    frameFlight = (async () => {
      try {
        const result = await request("see", { width: 480, height: 480, allow_blank: true }, FRAME_TIMEOUT_MS);
        const b64 = result && (result.png_b64 || result.see_png_b64);
        if (!b64) throw new Error("channel returned no frame");
        state.png = Buffer.from(b64, "base64");
        state.frameAt = Date.now();
        state.frames += 1;
        state.lastError = null;
        return state.png;
      } catch (error) {
        state.lastError = String(error && error.message ? error.message : error);
        return state.png;
      } finally {
        frameFlight = null;
      }
    })();
    return frameFlight;
  }

  function snapshot() {
    const ageMs = state.frameAt ? Date.now() - state.frameAt : null;
    const status = state.status;
    return {
      ok: !!state.png && !state.lastError,
      port: state.port,
      uptimeMs: Date.now() - state.startedAt,
      frames: state.frames,
      frame: state.png ? { bytes: state.png.length, ageMs, at: state.frameAt } : null,
      channel: status ? {
        connected: status.ok === true,
        plugin: status.plugin || null,
        pluginVersion: status.version || null,
        blockbench: status.blockbench || null,
        project: status.project || null,
        format: status.format || null,
        elements: status.elements,
        textures: status.textures,
        animations: status.animations
      } : { connected: false },
      error: state.lastError
    };
  }

  const server = createServer(async (req, res) => {
    const path = String(req.url || "/").split("?")[0];
    try {
      if (path === "/frame.png" || path === "/frame") {
        const png = await refreshFrame();
        if (!png) return sendJson(res, 503, { ok: false, error: state.lastError || "no frame yet" });
        res.writeHead(200, {
          "content-type": "image/png",
          "content-length": String(png.length),
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
          "x-frame-at": String(state.frameAt)
        });
        return res.end(png);
      }
      if (path === "/status.json" || path === "/status") {
        await refreshStatus();
        return sendJson(res, 200, snapshot());
      }
      if (path === "/" || path === "/health") return sendJson(res, 200, snapshot());
      return sendText(res, 404, "not found: " + path);
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: String(error && error.message ? error.message : error) });
    }
  });

  server.on("clientError", (error, socket) => { try { socket.destroy(); } catch (ignored) {} });

  return {
    get port() { return state.port; },
    start() {
      return new Promise(resolvePromise => {
        server.once("error", error => {
          state.lastError = String(error && error.message ? error.message : error);
          resolvePromise({ ok: false, port: state.port, error: state.lastError });
        });
        server.listen(wantPort, "127.0.0.1", () => {
          const address = server.address();
          if (address && typeof address === "object") state.port = address.port;
          resolvePromise({ ok: true, port: state.port });
        });
      });
    },
    stop() {
      return new Promise(resolvePromise => {
        try { server.close(() => resolvePromise(true)); } catch (error) { resolvePromise(false); }
      });
    },
    snapshot,
    refreshFrame,
    refreshStatus
  };
}

export function startFrameBridge(ctx, options) {
  const bridge = createFrameBridge(options);
  bridge.start().then(result => {
    if (!result.ok) {
      const logger = ctx && ctx.logger;
      if (logger && typeof logger.warn === "function") logger.warn("bb-atelier panel bridge cannot listen on " + String(result.port) + ": " + String(result.error));
    }
  }).catch(() => {});
  return bridge;
}