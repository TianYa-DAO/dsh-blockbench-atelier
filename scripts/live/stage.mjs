import net from 'node:net';
import { writeFileSync } from 'node:fs';
function tcp(method, params) {
  return new Promise((resolve, reject) => {
    const s = net.createConnection({ host: '127.0.0.1', port: 9878 }, () => {
      s.write(JSON.stringify({ id: 1, method, params: params || {} }) + String.fromCharCode(10));
    });
    let buf = '';
    s.on('data', (d) => {
      buf += d.toString();
      const nl = buf.indexOf(String.fromCharCode(10));
      if (nl >= 0) { try { s.end(); } catch (e) {} resolve(JSON.parse(buf.slice(0, nl))); }
    });
    s.on('error', reject);
    setTimeout(() => { try { s.destroy(); } catch (e) {} reject(new Error('tcp timeout')); }, 90000);
  });
}
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const ws = new WebSocket(list[0].webSocketDebuggerUrl);
let cid = 0;
const pend = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
function cdp(method, params) { return new Promise((res) => { const i = ++cid; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); }); }
await new Promise((r) => (ws.onopen = r));
async function shot(name) {
  await new Promise((r) => setTimeout(r, 900));
  const s = await cdp('Page.captureScreenshot', { format: 'png' });
  const b = Buffer.from(s.result.data, 'base64');
  writeFileSync('D:/netmcmod/.cache/step-' + name + '.png', b);
  return b.length;
}
const h = await tcp('health');
console.log('HEALTH ok=' + h.ok + ' api=' + JSON.stringify((h.result && h.result.api_probe) || {}).slice(0, 300));
const p = await tcp('op', { op: 'project.new', args: { format: 'free' } });
console.log('PROJECT ok=' + p.ok + ' ' + JSON.stringify(p.result || p.error).slice(0, 200));
const steps = [
  { n: 'base', f: [-6, 0, -6], t: [6, 2, 6] },
  { n: 'pillar', f: [-2, 2, -2], t: [2, 10, 2] },
  { n: 'cap', f: [-5, 10, -5], t: [5, 11, 5] },
  { n: 'lamp', f: [-1, 12, -1], t: [1, 14, 1] }
];
for (let i = 0; i < steps.length; i++) {
  const s = steps[i];
  const r = await tcp('batch', { ops: [{ op: 'cube.add', args: { from: s.f, to: s.t, name: s.n } }] });
  const bytes = await shot(String(i + 1) + '-' + s.n);
  console.log('STEP ' + (i + 1) + ' ' + s.n + ' ok=' + r.ok + ' png=' + bytes);
}
const st = await tcp('state');
console.log('STATE elements=' + JSON.stringify(st.result && (st.result.elements || []).length));
const see = await tcp('see', { width: 800, height: 600 });
if (see.ok && see.result && see.result.png_b64) {
  const b = Buffer.from(see.result.png_b64, 'base64');
  writeFileSync('D:/netmcmod/.cache/see-channel.png', b);
  console.log('SEE ok bytes=' + b.length + ' meta=' + JSON.stringify({ w: see.result.width, h: see.result.height, strategy: see.result.strategy, variance: see.result.variance }));
} else { console.log('SEE fail=' + JSON.stringify(see.error || see).slice(0, 300)); }
process.exit(0);