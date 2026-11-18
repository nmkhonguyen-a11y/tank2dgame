/* Tank Warfare: Evolution - HỆ THỐNG TÀI KHOẢN (phía máy chủ)
   - Đăng ký / đăng nhập (mật khẩu băm scrypt), mỗi tài khoản có ID số riêng (bắt đầu từ 100001).
   - Lưu tiến trình game lên máy chủ (cloud save), mỗi tài khoản chỉ đăng nhập ở 1 nơi cùng lúc.
   - Tặng quà (gems / xe tăng) giữa các tài khoản bằng ID, hộp thư nhận quà. Quản trị viên tặng không bị trừ.
   - Lưu trữ: mặc định file data/db.json. Nếu đặt UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN thì lưu lên Upstash Redis
     (miễn phí, KHÔNG mất dữ liệu khi Render tự ngủ/khởi động lại).
   Biến môi trường: DATA_DIR, ADMIN_USERS="ten1,ten2", ADMIN_IDS="100001", ALLOWED_ORIGINS, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN */
'use strict';
const crypto = require('crypto'), fs = require('fs'), path = require('path'), http = require('http'), https = require('https');

/* ---------------- Kho lưu trữ ---------------- */
function fileStore(dir) {
  const file = path.join(dir, 'db.json');
  return {
    kind: 'file', persistent: null,
    async load() {
      if (!fs.existsSync(file)) return null;
      return JSON.parse(fs.readFileSync(file, 'utf8')); // lỗi đọc => ném ra, KHÔNG ghi đè dữ liệu cũ
    },
    async flush(db) { fs.mkdirSync(dir, { recursive: true }); const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, file); }
  };
}
function upstashStore(url, token) {
  const u = new URL(url), lib = u.protocol === 'http:' ? http : https;
  const cmd = args => new Promise((resolve, reject) => {
    const body = JSON.stringify(args);
    const req = lib.request({ hostname: u.hostname, port: u.port || undefined, path: u.pathname || '/', method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, r => {
      let d = ''; r.on('data', c => { d += c; });
      r.on('end', () => { try { const j = JSON.parse(d); if (j.error) reject(new Error(j.error)); else resolve(j.result); } catch (e) { reject(new Error('Upstash trả về dữ liệu lạ (HTTP ' + r.statusCode + ')')); } });
    });
    req.on('error', reject); req.setTimeout(10000, () => req.destroy(new Error('Upstash quá thời gian chờ')));
    req.end(body);
  });
  return {
    kind: 'upstash', persistent: true,
    async load() {
      const idx = await cmd(['GET', 'twe:index']);
      if (!idx) return null;
      const index = JSON.parse(idx), ids = Object.values(index.users || {});
      const accounts = {};
      for (let i = 0; i < ids.length; i += 100) {
        const part = ids.slice(i, i + 100), vals = await cmd(['MGET', ...part.map(id => 'twe:acc:' + id)]);
        part.forEach((id, k) => { if (vals[k]) accounts[id] = JSON.parse(vals[k]); });
      }
      return { next: index.next, users: index.users, accounts };
    },
    async flush(db, dirty) {
      await cmd(['SET', 'twe:index', JSON.stringify({ next: db.next, users: db.users })]);
      for (const id of dirty.acc) if (db.accounts[id]) await cmd(['SET', 'twe:acc:' + id, JSON.stringify(db.accounts[id])]);
    }
  };
}

/* ---------------- Tiện ích ---------------- */
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 32, (e, k) => e ? rej(e) : res(k)));
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const KEYRE = /^[A-Za-z0-9_\-]{1,40}$/, USERRE = /^[A-Za-z0-9_.\-]{3,16}$/;

function sanitizeSave(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
  let str; try { str = JSON.stringify(s); } catch (e) { return null; }
  if (!str || str.length > 500000) return null;
  const o = JSON.parse(str);
  o.gems = Number.isFinite(o.gems) && o.gems > 0 ? Math.min(Math.floor(o.gems), 1e12) : 0;
  let own = Array.isArray(o.owned) ? o.owned.filter(k => typeof k === 'string' && KEYRE.test(k)).slice(0, 2000) : [];
  if (!own.includes('basic')) own.unshift('basic');
  o.owned = [...new Set(own)];
  if (typeof o.type !== 'string') o.type = 'basic';
  return o;
}

