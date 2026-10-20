import { readFileSync } from 'node:fs';
const WS = process.argv[2];
let expr = process.argv[3];
if (expr && expr.startsWith('@')) expr = readFileSync(expr.slice(1), 'utf8');
const ws = new WebSocket(WS);
let sent = false;
ws.onopen = () => { ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true } })); sent = true; };
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id === 1) {
    const r = m.result || {};
    if (r.exceptionDetails) console.log('EXCEPTION:', JSON.stringify(r.exceptionDetails).slice(0, 900));
    else console.log(JSON.stringify(r.result && r.result.value).slice(0, 3000));
    ws.close(); process.exit(0);
  }
};
ws.onerror = (e) => { console.log('WS_ERROR', e.message || e); process.exit(2); };
setTimeout(() => { console.log('TIMEOUT'); process.exit(3); }, 25000);