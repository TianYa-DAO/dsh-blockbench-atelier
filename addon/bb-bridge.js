(function () {
'use strict';

var PLUGIN_ID = 'bb_bridge';
var PLUGIN_VERSION = '0.3.0';
var HOST = '127.0.0.1';
var DEFAULT_PORT = 9878;
var MAX_LINE = 32 * 1024 * 1024;
var BLANK_VARIANCE_MIN = 1.0;
var BLANK_MIN_BYTES = 3000;

function G(name) {
  try { if (typeof globalThis !== 'undefined' && typeof globalThis[name] !== 'undefined') return globalThis[name]; } catch (e) {}
  try { if (typeof window !== 'undefined' && typeof window[name] !== 'undefined') return window[name]; } catch (e) {}
  return undefined;
}

function errText(e) {
  if (!e) return 'unknown error';
  if (typeof e === 'string') return e;
  if (e.message) return String(e.message);
  return String(e);
}

function resolveNet() {
  var cands = [];
  try { if (typeof require === 'function') cands.push({ fn: require, tag: 'require' }); } catch (e) {}
  try { if (typeof window !== 'undefined' && typeof window.require === 'function') cands.push({ fn: window.require, tag: 'window.require' }); } catch (e) {}
  try { if (typeof globalThis !== 'undefined' && typeof globalThis.require === 'function') cands.push({ fn: globalThis.require, tag: 'globalThis.require' }); } catch (e) {}
  try { if (typeof module !== 'undefined' && module && typeof module.require === 'function') cands.push({ fn: module.require, tag: 'module.require' }); } catch (e) {}
  try { var rnm = G('requireNativeModule'); if (typeof rnm === 'function') cands.push({ fn: rnm, tag: 'requireNativeModule' }); } catch (e) {}
  var errors = [];
  for (var i = 0; i < cands.length; i++) {
    try {
      var mod = cands[i].fn('net');
      if (!mod || typeof mod.createServer !== 'function') throw new Error('module has no createServer');
      return { net: mod, source: cands[i].tag, errors: errors, attempts: cands.map(function (c) { return c.tag; }) };
    } catch (e) {
      errors.push(cands[i].tag + ': ' + errText(e));
    }
  }
  return { net: null, source: null, errors: errors, attempts: cands.map(function (c) { return c.tag; }) };
}

var netRes = resolveNet();
var netMod = netRes.net;
var netSource = netRes.source;
var netErrors = netRes.errors;
var BUF = null;
try { if (typeof Buffer !== 'undefined') BUF = Buffer; } catch (e) {}

function b64ToBytes(b64) {
  var clean = String(b64 || '').replace(/^data:[^,]*,/, '');
  if (BUF) return new Uint8Array(BUF.from(clean, 'base64'));
  if (typeof atob === 'function') {
    var s = atob(clean);
    var u = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  }
  throw new Error('no base64 decoder available in this environment');
}

function bytesToB64(u8) {
  if (BUF) return BUF.from(u8).toString('base64');
  if (typeof btoa === 'function') {
    var s = '';
    var CH = 0x8000;
    for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return btoa(s);
  }
  throw new Error('no base64 encoder available in this environment');
}

function utf8Len(str) {
  if (BUF) return BUF.byteLength(str, 'utf8');
  var n = 0;
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

var server = null;
var serverPort = null;
var serverError = null;
var markIndex = null;
var connCount = 0;
var lastCapture = { strategy: null, at: null, ok: null };
var undoCache = null;

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function toArr(v, fb) {
  if (Array.isArray(v)) return v.slice();
  if (typeof v === 'number') return [v, v, v];
  return fb ? fb.slice() : [];
}
function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }

function blockbenchNs() { return G('Blockbench'); }
function canvasNs() { return G('Canvas'); }
function bbVersion() { var b = blockbenchNs(); return b && b.version ? String(b.version) : 'unknown'; }
function projectRef() {
  var p = G('Project');
  if (p && typeof p === 'object') return p;
  var b = blockbenchNs();
  if (b && b.Project && typeof b.Project === 'object') return b.Project;
  return null;
}

function resolveUndoImpl() {
  var cands = [];
  var u = G('Undo');
  if (u && typeof u === 'object') cands.push({ v: u, src: 'Undo' });
  var b = blockbenchNs();
  if (b) {
    if (b.Undo && typeof b.Undo === 'object') cands.push({ v: b.Undo, src: 'Blockbench.Undo' });
    if (b.undo && typeof b.undo === 'object') cands.push({ v: b.undo, src: 'Blockbench.undo' });
  }
  var US = G('UndoSystem');
  if (US) {
    if (typeof US === 'object') cands.push({ v: US, src: 'UndoSystem' });
    if (US.instance) cands.push({ v: US.instance, src: 'UndoSystem.instance' });
    if (US._instance) cands.push({ v: US._instance, src: 'UndoSystem._instance' });
    if (US.prototype && typeof US.prototype === 'object') cands.push({ v: US.prototype, src: 'UndoSystem.prototype(not-usable)' });
  }
  if (b) {
    var keys = [];
    try { keys = Object.keys(b); } catch (e) { keys = []; }
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (!/undo/i.test(k)) continue;
      try { if (b[k] && typeof b[k] === 'object') cands.push({ v: b[k], src: 'Blockbench.' + k }); } catch (e) {}
    }
  }
  for (var j = 0; j < cands.length; j++) {
    var c = cands[j];
    if (c.src.indexOf('not-usable') >= 0) continue;
    if (typeof c.v.initEdit === 'function' && typeof c.v.finishEdit === 'function') return { impl: c.v, source: c.src, probed: cands.map(function (x) { return x.src; }) };
  }
  return { impl: null, source: null, probed: cands.map(function (x) { return x.src; }) };
}

function undoImpl() {
  if (undoCache && undoCache.impl) return undoCache;
  undoCache = resolveUndoImpl();
  return undoCache;
}

function undoStart() {
  var r = undoImpl();
  if (!r.impl) throw new Error('Undo API not found (probed: ' + r.probed.join(',') + '); see health.api_probe');
  r.impl.initEdit(aspectSnapshot());
}
function undoEnd(label) {
  var r = undoImpl();
  if (!r.impl) throw new Error('Undo API not found (probed: ' + r.probed.join(',') + ')');
  r.impl.finishEdit(label || 'bb-rt edit', aspectSnapshot());
}
function undoDepth() {
  var r = undoImpl();
  if (!r.impl) return null;
  if (typeof r.impl.index === 'number') return r.impl.index;
  if (Array.isArray(r.impl.history)) return r.impl.history.length;
  return null;
}

function outlinerNs() { return G('Outliner'); }

function allElements() {
  var o = outlinerNs();
  if (o && Array.isArray(o.elements)) return o.elements.slice();
  var c = G('Cube');
  if (c && Array.isArray(c.all)) return c.all.slice();
  return [];
}
function allGroups() {
  var g = G('Group');
  if (g && Array.isArray(g.all)) return g.all.slice();
  var o = outlinerNs();
  if (o && Array.isArray(o.nodes)) {
    var out = [];
    for (var i = 0; i < o.nodes.length; i++) {
      var n = o.nodes[i];
      if (n && (n.type === 'group' || (n.children && !n.faces))) out.push(n);
    }
    return out;
  }
  return [];
}
function allTextures() { var t = G('Texture'); return t && Array.isArray(t.all) ? t.all.slice() : []; }
function allAnimations() {
  var a = G('Animator');
  if (a && Array.isArray(a.animations)) return a.animations.slice();
  var p = projectRef();
  return p && Array.isArray(p.animations) ? p.animations.slice() : [];
}

function formatsMap() { return G('Formats') || null; }
function formatKeys() {
  var F = formatsMap();
  if (!F) return [];
  var out = [];
  var keys = [];
  try { keys = Object.keys(F); } catch (e) { keys = []; }
  for (var i = 0; i < keys.length; i++) {
    var v = null;
    try { v = F[keys[i]]; } catch (e) {}
    if (v && typeof v === 'object') out.push(keys[i]);
  }
  return out;
}
function resolveFormat(name) {
  var F = formatsMap();
  if (!F) return null;
  var t = String(name || '').toLowerCase();
  if (!t) return null;
  try { if (F[t] && typeof F[t] === 'object') return F[t]; } catch (e) {}
  var keys = formatKeys();
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var v = null;
    try { v = F[k]; } catch (e) {}
    if (!v) continue;
    if (String(k).toLowerCase() === t) return v;
    if (String(v.id || '').toLowerCase() === t) return v;
    if (String(v.name || '').toLowerCase() === t) return v;
  }
  return null;
}