function create(opt) {
  opt = opt || {};
  const dir = opt.dataDir || process.env.DATA_DIR || path.join(__dirname, 'data');
  const store = opt.store || ((process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
    ? upstashStore(process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN) : fileStore(dir));
  const ADMIN_USERS = (process.env.ADMIN_USERS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  const ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const isAdmin = a => ADMIN_IDS.includes(a.id) || ADMIN_USERS.includes(a.username.toLowerCase());

  let db = { next: 100001, users: {}, accounts: {} }, ready = false, loadErr = '';
  const dirty = { acc: new Set(), index: false }; let timer = null, flushing = false;

  async function init() {
    try { const j = await store.load(); if (j && j.accounts) db = j; ready = true; loadErr = ''; }
    catch (e) { ready = false; loadErr = e.message; console.error('[tài khoản] Chưa đọc được dữ liệu:', e.message, '- thử lại sau 10 giây'); setTimeout(init, 10000); }
  }
  const initP = init();
  function mark(id) { if (id) dirty.acc.add(id); dirty.index = true; if (!timer) timer = setTimeout(() => { timer = null; flushNow(); }, 3000); }
  async function flushNow() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (flushing || !ready || (!dirty.acc.size && !dirty.index)) return;
    flushing = true; const snap = { acc: new Set(dirty.acc), index: dirty.index }; dirty.acc.clear(); dirty.index = false;
    try { await store.flush(db, snap); }
    catch (e) { console.error('[tài khoản] Lưu thất bại:', e.message); snap.acc.forEach(id => dirty.acc.add(id)); dirty.index = true; if (!timer) timer = setTimeout(() => { timer = null; flushNow(); }, 8000); }
    finally { flushing = false; }
  }

  /* ---- giới hạn thử mật khẩu ---- */
  const tries = new Map();
  function limited(key, max, ms) { const n = Date.now(), r = tries.get(key) || { c: 0, t: n }; if (n - r.t > ms) { r.c = 0; r.t = n; } tries.set(key, r); return r.c >= max; }
  function hit(key) { const r = tries.get(key); if (r) r.c++; }
  setInterval(() => { const n = Date.now(); tries.forEach((r, k) => { if (n - r.t > 900000) tries.delete(k); }); }, 300000).unref();

  const me = (a, withSave) => { const o = { id: a.id, username: a.username, rev: a.rev, admin: isAdmin(a), inbox: a.inbox || [] }; if (withSave) o.save = a.save; return o; };
  const newToken = a => { const sec = crypto.randomBytes(24).toString('hex'); a.tok = sha(sec); return a.id + '.' + sec; };
  function authOf(req) {
    const h = String(req.headers.authorization || ''), m = /^Bearer (\d+)\.([0-9a-f]+)$/.exec(h);
    if (!m) return null; const a = db.accounts[m[1]]; if (!a || !a.tok || !safeEq(a.tok, sha(m[2]))) return null; return a;
  }

  /* ---- HTTP ---- */
  function cors(req, res) {
    const o = req.headers.origin;
    res.setHeader('Access-Control-Allow-Origin', ORIGINS.length ? (ORIGINS.includes(o) ? o : ORIGINS[0]) : '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.setHeader('Access-Control-Max-Age', '600');
  }
  const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  const fail = (res, code, msg, extra) => send(res, code, Object.assign({ ok: false, error: msg }, extra || {}));
  function body(req) {
    return new Promise((resolve, reject) => {
      let n = 0; const chunks = [];
      req.on('data', c => { n += c.length; if (n > 600000) { reject(new Error('big')); req.destroy(); } else chunks.push(c); });
      req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(new Error('json')); } });
      req.on('error', reject);
    });
  }
  const ipOf = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

  async function handle(req, res, url) {
    cors(req, res);
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const route = url.split('?')[0], lite = /[?&]lite=1/.test(url);
    if (route === '/api/status') return send(res, 200, { ok: true, ready, accounts: Object.keys(db.accounts).length, storage: store.kind, persistent: store.persistent, error: loadErr || undefined });
    if (!ready) return fail(res, 503, 'Kho dữ liệu tài khoản chưa sẵn sàng, thử lại sau ít giây');
    let b = {};
    if (req.method === 'POST') { try { b = await body(req); } catch (e) { return fail(res, 400, e.message === 'big' ? 'Dữ liệu quá lớn' : 'Dữ liệu không hợp lệ'); } }
    try {
      switch (route) {
        case '/api/register': {
          if (req.method !== 'POST') break;
          const ip = ipOf(req); if (limited('r' + ip, 10, 3600000)) return fail(res, 429, 'Đăng ký quá nhiều lần, thử lại sau');
          const name = String(b.username || '').trim(), pw = String(b.password || '');
          if (!USERRE.test(name)) return fail(res, 400, 'Tên đăng nhập 3-16 ký tự: chữ không dấu, số, _ . -');
          if (pw.length < 6 || pw.length > 64) return fail(res, 400, 'Mật khẩu 6-64 ký tự');
          if (db.users[name.toLowerCase()]) return fail(res, 409, 'Tên đăng nhập đã có người dùng');
          if (Object.keys(db.accounts).length >= 20000) return fail(res, 503, 'Máy chủ đã đủ số tài khoản');
          hit('r' + ip);
          const salt = crypto.randomBytes(16).toString('hex'), id = String(db.next++);
          const a = { id, username: name, salt, hash: (await scrypt(pw, salt)).toString('hex'), created: Date.now(), rev: 1, inbox: [], save: sanitizeSave({ type: 'basic', gems: 0, owned: ['basic'], level: 1, exp: 0 }) };
          db.users[name.toLowerCase()] = id; db.accounts[id] = a;
          const token = newToken(a); mark(id);
          return send(res, 200, { ok: true, token, me: me(a, true) });
        }
        case '/api/login': {
          if (req.method !== 'POST') break;
          const ip = ipOf(req), key = String(b.username || '').trim().toLowerCase(), pw = String(b.password || '');
          if (limited('l' + ip, 30, 600000) || limited('u' + key, 8, 600000)) return fail(res, 429, 'Thử sai quá nhiều lần, hãy đợi 10 phút');
          const id = /^\d+$/.test(key) ? key : db.users[key], a = id && db.accounts[id];
          let okPw = false;
          if (a) okPw = safeEq((await scrypt(pw, a.salt)).toString('hex'), a.hash);
          if (!okPw) { hit('l' + ip); hit('u' + key); return fail(res, 401, 'Sai tên đăng nhập/ID hoặc mật khẩu'); }
          const token = newToken(a); mark(a.id); // đăng nhập mới => phiên cũ bị đăng xuất
          return send(res, 200, { ok: true, token, me: me(a, true) });
        }
        case '/api/lookup': {
          if (req.method !== 'POST') break;
          const a = authOf(req); if (!a) return fail(res, 401, 'Chưa đăng nhập hoặc phiên đã hết');
          const t = db.accounts[String(b.id || '').trim()];
          return t ? send(res, 200, { ok: true, id: t.id, username: t.username }) : fail(res, 404, 'Không tìm thấy ID này');
        }
      }
      const acc = authOf(req);
      if (!acc) return fail(res, 401, 'Chưa đăng nhập hoặc phiên đã hết');
      switch (route) {
        case '/api/me': return send(res, 200, { ok: true, me: me(acc, !lite) });
        case '/api/logout': acc.tok = ''; mark(acc.id); return send(res, 200, { ok: true });
        case '/api/password': {
          const old = String(b.old || ''), nw = String(b.new || '');
          if (limited('p' + acc.id, 6, 600000)) return fail(res, 429, 'Thử quá nhiều lần');
          if (!safeEq((await scrypt(old, acc.salt)).toString('hex'), acc.hash)) { hit('p' + acc.id); return fail(res, 401, 'Mật khẩu cũ không đúng'); }
          if (nw.length < 6 || nw.length > 64) return fail(res, 400, 'Mật khẩu mới 6-64 ký tự');
          acc.salt = crypto.randomBytes(16).toString('hex'); acc.hash = (await scrypt(nw, acc.salt)).toString('hex'); mark(acc.id);
          return send(res, 200, { ok: true });
        }
        case '/api/save': { // tự động lưu tiến trình
          if (Number(b.rev) !== acc.rev) return fail(res, 409, 'Dữ liệu đã thay đổi ở nơi khác', { rev: acc.rev });
          const s = sanitizeSave(b.save); if (!s) return fail(res, 400, 'Dữ liệu lưu không hợp lệ');
          acc.save = s; acc.rev++; mark(acc.id);
          return send(res, 200, { ok: true, rev: acc.rev });
        }
        case '/api/gift': {
          if (Number(b.rev) !== acc.rev) return fail(res, 409, 'Dữ liệu đã thay đổi ở nơi khác, hãy tải lại trang', { rev: acc.rev });
          const to = db.accounts[String(b.to || '').trim()];
          if (!to) return fail(res, 404, 'Không tìm thấy ID người nhận');
          if (to.id === acc.id) return fail(res, 400, 'Không thể tự tặng cho chính mình');
          const s = sanitizeSave(b.save); if (!s) return fail(res, 400, 'Dữ liệu lưu không hợp lệ');
          const admin = isAdmin(acc), item = { kind: b.kind === 'tank' ? 'tank' : 'gems' };
          if (item.kind === 'gems') {
            const amt = Math.floor(Number(b.amount));
            if (!(amt >= 1 && amt <= 1e9)) return fail(res, 400, 'Số gems không hợp lệ');
            if (!admin && s.gems < amt) return fail(res, 400, 'Bạn không đủ gems');
            item.amount = amt; if (!admin) s.gems -= amt;
          } else {
            const k = String(b.tank || '');
            if (!KEYRE.test(k) || k === 'basic' || k === 'custom') return fail(res, 400, 'Xe này không thể tặng');
            if (!admin && !s.owned.includes(k)) return fail(res, 400, 'Bạn không sở hữu xe này');
            if ((to.save.owned || []).includes(k)) return fail(res, 400, 'Người nhận đã có xe này');
            if ((to.inbox || []).some(g => g.kind === 'tank' && g.tank === k)) return fail(res, 400, 'Người nhận đang có quà xe này chưa nhận');
            item.tank = k; if (!admin) { s.owned = s.owned.filter(x => x !== k); if (s.type === k) s.type = 'basic'; }
          }
          if ((to.inbox || []).length >= 100) return fail(res, 400, 'Hộp thư của người nhận đã đầy');
          acc.save = s; acc.rev++;
          to.inbox = to.inbox || []; to.inbox.push(Object.assign({ gid: crypto.randomBytes(5).toString('hex'), from: acc.id, fromName: acc.username, t: Date.now(), note: String(b.note || '').slice(0, 60) }, item));
          mark(acc.id); mark(to.id);
          return send(res, 200, { ok: true, rev: acc.rev, gems: s.gems, owned: s.owned, type: s.type, to: { id: to.id, username: to.username } });
        }
        case '/api/claim': { // nhận hết quà trong hộp thư
          if (Number(b.rev) !== acc.rev) return fail(res, 409, 'Dữ liệu đã thay đổi ở nơi khác, hãy tải lại trang', { rev: acc.rev });
          const s = sanitizeSave(b.save); if (!s) return fail(res, 400, 'Dữ liệu lưu không hợp lệ');
          const got = [];
          (acc.inbox || []).forEach(g => {
            if (g.kind === 'gems') { s.gems += g.amount; got.push(g); }
            else if (g.kind === 'tank' && !s.owned.includes(g.tank)) { s.owned.push(g.tank); got.push(g); }
          });
          acc.inbox = []; acc.save = s; acc.rev++; mark(acc.id);
          return send(res, 200, { ok: true, rev: acc.rev, gems: s.gems, owned: s.owned, claimed: got });
        }
      }
      return fail(res, 404, 'Không có chức năng này');
    } catch (e) { console.error('[tài khoản] lỗi', route, e); return fail(res, 500, 'Lỗi máy chủ'); }
  }

  return { handle, flushNow, ready: () => initP, status: () => ({ ready, accounts: Object.keys(db.accounts).length, storage: store.kind }), _db: () => db };
}

module.exports = { create, sanitizeSave };
