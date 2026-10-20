import socket, json, sys, time

def call(method, params=None, port=9878, timeout=20):
    msg = json.dumps({'id': 1, 'method': method, 'params': params or {}}) + chr(10)
    s = socket.create_connection(('127.0.0.1', port), timeout=timeout)
    s.sendall(msg.encode('utf-8'))
    buf = b''
    while chr(10).encode() not in buf:
        chunk = s.recv(65536)
        if not chunk:
            break
        buf += chunk
    s.close()
    line = buf.split(chr(10).encode())[0]
    return json.loads(line.decode('utf-8'))

if __name__ == '__main__':
    method = sys.argv[1] if len(sys.argv) > 1 else 'health'
    params = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
    try:
        r = call(method, params)
        print(json.dumps(r, ensure_ascii=False)[:2000])
        if method == 'see' and r.get('ok'):
            import base64
            b64 = r.get('result', {}).get('png_b64')
            if b64:
                raw = base64.b64decode(b64)
                p = 'D:/netmcmod/.cache/bb-live-shot.png'
                open(p, 'wb').write(raw)
                print('PNG saved:', p, len(raw), 'bytes')
    except Exception as e:
        print('CONNECT_FAIL:', type(e).__name__, e)
        sys.exit(2)