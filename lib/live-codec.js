export function pngSize(buf) {
  if (!buf || buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
export function decodePng(value) {
  let s = String(value || "");
  const comma = s.indexOf(",");
  if (s.slice(0, 5) === "data:" && comma >= 0) s = s.slice(comma + 1);
  return Buffer.from(s, "base64");
}
export function pickB64(result) {
  if (!result) return "";
  if (typeof result === "string") return result;
  if (typeof result.png_b64 === "string" && result.png_b64) return result.png_b64;
  if (typeof result.see_png_b64 === "string" && result.see_png_b64) return result.see_png_b64;
  return "";
}