function domCanvasInfo() {
  var n = 0, w = 0, h = 0;
  if (typeof document !== 'undefined' && document.querySelectorAll) {
    var list = document.querySelectorAll('canvas');
    n = list.length;
    for (var i = 0; i < list.length; i++) {
      var cw = list[i].width || 0, ch = list[i].height || 0;
      if (cw * ch > w * h) { w = cw; h = ch; }
    }
  }
  return { n: n, w: w, h: h };
}

async function ensureCanvasReady(opts) {
  var info = domCanvasInfo();
  if (info.n > 0 && info.w > 0 && info.h > 0) return { created_project: false, canvas: info.w + 'x' + info.h };
  if (opts && opts.allow_create_project === false) {
    throw new Error('no drawable canvas (' + info.n + ' canvas, largest ' + info.w + 'x' + info.h + ') and allow_create_project=false');
  }
  var fn = G('newProject');
  if (typeof fn !== 'function') {
    throw new Error('no drawable canvas (largest ' + info.w + 'x' + info.h + ') and newProject() is unavailable (typeof=' + typeof fn + ')');
  }
  var wanted = opts && opts.format ? String(opts.format) : 'free';
  var fmt = resolveFormat(wanted) || resolveFormat('free');
  if (!fmt) throw new Error('no drawable canvas and no usable format in Formats (keys: ' + formatKeys().join(',') + ')');
  fn(fmt);
  for (var i = 0; i < 40; i++) {
    await sleep(25);
    info = domCanvasInfo();
    if (info.w > 0 && info.h > 0) return { created_project: true, format: wanted, canvas: info.w + 'x' + info.h };
  }
  throw new Error('newProject() ran but canvas is still ' + info.w + 'x' + info.h + ' after 1s');
}

function findCamera() {
  var c = canvasNs();
  if (!c) return null;
  var direct = ['camera', 'cam', 'active_camera'];
  for (var i = 0; i < direct.length; i++) { try { if (c[direct[i]] && c[direct[i]].isCamera) return c[direct[i]]; } catch (e) {} }
  var sc = c.scene;
  if (sc && Array.isArray(sc.children)) {
    for (var j = 0; j < sc.children.length; j++) if (sc.children[j] && sc.children[j].isCamera) return sc.children[j];
    for (var k = 0; k < sc.children.length; k++) {
      var n = sc.children[k];
      if (n && n.children) for (var m = 0; m < n.children.length; m++) if (n.children[m] && n.children[m].isCamera) return n.children[m];
    }
  }
  return null;
}
function findRenderer() {
  var c = canvasNs();
  if (!c) return null;
  var keys = ['renderer', 'three_renderer', 'webgl_renderer'];
  for (var i = 0; i < keys.length; i++) { try { var r = c[keys[i]]; if (r && r.domElement) return r; } catch (e) {} }
  return null;
}
function findMainCanvas() {
  var c = canvasNs();
  if (c) {
    var keys = ['canvas', 'domElement', 'element'];
    for (var i = 0; i < keys.length; i++) { try { var cv = c[keys[i]]; if (cv && typeof cv.toDataURL === 'function') return cv; } catch (e) {} }
  }
  var r = findRenderer();
  if (r && r.domElement && typeof r.domElement.toDataURL === 'function') return r.domElement;
  if (typeof document !== 'undefined' && document.querySelectorAll) {
    var list = document.querySelectorAll('canvas'), best = null, area = 0;
    for (var j = 0; j < list.length; j++) {
      var el = list[j];
      if (typeof el.toDataURL !== 'function') continue;
      var a = (el.width || 0) * (el.height || 0);
      if (a > area) { area = a; best = el; }
    }
    if (best) return best;
  }
  return null;
}

function refresh(elements, textures) {
  var c = canvasNs();
  if (!c) return;
  var opts = {};
  if (elements && elements.length) { opts.elements = elements; opts.element_aspects = { geometry: true, faces: true }; }
  if (textures && textures.length) { opts.textures = textures; opts.texture_aspects = { uv: true }; }
  opts.selection = true;
  var did = false;
  try { if (typeof c.updateView === 'function') { c.updateView(opts); did = true; } } catch (e) {}
  if (!did) { try { if (typeof c.updateAll === 'function') c.updateAll(); } catch (e) {} }
  try { if (textures && textures.length && typeof c.updateLayeredTextures === 'function') c.updateLayeredTextures(textures); } catch (e) {}
}

function aspectSnapshot() {
  var a = { selection: true, outliner: true, bitmap: true, settings: true };
  var els = allElements(), grps = allGroups(), texs = allTextures();
  if (els.length) a.elements = els;
  if (grps.length) a.groups = grps;
  if (texs.length) a.textures = texs;
  return a;
}

function newCanvas2d(w, h) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  var cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  return cv;
}
function pngMagicOk(u8) {
  return !!u8 && u8.length >= 24 && u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47;
}
function dataUrlToBytes(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') throw new Error('capture returned no data URL');
  if (dataUrl.indexOf(',') < 0) throw new Error('capture returned malformed data URL');
  var u8 = b64ToBytes(dataUrl);
  if (!pngMagicOk(u8)) throw new Error('capture bytes are not a PNG');
  return u8;
}
function loadImageAsync(dataUrl) {
  return new Promise(function (resolve, reject) {
    if (typeof Image === 'undefined') { reject(new Error('Image constructor not available')); return; }
    var img = new Image();
    var done = false;
    img.onload = function () { if (!done) { done = true; resolve(img); } };
    img.onerror = function () { if (!done) { done = true; reject(new Error('failed to decode captured image')); } };
    img.src = dataUrl;
  });
}
function varianceOfPixels(data, step) {
  var s = step || 4, min = 255, max = 0, n = 0;
  for (var i = 0; i < data.length; i += 4 * s) {
    var lum = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    if (lum < min) min = lum;
    if (lum > max) max = lum;
    n++;
    if (n > 20000) break;
  }
  return n ? (max - min) : 0;
}
async function verifyNonBlank(dataUrl) {
  var img = await loadImageAsync(dataUrl);
  var w = Math.min(img.width || 0, 64), h = Math.min(img.height || 0, 64);
  if (!w || !h) throw new Error('captured image has zero size');
  var cv = newCanvas2d(w, h);
  if (!cv) throw new Error('cannot allocate verification canvas');
  var ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  return { variance: varianceOfPixels(ctx.getImageData(0, 0, w, h).data, 1), width: img.width, height: img.height };
}

