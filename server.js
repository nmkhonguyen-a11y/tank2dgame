/* Tank Warfare: Evolution - MÁY CHỦ ONLINE (kiểu Mech Arena 2D)
   - Không cần cài thư viện: tự cài WebSocket (RFC 6455) bằng module có sẵn của Node.
   - Chạy:  node server.js   (mặc định cổng 8080, đổi bằng biến môi trường PORT)
   - Vừa là máy chủ web (phục vụ index.html + online.js) vừa là máy chủ game.
   Mô hình: phòng (mã 4 ký tự) · 2 đội Xanh/Đỏ · sẵn sàng · đếm ngược 5s · tính điểm theo hạ gục · hết giờ/đủ điểm là kết thúc.
   Mỗi client mô phỏng xe của chính mình và gửi trạng thái; máy chủ chuyển tiếp + giữ tỉ số, giờ, thành tích. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const PORT = +process.env.PORT || 8080;
const ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean); // để trống = cho phép tất cả
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const COUNTDOWN_MS = 5000, RESET_MS = 12000, MAX_FRAME = 256 * 1024;
let hub, accounts; // hub (phòng/trận) và accounts (tài khoản) gọi lẫn nhau qua các hàm bên dưới
accounts = require('./accounts.js').create({ hooks: { kick: id => hub.kickAid(id), announce: o => hub.broadcastAll(o), cmd: (id, o) => hub.sendToAid(id, o) } });
hub = require('./hub.js').createHub({ verify: tok => accounts.verify(tok), isMuted: id => accounts.isMuted(id) });
const rooms = hub.rooms, conns = hub.conns;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8' };
const STATIC_FILES = ['index.html', 'online.js', 'hub.js', 'account.js', 'admin.js', 'peerjs.min.js'];

/* ---------------- HTTP ---------------- */
const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u.startsWith('/api/')) return accounts.handle(req, res, req.url);
  if (u === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: conns.size })); }
  const name = u === '/' ? 'index.html' : u.slice(1);
  if (!STATIC_FILES.includes(name)) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(path.join(__dirname, name), (e, d) => {
    if (e) { res.writeHead(404); return res.end('Missing ' + name); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(d);
  });
});

/* ---------------- WebSocket tối giản ---------------- */
const sockets = new Set();

function frame(op, payload) {
  const len = payload.length;
  let h;
  if (len < 126) h = Buffer.from([0x80 | op, len]);
  else if (len < 65536) { h = Buffer.alloc(4); h[0] = 0x80 | op; h[1] = 126; h.writeUInt16BE(len, 2); }
  else { h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([h, payload]);
}
function rawSend(c, op, payload) { if (c.socket.destroyed || !c.socket.writable) return; try { c.socket.write(frame(op, payload)); } catch (e) { } }
function send(c, obj) { rawSend(c, 1, Buffer.from(JSON.stringify(obj))); }
function closeConn(c, code) {
  if (c.closing) return; c.closing = true;
  try { const b = Buffer.alloc(2); b.writeUInt16BE(code || 1000); rawSend(c, 8, b); } catch (e) { }
  setTimeout(() => { try { c.socket.destroy(); } catch (e) { } }, 100);
}

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'], origin = req.headers.origin;
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
  if (ORIGINS.length && origin && !ORIGINS.includes(origin)) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);
  const c = { socket, buf: Buffer.alloc(0), frag: [], alive: true, closing: false };
  c.h = hub.addConn(o => send(c, o)); c.h.close = () => closeConn(c, 1008);
  sockets.add(c);
  socket.on('data', d => {
    c.buf = Buffer.concat([c.buf, d]);
    if (c.buf.length > MAX_FRAME * 2) return closeConn(c, 1009);
    parse(c);
  });
  const gone = () => { if (c.gone) return; c.gone = true; sockets.delete(c); hub.drop(c.h); };
  socket.on('close', gone);
  socket.on('error', gone);
});

function parse(c) {
  for (; ;) {
    const b = c.buf;
    if (b.length < 2) return;
    const fin = !!(b[0] & 0x80), op = b[0] & 15, masked = !!(b[1] & 0x80);
    let len = b[1] & 127, off = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) return; const L = b.readBigUInt64BE(2); if (L > BigInt(MAX_FRAME)) return closeConn(c, 1009); len = Number(L); off = 10; }
    if (len > MAX_FRAME) return closeConn(c, 1009);
    if (!masked) return closeConn(c, 1002);
    if (b.length < off + 4 + len) return;
    const mask = b.subarray(off, off + 4), data = Buffer.from(b.subarray(off + 4, off + 4 + len));
    for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
    c.buf = b.subarray(off + 4 + len);
    if (op === 8) { closeConn(c, 1000); return; }
    if (op === 9) { rawSend(c, 10, data); continue; }
    if (op === 10) { c.alive = true; continue; }
    if (op === 1 || op === 0) {
      if (op === 1) c.frag = [];
      c.frag.push(data);
      if (fin) { const msg = Buffer.concat(c.frag).toString('utf8'); c.frag = []; try { hub.handle(c.h, JSON.parse(msg)); } catch (e) { } }
    }
  }
}

setInterval(() => { // phát hiện kết nối chết
  sockets.forEach(c => { if (!c.alive) { try { c.socket.destroy(); } catch (e) { } return; } c.alive = false; rawSend(c, 9, Buffer.alloc(0)); });
}, 25000);

if (require.main === module) server.listen(PORT, () => console.log('Tank Warfare Online: http://localhost:' + PORT + '  (WebSocket cùng cổng)'));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { accounts.flushNow().finally(() => process.exit(0)); setTimeout(() => process.exit(0), 4000).unref(); });
module.exports = { server, rooms, conns, accounts };
