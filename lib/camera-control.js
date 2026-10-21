const DEFAULT_STEP = 0.006;
const MIN_PHI = 0.06;

export function normalizeOrbitParams(input) {
  const source = input || {};
  const dx = Number.isFinite(Number(source.dx)) ? Number(source.dx) : 0;
  const dy = Number.isFinite(Number(source.dy)) ? Number(source.dy) : 0;
  const zoomRaw = Number(source.zoom);
  const zoom = Number.isFinite(zoomRaw) && zoomRaw > 0 ? Math.max(0.4, Math.min(2.5, zoomRaw)) : 1;
  const step = Number.isFinite(Number(source.step)) && Number(source.step) > 0 ? Number(source.step) : DEFAULT_STEP;
  return { dx: Math.max(-2000, Math.min(2000, dx)), dy: Math.max(-2000, Math.min(2000, dy)), zoom, step };
}

export function buildOrbitCode(input) {
  const p = normalizeOrbitParams(input);
  return [
    "var P = (typeof main_preview !== \"undefined\") ? main_preview : null;",
    "if (!P || !P.camera) return { ok: false, error: \"main_preview.camera is not reachable\" };",
    "var cam = P.camera;",
    "var ctl = P.controls || null;",
    "var tx = ctl && ctl.target ? ctl.target.x : 0;",
    "var ty = ctl && ctl.target ? ctl.target.y : 0;",
    "var tz = ctl && ctl.target ? ctl.target.z : 0;",
    "var ox = cam.position.x - tx, oy = cam.position.y - ty, oz = cam.position.z - tz;",
    "var radius = Math.sqrt(ox * ox + oy * oy + oz * oz);",
    "if (!radius || !isFinite(radius)) radius = 24;",
    "var theta = Math.atan2(ox, oz);",
    "var phi = Math.acos(Math.max(-1, Math.min(1, oy / radius)));",
    "theta -= " + String(p.dx) + " * " + String(p.step) + ";",
    "phi -= " + String(p.dy) + " * " + String(p.step) + ";",
    "phi = Math.max(" + String(MIN_PHI) + ", Math.min(Math.PI - " + String(MIN_PHI) + ", phi));",
    "var minD = ctl && isFinite(ctl.minDistance) ? ctl.minDistance : 3;",
    "var maxD = ctl && isFinite(ctl.maxDistance) ? ctl.maxDistance : 400;",
    "radius = Math.max(minD, Math.min(maxD, radius * " + String(p.zoom) + "));",
    "var sp = Math.sin(phi);",
    "cam.position.set(tx + radius * sp * Math.sin(theta), ty + radius * Math.cos(phi), tz + radius * sp * Math.cos(theta));",
    "if (typeof cam.lookAt === \"function\") cam.lookAt(tx, ty, tz);",
    "if (typeof cam.updateMatrixWorld === \"function\") cam.updateMatrixWorld(true);",
    "if (P.render) { try { P.render(); } catch (e) {} }",
    "return { ok: true, radius: radius, theta: theta, phi: phi, position: [cam.position.x, cam.position.y, cam.position.z], target: [tx, ty, tz] };"
  ].join("");
}

export async function orbitViewport(request, params) {
  if (typeof request !== "function") throw new Error("orbitViewport needs a channel request function");
  const code = buildOrbitCode(params);
  const result = await request("eval", { code }, 15000);
  const value = result && result.value ? result.value : result;
  if (!value || value.ok !== true) throw new Error("camera orbit refused: " + String(value && value.error ? value.error : "unknown"));
  return value;
}