function applyAngle(angle, camera, distance) {
  if (!angle || !camera || !camera.position) return false;
  var d = num(distance, 24);
  var dirs = { front: [0, 0, d], back: [0, 0, -d], left: [-d, 0, 0], right: [d, 0, 0], top: [0, d, 0.0001], bottom: [0, -d, 0.0001], iso: [d * 0.6, d * 0.6, d * 0.6] };
  var v = dirs[String(angle).toLowerCase()];
  if (!v) return false;
  camera.position.set(v[0], v[1], v[2]);
  if (typeof camera.lookAt === 'function') camera.lookAt(0, 0, 0);
  if (typeof camera.updateMatrixWorld === 'function') camera.updateMatrixWorld(true);
  return true;
}
function modelDistance() {
  var c = canvasNs();
  try {
    if (c && typeof c.getModelBoundingBox === 'function') {
      var bb = c.getModelBoundingBox();
      if (bb) {
        var sz = null;
        try { if (typeof bb.getSize === 'function') sz = bb.getSize(); } catch (e) { sz = null; }
        if (!sz && bb.min && bb.max) sz = { x: bb.max.x - bb.min.x, y: bb.max.y - bb.min.y, z: bb.max.z - bb.min.z };
        if (sz && isFinite(sz.x)) {
          var m = Math.max(Math.abs(sz.x), Math.abs(sz.y), Math.abs(sz.z));
          if (m > 0) return Math.max(8, m * 2.4);
        }
      }
    }
  } catch (e) {}
  try {
    if (c && typeof c.getModelSize === 'function') {
      var s = c.getModelSize();
      if (s && isFinite(s.x)) {
        var m2 = Math.max(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z));
        if (m2 > 0) return Math.max(8, m2 * 2.4);
      }
    }
  } catch (e) {}
  return 24;
}

async function captureViaRenderTarget(w, h) {
  var THREE = G('THREE'), renderer = findRenderer(), c = canvasNs();
  if (!THREE || !renderer || !c || !c.scene) throw new Error('render target path unavailable');
  var camera = findCamera();
  if (!camera) throw new Error('render target path: camera not found');
  var rt = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat });
  var prev = null;
  try { prev = renderer.getRenderTarget(); } catch (e) {}
  try {
    renderer.setRenderTarget(rt);
    renderer.render(c.scene, camera);
    var px = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
    var cv = newCanvas2d(w, h);
    if (!cv) throw new Error('render target path: cannot allocate canvas');
    var ctx = cv.getContext('2d');
    var img = ctx.createImageData(w, h);
    var row = w * 4;
    for (var y = 0; y < h; y++) {
      var src = (h - 1 - y) * row, dst = y * row;
      for (var x = 0; x < row; x++) img.data[dst + x] = px[src + x];
    }
    ctx.putImageData(img, 0, 0);
    return { dataUrl: cv.toDataURL('image/png'), variance: varianceOfPixels(img.data, 4), strategy: 'render_target', width: w, height: h };
  } finally {
    try { renderer.setRenderTarget(prev); } catch (e) {}
    try { rt.dispose(); } catch (e) {}
  }
}
function captureViaExistingCanvas(w, h) {
  var renderer = findRenderer(), camera = findCamera(), c = canvasNs();
  if (renderer && camera && c && c.scene && typeof renderer.render === 'function') { try { renderer.render(c.scene, camera); } catch (e) {} }
  var src = findMainCanvas();
  if (!src) throw new Error('no drawable canvas found');
  var sw = src.width || 0, sh = src.height || 0;
  if (!sw || !sh) throw new Error('main canvas has zero size (' + sw + 'x' + sh + ')');
  var r = findRenderer();
  var isDom = !!(r && r.domElement && r.domElement === src);
  var base = isDom ? 'renderer.domElement' : 'canvas.toDataURL';
  if (sw === w && sh === h) return { dataUrl: src.toDataURL('image/png'), strategy: base };
  var cv = newCanvas2d(w, h);
  if (!cv) throw new Error('cannot allocate resize canvas');
  cv.getContext('2d').drawImage(src, 0, 0, w, h);
  return { dataUrl: cv.toDataURL('image/png'), strategy: base + '+resize' };
}

async function capturePng(opts) {
  var w = Math.max(16, Math.min(4096, Math.round(num(opts && opts.width, 512))));
  var h = Math.max(16, Math.min(4096, Math.round(num(opts && opts.height, 512))));
  var angle = opts && opts.angle ? String(opts.angle) : null;
  var allowBlank = !!(opts && opts.allow_blank);
  var ready = await ensureCanvasReady(opts);
  var createdProject = !!ready.created_project;
  var camera = findCamera(), saved = null, angleApplied = false;
  if (angle && camera && camera.position) {
    try {
      saved = { pos: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
                quat: camera.quaternion ? { x: camera.quaternion.x, y: camera.quaternion.y, z: camera.quaternion.z, w: camera.quaternion.w } : null };
    } catch (e) { saved = null; }
    angleApplied = applyAngle(angle, camera, modelDistance());
    await sleep(0);
  }
  var attempts = [], result = null;
  try {
    try { result = await captureViaRenderTarget(w, h); attempts.push('render_target:ok'); }
    catch (e) { attempts.push('render_target:' + errText(e)); }
    if (!result) {
      for (var i = 0; i < 2; i++) {
        try { result = captureViaExistingCanvas(w, h); attempts.push(result.strategy + ':ok'); break; }
        catch (e2) { attempts.push('canvas:' + errText(e2)); await sleep(16); }
      }
    }
    if (!result) throw new Error('all capture strategies failed [' + attempts.join(' | ') + ']');
    var u8 = dataUrlToBytes(result.dataUrl);
    var variance = typeof result.variance === 'number' ? result.variance : null;
    var dims = null;
    if (variance === null) {
      try { var v = await verifyNonBlank(result.dataUrl); variance = v.variance; dims = { width: v.width, height: v.height }; }
      catch (e3) { attempts.push('verify:' + errText(e3)); }
    }
    if (variance === null && !allowBlank) throw new Error('capture produced an image that cannot be verified as non-blank on this build (no Image decoder); pass allow_blank=true to accept it explicitly');
    var blank = false;
    if (variance !== null && variance < BLANK_VARIANCE_MIN) blank = true;
    if (!blank && u8.length < BLANK_MIN_BYTES && w * h >= 65536) blank = true;
    if (blank && !allowBlank) throw new Error('capture succeeded but image is uniform/blank (variance=' + String(variance) + ', bytes=' + u8.length + ', strategy=' + result.strategy + '); pass allow_blank=true to accept');
    lastCapture = { strategy: result.strategy, at: Date.now(), ok: true };
    return { bytes: u8, width: dims ? dims.width : w, height: dims ? dims.height : h, strategy: result.strategy,
      variance: variance, angle_applied: angleApplied, blank: blank, created_project: createdProject,
      canvas: ready.canvas, attempts: attempts };
  } catch (e) {
    lastCapture = { strategy: null, at: Date.now(), ok: false };
    throw new Error(errText(e) + ' [' + attempts.join(' | ') + ']' + (createdProject ? ' [created_project=true]' : ''));
  } finally {
    if (saved && camera && camera.position) {
      try {
        camera.position.set(saved.pos.x, saved.pos.y, saved.pos.z);
        if (saved.quat && camera.quaternion) camera.quaternion.set(saved.quat.x, saved.quat.y, saved.quat.z, saved.quat.w);
        if (typeof camera.updateMatrixWorld === 'function') camera.updateMatrixWorld(true);
      } catch (e) {}
    }
  }
}

function projectSummary() {
  var p = projectRef(), b = blockbenchNs(), name = null;
  try { if (p && p.name) name = p.name; } catch (e) {}
  if (!name) { try { if (b && b.getProjectName) name = b.getProjectName(); } catch (e) {} }
  return {
    name: name,
    format: p && p.format ? (p.format.id || p.format.name || null) : null,
    format_name: p && p.format ? String(p.format.name || p.format.id || '') : null,
    model_identifier: p && typeof p.model_identifier === 'string' ? p.model_identifier : null,
    texture_width: p && typeof p.texture_width === 'number' ? p.texture_width : null,
    texture_height: p && typeof p.texture_height === 'number' ? p.texture_height : null,
    box_uv: p ? !!p.box_uv : null,
    open: !!p
  };
}
function elementSummary(el) {
  var o = { uuid: el.uuid || null, name: typeof el.name === 'string' ? el.name : null, type: el.type || null };
  if (el.from) o.from = toArr(el.from);
  if (el.to) o.to = toArr(el.to);
  if (el.origin) o.origin = toArr(el.origin);
  if (el.rotation) o.rotation = toArr(el.rotation);
  if (typeof el.inflate === 'number') o.inflate = el.inflate;
  if (typeof el.box_uv === 'boolean') o.box_uv = el.box_uv;
  if (el.parent) o.parent = el.parent.uuid || el.parent.name || null;
  return o;
}
function groupSummary(g) {
  var o = { uuid: g.uuid || null, name: typeof g.name === 'string' ? g.name : null, type: g.type || null };
  if (g.origin) o.origin = toArr(g.origin);
  if (g.rotation) o.rotation = toArr(g.rotation);
  if (g.parent) o.parent = g.parent.uuid || g.parent.name || null;
  var kids = [];
  if (Array.isArray(g.children)) for (var i = 0; i < g.children.length; i++) { var ch = g.children[i]; kids.push(ch && ch.uuid ? ch.uuid : (ch && ch.name ? ch.name : null)); }
  o.children = kids;
  return o;
}
function textureSummary(t) {
  return { uuid: t.uuid || null, name: typeof t.name === 'string' ? t.name : null,
    width: typeof t.width === 'number' ? t.width : null, height: typeof t.height === 'number' ? t.height : null,
    mode: t.mode || null, saved: typeof t.saved === 'boolean' ? t.saved : null };
}
function animationSummary(a) {
  var o = { uuid: a.uuid || null, name: typeof a.name === 'string' ? a.name : null,
    length: typeof a.length === 'number' ? a.length : null, loop: a.loop || null };
  if (Array.isArray(a.animators)) o.animator_count = a.animators.length;
  return o;
}
function statePayload() {
  var els = allElements(), grps = allGroups(), texs = allTextures(), anims = allAnimations();
  var elOut = [], grOut = [], txOut = [], anOut = [], i;
  for (i = 0; i < els.length && i < 2000; i++) elOut.push(elementSummary(els[i]));
  for (i = 0; i < grps.length && i < 500; i++) grOut.push(groupSummary(grps[i]));
  for (i = 0; i < texs.length && i < 200; i++) txOut.push(textureSummary(texs[i]));
  for (i = 0; i < anims.length && i < 200; i++) anOut.push(animationSummary(anims[i]));
  return { ok: true, project: projectSummary(), elements: elOut, groups: grOut, textures: txOut, animations: anOut };
}

function apiProbe() {
  var info = domCanvasInfo();
  var u = undoImpl();
  var c = canvasNs();
  var canvasKeys = [];
  if (c) { try { canvasKeys = Object.keys(c).slice(0, 40); } catch (e) {} }
  return {
    Project: typeof G('Project'),
    Undo: typeof G('Undo'),
    UndoSystem: typeof G('UndoSystem'),
    newProject: typeof G('newProject'),
    FormatsKeys: formatKeys(),
    Cube: typeof G('Cube'),
    Group: typeof G('Group'),
    domCanvases: info.n,
    canvasSize: info.w + 'x' + info.h,
    Texture: typeof G('Texture'),
    Outliner: typeof G('Outliner'),
    Codecs: typeof G('Codecs'),
    Canvas: typeof c,
    CanvasKeys: canvasKeys,
    undo_source: u.source,
    undo_probed: u.probed,
    project_open: !!projectRef()
  };
}

function healthPayload() {
  var st = null, stateErr = null;
  try { st = statePayload(); } catch (e) { stateErr = errText(e); }
  var b = blockbenchNs();
  var out = {
    ok: true,
    plugin: 'bb-rt',
    version: PLUGIN_VERSION,
    blockbench: bbVersion(),
    project: st && st.project ? st.project.name : null,
    format: st && st.project ? st.project.format : null,
    elements: st ? st.elements.length : 0,
    groups: st ? st.groups.length : 0,
    textures: st ? st.textures.length : 0,
    animations: st ? st.animations.length : 0,
    transport: 'tcp-ndjson',
    net_ok: !!netMod,
    net_source: netSource,
    net_errors: netErrors,
    net_attempts: netRes.attempts,
    node_route: netMod ? 'net' : null,
    buffer_ok: !!BUF,
    listening: !!server,
    port: serverPort,
    host: HOST,
    connections: connCount,
    is_web: b && b.isWeb ? true : false,
    is_mobile: b && b.isMobile ? true : false,
    capture_strategy: lastCapture.strategy,
    capture_ok: lastCapture.ok,
    undo_source: undoImpl().source,
    undo_depth: undoDepth(),
    mark_index: markIndex,
    has_camera: !!findCamera(),
    has_renderer: !!findRenderer(),
    has_canvas: !!findMainCanvas(),
    api_probe: apiProbe()
  };
  if (stateErr) out.state_error = stateErr;
  if (serverError) out.server_error = serverError;
  return out;
}

var OPS_META = [
  { name: 'state.get', args: {}, desc: 'current project state' },
  { name: 'cube.add', args: { from: '[x,y,z]', to: '[x,y,z]', name: 'str?', group: 'str?' }, desc: 'create a cube' },
  { name: 'cube.set', args: { uuid: 'str?', name: 'str?', from: '[x,y,z]?', to: '[x,y,z]?', rotation: '[x,y,z]?', origin: '[x,y,z]?', inflate: 'num?' }, desc: 'modify a cube' },
  { name: 'cube.remove', args: { uuid: 'str?', name: 'str?' }, desc: 'remove a cube' },
  { name: 'group.add', args: { name: 'str', origin: '[x,y,z]?' }, desc: 'create a group' },
  { name: 'group.assign', args: { uuid: 'str?', name: 'str?', group: 'str', group_uuid: 'str?' }, desc: 'move a cube into a group' },
  { name: 'texture.new', args: { name: 'str', width: 'int', height: 'int' }, desc: 'create a texture' },
  { name: 'texture.paint', args: { name: 'str', x: 'int', y: 'int', color: 'str?', dataurl: 'str?' }, desc: 'paint a pixel or blit an image' },
  { name: 'uv.map', args: { uuid: 'str?', name: 'str?', box_uv: 'bool?', face: 'str?', uv: '[u,v]' }, desc: 'set uv' },
  { name: 'project.set', args: { key: 'str', value: 'any' }, desc: 'set project field' },
  { name: 'project.new', args: { format: 'str' }, desc: 'new project via newProject(Formats[format])' },
  { name: 'anim.keyframe', args: { animator: 'str', channel: 'str', time: 'num', x: 'num?', y: 'num?', z: 'num?' }, desc: 'add a keyframe' },
  { name: 'see', args: { width: 'int?', height: 'int?', angle: 'str?', allow_create_project: 'bool?', allow_blank: 'bool?' }, desc: 'render preview' },
  { name: 'undo', args: {}, desc: 'undo' },
  { name: 'redo', args: {}, desc: 'redo' }
];

function need(name) {
  var v = G(name);
  if (!v) throw new Error(name + ' is not available in this Blockbench build');
  return v;
}

function findByUuidOrName(list, uuid, name) {
  if (!list || !list.length) return null;
  var i;
  if (uuid) { for (i = 0; i < list.length; i++) { if (list[i] && list[i].uuid === uuid) return list[i]; } }
  if (name) {
    for (i = 0; i < list.length; i++) { if (list[i] && list[i].name === name) return list[i]; }
    var low = String(name).toLowerCase();
    for (i = 0; i < list.length; i++) {
      if (list[i] && typeof list[i].name === 'string' && list[i].name.toLowerCase() === low) return list[i];
    }
  }
  return null;
}
function requireElement(args) {
  var el = findByUuidOrName(allElements(), args && args.uuid, args && args.name);
  if (!el) throw new Error('element not found: ' + String((args && (args.uuid || args.name)) || '(no uuid/name)') + ' (have ' + allElements().length + ')');
  return el;
}
function requireGroup(args) {
  var g = findByUuidOrName(allGroups(), args && args.group_uuid, args && args.group);
  if (!g) throw new Error('group not found: ' + String((args && (args.group_uuid || args.group)) || '(no group)') + ' (have ' + allGroups().length + ')');
  return g;
}
function requireTexture(args) {
  var t = findByUuidOrName(allTextures(), args && args.uuid, args && args.name);
  if (!t) throw new Error('texture not found: ' + String((args && (args.uuid || args.name)) || '(no name)') + ' (have ' + allTextures().length + ')');
  return t;
}

var OPS = {};

OPS['state.get'] = async function () { return statePayload(); };

OPS['cube.add'] = async function (args) {
  var CubeC = need('Cube');
  var from = toArr(args && args.from), to = toArr(args && args.to);
  if (from.length !== 3 || to.length !== 3) throw new Error('cube.add requires from and to as [x,y,z]');
  var opts = { from: from, to: to };
  if (args && args.name) opts.name = String(args.name);
  var cube = new CubeC(opts);
  if (typeof cube.init === 'function') cube.init();
  if (args && (args.group || args.group_uuid)) {
    var g = requireGroup({ group: args.group, group_uuid: args.group_uuid });
    if (typeof cube.addTo === 'function') cube.addTo(g);
  }
  refresh([cube], null);
  return { uuid: cube.uuid, name: cube.name, from: toArr(cube.from, from), to: toArr(cube.to, to) };
};

OPS['cube.set'] = async function (args) {
  var cube = requireElement(args), changed = [];
  if (args.from !== undefined) { cube.from = toArr(args.from); changed.push('from'); }
  if (args.to !== undefined) { cube.to = toArr(args.to); changed.push('to'); }
  if (args.rotation !== undefined) { cube.rotation = toArr(args.rotation); changed.push('rotation'); }
  if (args.origin !== undefined) { cube.origin = toArr(args.origin); changed.push('origin'); }
  if (args.inflate !== undefined) { cube.inflate = num(args.inflate, 0); changed.push('inflate'); }
  if (!changed.length) throw new Error('cube.set requires at least one of from/to/rotation/origin/inflate');
  refresh([cube], null);
  return { uuid: cube.uuid, name: cube.name, changed: changed, element: elementSummary(cube) };
};

OPS['cube.remove'] = async function (args) {
  var cube = requireElement(args), uuid = cube.uuid, label = cube.name;
  if (typeof cube.remove === 'function') cube.remove();
  else if (cube.parent && typeof cube.removeFromParent === 'function') cube.removeFromParent();
  else throw new Error('cube has no remove()');
  refresh(null, null);
  return { removed: true, uuid: uuid, name: label };
};

OPS['group.add'] = async function (args) {
  var GroupC = need('Group');
  var opts = { name: args && args.name ? String(args.name) : 'group' };
  if (args && args.origin) opts.origin = toArr(args.origin);
  var g = new GroupC(opts);
  if (typeof g.init === 'function') g.init();
  refresh(null, null);
  return { uuid: g.uuid, name: g.name };
};

OPS['group.assign'] = async function (args) {
  var cube = requireElement(args), g = requireGroup(args);
  if (typeof cube.addTo !== 'function') throw new Error('cube has no addTo()');
  cube.addTo(g);
  refresh([cube], null);
  return { uuid: cube.uuid, group: g.uuid, group_name: g.name };
};

OPS['texture.new'] = async function (args) {
  var TexC = need('Texture');
  var w = Math.max(1, Math.round(num(args && args.width, 16)));
  var h = Math.max(1, Math.round(num(args && args.height, 16)));
  var tex = new TexC({ name: args && args.name ? String(args.name) : 'texture', width: w, height: h, mode: 'bitmap' });
  var how = [];
  if (typeof tex.loadEmpty === 'function') { try { tex.loadEmpty(); how.push('loadEmpty'); } catch (e) { how.push('loadEmpty-failed:' + errText(e)); } }
  if (!tex.canvas && typeof tex.fromDataURL === 'function') {
    var cv = newCanvas2d(w, h);
    if (cv) { try { tex.fromDataURL(cv.toDataURL('image/png')); how.push('fromDataURL'); } catch (e) { how.push('fromDataURL-failed:' + errText(e)); } }
  }
  if (typeof tex.add === 'function') { tex.add(); how.push('add'); }
  refresh(null, [tex]);
  return { uuid: tex.uuid || null, name: tex.name, width: tex.width, height: tex.height, via: how.join('+') };
};

OPS['texture.paint'] = async function (args) {
  var tex = requireTexture(args);
  var x = Math.round(num(args && args.x, 0)), y = Math.round(num(args && args.y, 0));
  var ctx = tex.ctx;
  if (!ctx || !tex.canvas) throw new Error('texture has no editable canvas (ctx=' + typeof ctx + ', canvas=' + typeof tex.canvas + ')');
  if (args && args.dataurl) {
    var img = await loadImageAsync(String(args.dataurl));
    ctx.drawImage(img, x, y);
  } else {
    ctx.fillStyle = args && args.color ? String(args.color) : '#ffffff';
    ctx.fillRect(x, y, 1, 1);
  }
  refresh(null, [tex]);
  return { name: tex.name, x: x, y: y, mode: args && args.dataurl ? 'blit' : 'pixel' };
};

OPS['uv.map'] = async function (args) {
  var cube = requireElement(args), changed = [];
  if (args && args.box_uv !== undefined) { cube.box_uv = !!args.box_uv; changed.push('box_uv'); }
  if (args && args.uv !== undefined) {
    var uv = toArr(args.uv);
    if (uv.length !== 2) throw new Error('uv.map requires uv as [u,v]');
    if (!args.face) throw new Error('uv.map requires face when uv is given');
    var face = String(args.face);
    if (!cube.faces || !cube.faces[face]) throw new Error('face not found on cube: ' + face);
    cube.faces[face].uv = uv;
    changed.push('uv.' + face);
  }
  if (!changed.length) throw new Error('uv.map requires box_uv and/or face+uv');
  refresh([cube], null);
  return { uuid: cube.uuid, changed: changed };
};

OPS['project.set'] = async function (args) {
  var p = projectRef();
  if (!p) throw new Error('no project open (Project is ' + typeof G('Project') + '); run project.new first');
  if (!args || !args.key) throw new Error('project.set requires key');
  var key = String(args.key);
  if (key === 'format') {
    var fmt = resolveFormat(args.value);
    if (!fmt) throw new Error('unknown format: ' + String(args.value) + ' (available: ' + formatKeys().join(',') + ')');
    var via = 'assign';
    try { if (typeof fmt.select === 'function') { fmt.select(); via = 'fmt.select()'; } } catch (e) { via = 'assign(fmt.select failed: ' + errText(e) + ')'; }
    p.format = fmt;
    return { key: key, value: fmt.id || fmt.name || String(args.value), via: via };
  }
  p[key] = args.value;
  refresh(null, null);
  return { key: key, value: args.value };
};

OPS['project.new'] = async function (args) {
  var fn = G('newProject');
  if (typeof fn !== 'function') throw new Error('newProject() is not available (typeof=' + typeof fn + '); see health.api_probe');
  var wanted = args && args.format ? String(args.format) : 'free';
  var fmt = resolveFormat(wanted);
  if (!fmt) throw new Error('unknown format: ' + wanted + ' (available: ' + formatKeys().join(',') + ')');
  fn(fmt);
  await sleep(50);
  refresh(null, null);
  return { ok: true, format: wanted, project: projectSummary(), canvas: domCanvasInfo() };
};

OPS['anim.keyframe'] = async function (args) {
  var Anim = G('Animator');
  if (!Anim) throw new Error('Animator is not available in this build');
  var list = allAnimations();
  if (!list.length) throw new Error('no animation in project');
  var anim = findByUuidOrName(list, args && args.animator, args && args.animator);
  if (!anim && list.length === 1) anim = list[0];
  if (!anim) throw new Error('animation not found: ' + String((args && args.animator) || ''));
  var channel = args && args.channel ? String(args.channel) : 'position';
  var time = num(args && args.time, 0);
  if (!anim.animators) throw new Error('animation has no animators (no bones)');
  var keys = Object.keys(anim.animators);
  if (!keys.length) throw new Error('animation has no animators (no bones)');
  var target = null;
  for (var i = 0; i < keys.length; i++) { var kf = anim.animators[keys[i]]; if (kf && kf.name === channel) { target = kf; break; } }
  if (!target) target = anim.animators[channel];
  if (!target) throw new Error('channel not found: ' + channel + ' (available: ' + keys.slice(0, 8).join(',') + ')');
  var vec = [num(args && args.x, 0), num(args && args.y, 0), num(args && args.z, 0)];
  var existing = null;
  if (Array.isArray(target.keyframes)) {
    for (var j = 0; j < target.keyframes.length; j++) if (target.keyframes[j] && target.keyframes[j].time === time) { existing = target.keyframes[j]; break; }
  }
  if (!existing) {
    if (typeof target.addKeyframe !== 'function') throw new Error('channel has no addKeyframe');
    var created = target.addKeyframe({ time: time, interpolation: 'linear', uniform: false, values: { x: vec[0], y: vec[1], z: vec[2] } });
    if (created && created.values) { created.values.x = vec[0]; created.values.y = vec[1]; created.values.z = vec[2]; }
    refresh(null, null);
    return { animator: anim.name || anim.uuid, channel: channel, time: time, values: vec, created: true };
  }
  if (existing.values) { existing.values.x = vec[0]; existing.values.y = vec[1]; existing.values.z = vec[2]; }
  refresh(null, null);
  return { animator: anim.name || anim.uuid, channel: channel, time: time, values: vec, created: false };
};

OPS['see'] = async function (args) {
  var cap = await capturePng(args || {});
  return { png_b64: bytesToB64(cap.bytes), width: cap.width, height: cap.height, bytes: cap.bytes.length,
    strategy: cap.strategy, variance: cap.variance, angle_applied: cap.angle_applied, blank: cap.blank,
    created_project: cap.created_project, canvas: cap.canvas };
};

OPS['undo'] = async function () {
  var r = undoImpl();
  if (!r.impl) throw new Error('Undo API not found (probed: ' + r.probed.join(',') + '); see health.api_probe');
  r.impl.undo();
  refresh(null, null);
  return { depth: undoDepth(), source: r.source };
};
OPS['redo'] = async function () {
  var r = undoImpl();
  if (!r.impl) throw new Error('Undo API not found (probed: ' + r.probed.join(',') + ')');
  r.impl.redo();
  refresh(null, null);
  return { depth: undoDepth(), source: r.source };
};

function ownedTxn(opName) {
  return !!opName && opName !== 'see' && opName !== 'state.get' && opName !== 'undo' && opName !== 'redo';
}

async function runOne(spec, opts) {
  var t0 = Date.now();
  var opName = spec && spec.op ? String(spec.op) : '';
  var label = spec && spec.label ? String(spec.label) : opName;
  if (!opName) return { ok: false, op: '', label: label, error: 'missing op name', took_ms: 0 };
  var fn = OPS[opName];
  if (!fn) return { ok: false, op: opName, label: label, error: 'unknown op: ' + opName, took_ms: Date.now() - t0 };
  var managed = !!(opts && opts.external_txn);
  var undoOk = false;
  if (!managed && ownedTxn(opName)) { try { undoStart(); undoOk = true; } catch (e) {} }
  try {
    var result = await fn(spec.args || {});
    if (!managed && undoOk) { try { undoEnd(label); } catch (e) {} }
    return { ok: true, op: opName, label: label, result: result, took_ms: Date.now() - t0, undo: managed ? 'external' : (undoOk ? 'wrapped' : 'none') };
  } catch (e) {
    if (!managed && undoOk) { try { var u = undoImpl().impl; if (u && typeof u.cancelEdit === 'function') u.cancelEdit(); } catch (e2) {} }
    return { ok: false, op: opName, label: label, error: errText(e), took_ms: Date.now() - t0 };
  }
}

async function runBatch(payload) {
  var t0 = Date.now();
  var ops = payload && Array.isArray(payload.ops) ? payload.ops : null;
  if (!ops) throw new Error('batch requires ops array');
  if (!ops.length) throw new Error('batch requires at least one op');
  var stopOnError = payload.stop_on_error === undefined ? true : !!payload.stop_on_error;
  var wantSee = !!payload.see;
  var txn = payload.txn ? String(payload.txn) : 'keep';
  var external = txn === 'rollback';
  var results = [], ran = 0, failed = false;
  var ui = undoImpl();
  if (external && !ui.impl) throw new Error('txn rollback requires the Undo API, which was not found (probed: ' + ui.probed.join(',') + ')');
  if (external) { try { ui.impl.initEdit(aspectSnapshot()); } catch (e) { throw new Error('cannot open transaction: ' + errText(e)); } }
  try {
    for (var i = 0; i < ops.length; i++) {
      if (i > 0) await sleep(0);
      var r = await runOne(ops[i], { external_txn: external });
      results.push(r);
      if (r.ok) ran++; else { failed = true; if (stopOnError) break; }
    }
    if (external) { try { ui.impl.finishEdit('bb-rt batch', aspectSnapshot()); } catch (e) {} }
  } catch (e) {
    if (external) { try { ui.impl.finishEdit('bb-rt batch', aspectSnapshot()); } catch (e2) {} }
    throw e;
  }
  var rolledBack = false;
  if (external) {
    try { if (typeof ui.impl.undo === 'function') { ui.impl.undo(); rolledBack = true; } } catch (e) { rolledBack = false; }
    refresh(null, null);
  }
  var out = { ok: !failed, ran: ran, results: results, took_ms: Date.now() - t0,
    rolled_back: rolledBack, txn: txn, undo_source: ui.source, created_project: false };
  if (wantSee) {
    try {
      var cap = await capturePng({ width: payload.see_width, height: payload.see_height, angle: payload.angle,
        allow_blank: !!payload.allow_blank, allow_create_project: payload.allow_create_project, format: payload.format });
      out.see_png_b64 = bytesToB64(cap.bytes);
      out.see_meta = { width: cap.width, height: cap.height, bytes: cap.bytes.length, strategy: cap.strategy,
        variance: cap.variance, angle_applied: cap.angle_applied, created_project: cap.created_project };
      out.created_project = !!cap.created_project;
    } catch (e) { out.see_error = errText(e); }
  }
  return out;
}

async function doHistory(params) {
  var action = params && params.action ? String(params.action) : '';
  var ui = undoImpl();
  if (!ui.impl) throw new Error('Undo API not found (probed: ' + ui.probed.join(',') + '); see health.api_probe');
  var u = ui.impl;
  if (action === 'undo') { u.undo(); refresh(null, null); return { ok: true, depth: undoDepth(), source: ui.source }; }
  if (action === 'redo') { u.redo(); refresh(null, null); return { ok: true, depth: undoDepth(), source: ui.source }; }
  if (action === 'mark') { markIndex = undoDepth(); return { ok: true, depth: markIndex, mark: markIndex, source: ui.source }; }
  if (action === 'rollback_to') {
    if (markIndex === null) throw new Error('no mark set; send action "mark" first');
    var guard = 0, cur = undoDepth();
    while (cur !== null && cur > markIndex && guard < 10000) {
      u.undo();
      var next = undoDepth();
      if (next === null || next >= cur) break;
      cur = next; guard++;
      if (guard % 8 === 0) await sleep(0);
    }
    refresh(null, null);
    return { ok: true, depth: undoDepth(), mark: markIndex, undone: guard, source: ui.source };
  }
  throw new Error('unknown action: ' + action + ' (undo|redo|mark|rollback_to)');
}

async function doExport(params) {
  var format = params && params.format ? String(params.format) : '';
  if (!format) throw new Error('export requires format');
  var wanted = params && params.path ? String(params.path) : null;
  if (format === 'png' || format === 'image') {
    var cap = await capturePng({ width: params.width, height: params.height, angle: params.angle,
      allow_blank: !!params.allow_blank, allow_create_project: params.allow_create_project });
    return { ok: true, format: 'png', path: wanted, encoding: 'base64', content: bytesToB64(cap.bytes),
      bytes: cap.bytes.length, width: cap.width, height: cap.height, strategy: cap.strategy,
      created_project: cap.created_project, written: false };
  }
  var p = projectRef();
  if (!p) throw new Error('no project open; run project.new first');
  var fmt = resolveFormat(format);
  var codec = null;
  if (fmt && fmt.codec) { try { codec = new fmt.codec(fmt); } catch (e) { codec = null; } }
  if (!codec && fmt && typeof fmt.codec === 'function') { try { codec = fmt.codec(fmt); } catch (e) { codec = null; } }
  if (!codec || typeof codec.compile !== 'function') {
    var Codecs = G('Codecs');
    if (Codecs && Codecs[format] && typeof Codecs[format].compile === 'function') codec = Codecs[format];
  }
  if (!codec || typeof codec.compile !== 'function') {
    throw new Error('export format not supported on this build: ' + format + ' (no compile-capable codec; formats: ' + formatKeys().join(',') + ')');
  }
  var compiled = codec.compile({ model: p, single_file: true, raw: false });
  var text;
  if (typeof compiled === 'string') text = compiled;
  else if (compiled && typeof compiled.model === 'string') text = compiled.model;
  else text = JSON.stringify(compiled, null, 2);
  return { ok: true, format: format, path: wanted, encoding: 'utf8', content: text, bytes: utf8Len(text), written: false };
}

async function dispatch(method, params) {
  if (method === 'health') return { result: healthPayload(), ok: true };
  if (method === 'ops') return { result: { ok: true, ops: OPS_META }, ok: true };
  if (method === 'state') return { result: statePayload(), ok: true };
  if (method === 'op') {
    var r = await runOne(params || {}, { external_txn: false });
    return { result: r, ok: !!r.ok, error: r.ok ? null : r.error };
  }
  if (method === 'batch') {
    var b = await runBatch(params || {});
    return { result: b, ok: !!b.ok, error: b.ok ? null : 'one or more ops failed' };
  }
  if (method === 'see') {
    var cap = await capturePng(params || {});
    return { result: { png_b64: bytesToB64(cap.bytes), width: cap.width, height: cap.height,
      bytes: cap.bytes.length, strategy: cap.strategy, variance: cap.variance,
      angle_applied: cap.angle_applied, blank: cap.blank,
      created_project: cap.created_project, canvas: cap.canvas }, ok: true };
  }
  if (method === 'history') {
    var h = await doHistory(params || {});
    return { result: h, ok: !!h.ok, error: h.ok ? null : h.error };
  }
  if (method === 'export') {
    var x = await doExport(params || {});
    return { result: x, ok: !!x.ok, error: x.ok ? null : x.error };
  }
  throw new Error('unknown method: ' + method + ' (health|ops|state|op|batch|see|history|export)');
}
function sendLine(socket, obj) {
  return new Promise(function (resolve) {
    if (!socket || socket.destroyed) { resolve(); return; }
    var line;
    try { line = JSON.stringify(obj) + '\n'; } catch (e) { resolve(); return; }
    var flushed;
    try { flushed = socket.write(line, 'utf8'); } catch (e) { resolve(); return; }
    if (flushed) { resolve(); return; }
    var done = false;
    function fin() { if (done) return; done = true; try { socket.removeListener('drain', fin); } catch (e) {} resolve(); }
    try { socket.once('drain', fin); } catch (e) { resolve(); return; }
    setTimeout(fin, 5000);
  });
}

async function processLine(socket, line) {
  var trimmed = String(line || '').trim();
  if (!trimmed) return;
  var req = null;
  try { req = JSON.parse(trimmed); }
  catch (e) { await sendLine(socket, { id: null, ok: false, error: 'invalid JSON: ' + errText(e) }); return; }
  var id = req && req.id !== undefined ? req.id : null;
  var method = req && req.method ? String(req.method) : '';
  var params = req && req.params && typeof req.params === 'object' ? req.params : {};
  if (!method) { await sendLine(socket, { id: id, ok: false, error: 'missing method field' }); return; }
  try {
    var out = await dispatch(method, params);
    var resp = { id: id, ok: !!out.ok, result: out.result };
    if (out.error) resp.error = out.error;
    await sendLine(socket, resp);
  } catch (e) {
    await sendLine(socket, { id: id, ok: false, error: errText(e) });
  }
}

function makeProcessor(sock, lineText) {
  return function () { return processLine(sock, lineText); };
}

function onConnection(socket) {
  connCount++;
  try { socket.setNoDelay(true); } catch (e) {}
  try { socket.setEncoding('utf8'); } catch (e) {}
  var buf = '';
  var chain = Promise.resolve();
  socket.on('data', function (chunk) {
    buf += chunk;
    if (buf.length > MAX_LINE) {
      buf = '';
      try { socket.write(JSON.stringify({ id: null, ok: false, error: 'request exceeds ' + MAX_LINE + ' bytes' }) + '\n'); } catch (e) {}
      try { socket.destroy(); } catch (e) {}
      return;
    }
    for (;;) {
      var idx = buf.indexOf('\n');
      if (idx < 0) break;
      var line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      chain = chain.then(makeProcessor(socket, line)).catch(function () {});
    }
  });
  socket.on('error', function () {});
  socket.on('close', function () { try { connCount = Math.max(0, connCount - 1); } catch (e) {} });
}

function startServer() {
  if (!netMod) {
    serverError = 'cannot start TCP server: net module unavailable; attempts=[' + netRes.attempts.join(',') + '] errors=[' + netErrors.join(' | ') + ']';
    return Promise.resolve({ ok: false, error: serverError });
  }
  var envPort = null;
  try { if (typeof process !== 'undefined' && process && process.env) envPort = process.env.BB_RT_PORT; } catch (e) { envPort = null; }
  var wanted = num(envPort, DEFAULT_PORT);
  if (!wanted || wanted < 1 || wanted > 65535) wanted = DEFAULT_PORT;
  return new Promise(function (resolve) {
    var srv;
    try { srv = netMod.createServer(onConnection); } catch (e) { serverError = errText(e); resolve({ ok: false, error: serverError }); return; }
    srv.on('error', function (e) {
      serverError = errText(e);
      server = null; serverPort = null;
      try { var b = blockbenchNs(); if (b && b.showQuickMessage) b.showQuickMessage('bb-rt: ' + serverError, 4000); } catch (e2) {}
      resolve({ ok: false, error: serverError });
    });
    try {
      srv.listen(wanted, HOST, function () {
        server = srv; serverPort = wanted; serverError = null;
        resolve({ ok: true, port: wanted, host: HOST, transport: 'tcp-ndjson', net_source: netSource });
      });
    } catch (e) { serverError = errText(e); resolve({ ok: false, error: serverError }); }
  });
}

function stopServer() {
  return new Promise(function (resolve) {
    if (!server) { resolve({ ok: true, stopped: false }); return; }
    var srv = server;
    server = null;
    try { srv.close(function () { serverPort = null; resolve({ ok: true, stopped: true }); }); }
    catch (e) { serverPort = null; resolve({ ok: false, error: errText(e) }); }
  });
}


function notify(msg) {
  try { var b = blockbenchNs(); if (b && typeof b.showQuickMessage === 'function') { b.showQuickMessage(msg, 3000); return; } } catch (e) {}
  try { if (typeof console !== 'undefined' && console.log) console.log('[bb-rt] ' + msg); } catch (e) {}
}

var api = {
  version: PLUGIN_VERSION,
  transport: 'tcp-ndjson',
  netSource: function () { return netSource; },
  netErrors: function () { return netErrors.slice(); },
  start: startServer,
  stop: stopServer,
  health: healthPayload,
  state: statePayload,
  apiProbe: apiProbe,
  undoSource: function () { return undoImpl().source; },
  dispatch: dispatch,
  runOne: runOne,
  runBatch: runBatch,
  capture: capturePng,
  ops: OPS,
  opsMeta: OPS_META,
  port: function () { return serverPort; },
  markIndex: function () { return markIndex; }
};

try { if (typeof globalThis !== 'undefined') globalThis.__bb_rt__ = api; } catch (e) {}

Plugin.register('bb_bridge', {
  title: 'bb-rt Bridge',
  author: 'lampbearer',
  description: 'Local TCP control channel for Blockbench (newline-delimited JSON, 127.0.0.1:9878)',
  icon: 'icon-bb_interface',
  version: PLUGIN_VERSION,
  variant: 'desktop',
  tags: ['Minecraft: Bedrock Edition'],
  onload: function () {
    startServer().then(function (r) {
      if (r && r.ok) notify('bb-rt tcp listening on ' + HOST + ':' + r.port + ' via ' + String(netSource));
      else notify('bb-rt failed: ' + String(r && r.error ? r.error : 'unknown'));
    }).catch(function (e) { notify('bb-rt failed: ' + errText(e)); });
  },
  onunload: function () {
    stopServer().then(function () { notify('bb-rt stopped'); }).catch(function () {});
  }
});
})();
