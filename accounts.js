/* Tank Warfare: Evolution - HỆ THỐNG TÀI KHOẢN (phía máy chủ)
   - Đăng ký / đăng nhập (mật khẩu băm scrypt, KHÔNG lưu/hiển thị mật khẩu gốc), ID số NGẪU NHIÊN.
   - 3 tài khoản đăng ký đầu tiên là ADMIN và nhận ID đẹp (888888, 666666, 999999).
   - Lưu tiến trình lên máy chủ, mỗi tài khoản chỉ đăng nhập 1 nơi. Tặng quà, hộp thư, TRAO ĐỔI có ký quỹ, MÃ QUÀ (code).
   - Cửa hàng do admin quản lý (đăng/xóa xe tăng, đặt giá + tier). Bảng quản trị: tra cứu/chỉnh sửa tài khoản, đặt lại mật khẩu,
     khóa (ban)/cấm chat (mute), sao lưu/khôi phục, xuất danh sách .docx. Các lệnh admin cần nhập lại mật khẩu của chính admin.
   - Lưu trữ: file data/db.json hoặc Upstash Redis (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN) để không mất dữ liệu trên Render Free.
   Biến môi trường: DATA_DIR, ADMIN_USERS, ADMIN_IDS (admin thêm), ALLOWED_ORIGINS, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN */
'use strict';
const crypto = require('crypto'), fs = require('fs'), path = require('path'), http = require('http'), https = require('https');

const PRETTY_ADMIN_IDS = ['888888', '666666', '999999'];
const TIERS = ['C', 'B', 'A', 'S', 'SS', 'SSS', 'SSSS', 'SSSSS', 'ULTRA', 'HYPER', 'MYTHIC'];
const KEYRE = /^[A-Za-z0-9_\-]{1,40}$/, USERRE = /^[A-Za-z0-9_.\-]{3,16}$/;

/* ---------------- Kho lưu trữ ---------------- */
function fileStore(dir) {
  const file = path.join(dir, 'db.json'), bk = path.join(dir, 'backups');
  return {
    kind: 'file', persistent: null,
    async load() { if (!fs.existsSync(file)) return null; return JSON.parse(fs.readFileSync(file, 'utf8')); }, // lỗi đọc => ném ra, KHÔNG ghi đè
    async flush(db) { fs.mkdirSync(dir, { recursive: true }); const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, file); },
    async saveBackup(name, db) { fs.mkdirSync(bk, { recursive: true }); fs.writeFileSync(path.join(bk, name + '.json'), JSON.stringify(db)); },
    async listBackups() { if (!fs.existsSync(bk)) return []; return fs.readdirSync(bk).filter(f => f.endsWith('.json')).map(f => ({ name: f.slice(0, -5), t: fs.statSync(path.join(bk, f)).mtimeMs })).sort((a, b) => b.t - a.t).slice(0, 30); },
    async loadBackup(name) { const f = path.join(bk, name + '.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; }
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
      const index = JSON.parse(idx), ids = Object.values(index.users || {}), accounts = {};
      for (let i = 0; i < ids.length; i += 100) {
        const part = ids.slice(i, i + 100), vals = await cmd(['MGET', ...part.map(id => 'twe:acc:' + id)]);
        part.forEach((id, k) => { if (vals[k]) accounts[id] = JSON.parse(vals[k]); });
      }
      return { users: index.users, meta: index.meta, accounts };
    },
    async flush(db, dirty) {
      await cmd(['SET', 'twe:index', JSON.stringify({ users: db.users, meta: db.meta })]);
      for (const id of dirty.acc) if (db.accounts[id]) await cmd(['SET', 'twe:acc:' + id, JSON.stringify(db.accounts[id])]);
    },
    async saveBackup(name, db) {
      await cmd(['SET', 'twe:bk:' + name, JSON.stringify(db)]);
      const l = JSON.parse((await cmd(['GET', 'twe:bklist'])) || '[]'); l.unshift({ name, t: Date.now() });
      await cmd(['SET', 'twe:bklist', JSON.stringify(l.slice(0, 15))]);
    },
    async listBackups() { return JSON.parse((await cmd(['GET', 'twe:bklist'])) || '[]'); },
    async loadBackup(name) { const v = await cmd(['GET', 'twe:bk:' + name]); return v ? JSON.parse(v) : null; }
  };
}

/* ---------------- Tiện ích ---------------- */
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 32, (e, k) => e ? rej(e) : res(k)));
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const isPrettyId = s => /^(\d)\1+$/.test(s) || /(\d)\1{4,}/.test(s) || '0123456789'.includes(s) || '9876543210'.includes(s);

function sanitizeSave(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
  let str; try { str = JSON.stringify(s); } catch (e) { return null; }
  if (!str || str.length > 500000) return null;
  const o = JSON.parse(str);
  o.gems = Number.isFinite(o.gems) && o.gems > 0 ? Math.min(Math.floor(o.gems), 1e12) : 0;
  const own = Array.isArray(o.owned) ? o.owned.filter(k => typeof k === 'string' && KEYRE.test(k)).slice(0, 2000) : [];
  if (!own.includes('basic')) own.unshift('basic');
  o.owned = [...new Set(own)];
  o.dguns = [...new Set((Array.isArray(o.dguns) ? o.dguns : []).filter(k => typeof k === 'string' && KEYRE.test(k)).slice(0, 100))]; // súng drone đã mua
  if (typeof o.type !== 'string') o.type = 'basic';
  o.pendExp = Number.isFinite(o.pendExp) && o.pendExp > 0 ? Math.min(Math.floor(o.pendExp), 1e15) : 0; // EXP chờ cộng khi vào game
  return o;
}
/* gói vật phẩm dùng cho trao đổi / quà: {gems, tanks[], guns[]} */
function cleanItems(x) {
  x = x || {};
  const g = Math.floor(Number(x.gems) || 0);
  const list = a => [...new Set((Array.isArray(a) ? a : []).map(String).filter(k => KEYRE.test(k) && k !== 'basic' && k !== 'custom' && k !== 'n'))].slice(0, 5);
  return { gems: g >= 0 && g <= 1e9 ? g : 0, tanks: list(x.tanks), guns: list(x.guns) };
}
const itemsEmpty = it => !it.gems && !it.tanks.length && !it.guns.length;
const itemsText = it => [it.gems ? it.gems + ' gems' : '', ...it.tanks, ...it.guns].filter(Boolean).join(', ');

/* ---- ZIP + DOCX tối giản (không cần thư viện) ---- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = buf => { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zip(files) { // files: [{name, data(Buffer)}] - phương pháp "stored" (không nén)
  const parts = [], cen = []; let off = 0;
  files.forEach(f => {
    const nm = Buffer.from(f.name), crc = crc32(f.data), h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(0, 8); h.writeUInt16LE(0, 10); h.writeUInt16LE(0x21, 12);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(f.data.length, 18); h.writeUInt32LE(f.data.length, 22); h.writeUInt16LE(nm.length, 26); h.writeUInt16LE(0, 28);
    parts.push(h, nm, f.data);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(0, 10); c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(f.data.length, 20); c.writeUInt32LE(f.data.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(off, 42);
    cen.push(c, nm); off += 30 + nm.length + f.data.length;
  });
  const cd = Buffer.concat(cen), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, e]);
}
const xmlEsc = s => String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
function makeDocx(title, subtitle, header, rows) {
  const run = (t, b, sz) => '<w:r><w:rPr>' + (b ? '<w:b/>' : '') + (sz ? '<w:sz w:val="' + sz + '"/>' : '') + '</w:rPr><w:t xml:space="preserve">' + xmlEsc(t) + '</w:t></w:r>';
  const cell = (t, b, w) => '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>' + (b ? '<w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/>' : '') + '</w:tcPr><w:p>' + run(t, b, 18) + '</w:p></w:tc>';
  const w = Math.floor(9000 / header.length);
  const tr = (cells, b) => '<w:tr>' + cells.map(c => cell(c, b, w)).join('') + '</w:tr>';
  const tbl = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(x => '<w:' + x + ' w:val="single" w:sz="4" w:space="0" w:color="999999"/>').join('') + '</w:tblBorders></w:tblPr><w:tblGrid>' + header.map(() => '<w:gridCol w:w="' + w + '"/>').join('') + '</w:tblGrid>' + tr(header, true) + rows.map(r => tr(r, false)).join('') + '</w:tbl>';
  const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    '<w:p>' + run(title, true, 36) + '</w:p><w:p>' + run(subtitle, false, 20) + '</w:p>' + tbl + '<w:sectPr><w:pgSz w:w="12240" w:h="15840" w:orient="portrait"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000"/></w:sectPr></w:body></w:document>';
  return zip([
    { name: '[Content_Types].xml', data: Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>') },
    { name: '_rels/.rels', data: Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>') },
    { name: 'word/document.xml', data: Buffer.from(doc) }
  ]);
}

function create(opt) {
  opt = opt || {};
  const dir = opt.dataDir || process.env.DATA_DIR || path.join(__dirname, 'data');
  const store = opt.store || ((process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
    ? upstashStore(process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN) : fileStore(dir));
  const ENV_ADMIN_USERS = (process.env.ADMIN_USERS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const ENV_ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  const ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const isAdmin = a => !!a && (a.adm === true || ENV_ADMIN_IDS.includes(a.id) || ENV_ADMIN_USERS.includes(a.username.toLowerCase()));
  const hooks = opt.hooks || {}; // kick(aid), announce(msg), cmd(aid, obj) do server.js gắn vào hub

  const emptyMeta = () => ({ codes: {}, shop: {}, trades: {}, bans: { ips: {} }, adminN: 0 });
  let db = { users: {}, accounts: {}, meta: emptyMeta() }, ready = false, loadErr = '';
  const fixMeta = () => { const m = Object.assign(emptyMeta(), db.meta || {}); m.bans = Object.assign({ ips: {} }, m.bans || {}); db.meta = m; };
  const dirty = { acc: new Set(), index: false }; let timer = null, flushing = false;

  async function init() {
    try { const j = await store.load(); if (j && j.accounts) db = j; fixMeta(); ready = true; loadErr = ''; }
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
  setInterval(() => { const n = Date.now(); tries.forEach((r, k) => { if (n - r.t > 900000) tries.delete(k); }); sweepTrades(); }, 300000).unref();

  const banned = a => a.ban && (!a.ban.until || a.ban.until > Date.now());
  const muted = a => !!a && a.mute && a.mute > Date.now();
  const pub = a => ({ id: a.id, username: a.username });
  const me = (a, withSave) => {
    const o = { id: a.id, username: a.username, rev: a.rev, admin: isAdmin(a), inbox: a.inbox || [], tradesIn: Object.values(db.meta.trades).filter(t => t.st === 'pending' && t.to === a.id).length, muted: muted(a) };
    if (withSave) o.save = a.save; return o;
  };
  const newToken = a => { const sec = crypto.randomBytes(24).toString('hex'); a.tok = sha(sec); return a.id + '.' + sec; };
  function authOf(req) {
    const h = String(req.headers.authorization || ''), m = /^Bearer (\d+)\.([0-9a-f]+)$/.exec(h);
    if (!m) return null; const a = db.accounts[m[1]]; if (!a || !a.tok || !safeEq(a.tok, sha(m[2])) || banned(a)) return null; return a;
  }
  const adminOk = (req, a) => { const t = String(req.headers['x-admin'] || ''); return isAdmin(a) && a.admTok && a.admExp > Date.now() && t && safeEq(a.admTok, sha(t)); };
  function randId() { for (; ;) { const s = String(crypto.randomInt(10000000, 100000000)); if (!db.accounts[s] && !PRETTY_ADMIN_IDS.includes(s) && !isPrettyId(s)) return s; } }
  const newGid = () => crypto.randomBytes(5).toString('hex');

  /* ---- Quà & vật phẩm ---- */
  function addItems(save, it) { // cộng gói vật phẩm vào save; trả về phần thực sự nhận
    const got = { gems: it.gems || 0, tanks: [], guns: [] };
    save.gems += got.gems;
    (it.tanks || []).forEach(k => { if (!save.owned.includes(k)) { save.owned.push(k); got.tanks.push(k); } });
    (it.guns || []).forEach(k => { if (!save.dguns.includes(k)) { save.dguns.push(k); got.guns.push(k); } });
    return got;
  }
  function hasItems(save, it) { return save.gems >= (it.gems || 0) && (it.tanks || []).every(k => save.owned.includes(k)) && (it.guns || []).every(k => save.dguns.includes(k)); }
  function takeItems(save, it) { save.gems -= it.gems || 0; save.owned = save.owned.filter(k => !(it.tanks || []).includes(k)); save.dguns = save.dguns.filter(k => !(it.guns || []).includes(k)); if ((it.tanks || []).includes(save.type)) save.type = 'basic'; }
  function pushInbox(to, entry) { to.inbox = to.inbox || []; if (to.inbox.length >= 100) to.inbox.shift(); to.inbox.push(Object.assign({ gid: newGid(), t: Date.now() }, entry)); }
  function sweepTrades() {
    const now = Date.now(); let ch = false;
    Object.values(db.meta.trades).forEach(t => {
      if (t.st === 'pending' && t.exp < now) { refundTrade(t, 'expired'); ch = true; }
      if (t.st !== 'pending' && now - t.t > 7 * 86400000) { delete db.meta.trades[t.id]; ch = true; }
    });
    if (ch) mark();
  }
  function refundTrade(t, st) { // trả vật phẩm ký quỹ cho người đề nghị qua hộp thư
    const f = db.accounts[t.from]; t.st = st;
    if (f) { pushInbox(f, { kind: 'bundle', items: t.offer, from: t.to, fromName: t.toName, note: 'Hoàn trả giao dịch ' + (st === 'expired' ? '(hết hạn)' : '(bị hủy)') }); mark(f.id); }
    mark();
  }

  /* ---- HTTP ---- */
  function cors(req, res) {
    const o = req.headers.origin;
    res.setHeader('Access-Control-Allow-Origin', ORIGINS.length ? (ORIGINS.includes(o) ? o : ORIGINS[0]) : '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Admin');
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
  const ipBanned = ip => { const u = db.meta.bans.ips[ip]; if (u === undefined) return false; if (u && u < Date.now()) { delete db.meta.bans.ips[ip]; return false; } return true; };
  const shopList = () => Object.values(db.meta.shop).sort((a, b) => a.t - b.t);

  async function handle(req, res, url) {
    cors(req, res);
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const route = url.split('?')[0], query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '', lite = /(^|&)lite=1/.test(query);
    if (route === '/api/status') return send(res, 200, { ok: true, ready, accounts: Object.keys(db.accounts).length, storage: store.kind, persistent: store.persistent, error: loadErr || undefined });
    if (!ready) return fail(res, 503, 'Kho dữ liệu tài khoản chưa sẵn sàng, thử lại sau ít giây');
    if (route === '/api/shop' && req.method === 'GET') return send(res, 200, { ok: true, shop: shopList() }); // công khai: ai cũng xem được cửa hàng
    let b = {};
    if (req.method === 'POST') { try { b = await body(req); } catch (e) { return fail(res, 400, e.message === 'big' ? 'Dữ liệu quá lớn' : 'Dữ liệu không hợp lệ'); } }
    try {
      switch (route) {
        case '/api/register': {
          if (req.method !== 'POST') break;
          const ip = ipOf(req); if (limited('r' + ip, 10, 3600000)) return fail(res, 429, 'Đăng ký quá nhiều lần, thử lại sau');
          if (ipBanned(ip)) return fail(res, 403, 'Địa chỉ mạng của bạn đã bị khóa');
          const name = String(b.username || '').trim(), pw = String(b.password || '');
          if (!USERRE.test(name)) return fail(res, 400, 'Tên đăng nhập 3-16 ký tự: chữ không dấu, số, _ . -');
          if (pw.length < 6 || pw.length > 64) return fail(res, 400, 'Mật khẩu 6-64 ký tự');
          if (db.users[name.toLowerCase()]) return fail(res, 409, 'Tên đăng nhập đã có người dùng');
          if (Object.keys(db.accounts).length >= 20000) return fail(res, 503, 'Máy chủ đã đủ số tài khoản');
          hit('r' + ip);
          const admin = db.meta.adminN < PRETTY_ADMIN_IDS.length, id = admin ? PRETTY_ADMIN_IDS[db.meta.adminN] : randId();
          if (db.accounts[id]) return fail(res, 500, 'Trùng ID, thử lại');
          if (admin) db.meta.adminN++;
          const salt = crypto.randomBytes(16).toString('hex');
          const a = { id, username: name, salt, hash: (await scrypt(pw, salt)).toString('hex'), created: Date.now(), rev: 1, inbox: [], adm: admin || undefined, ip, seen: Date.now(), save: sanitizeSave({ type: 'basic', gems: 0, owned: ['basic'], level: 1, exp: 0 }) };
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
          if (banned(a)) return fail(res, 403, 'Tài khoản đã bị khóa' + (a.ban.reason ? ': ' + a.ban.reason : '') + (a.ban.until ? ' (đến ' + new Date(a.ban.until).toLocaleString() + ')' : ' vĩnh viễn'));
          if (ipBanned(ip) && !isAdmin(a)) return fail(res, 403, 'Địa chỉ mạng của bạn đã bị khóa');
          a.ip = ip; a.seen = Date.now();
          const token = newToken(a); mark(a.id); // đăng nhập mới => phiên cũ bị đăng xuất
          return send(res, 200, { ok: true, token, me: me(a, true) });
        }
      }
      const acc = authOf(req);
      if (!acc) return fail(res, 401, 'Chưa đăng nhập hoặc phiên đã hết');
      acc.seen = Date.now();
      const admin = isAdmin(acc);
      switch (route) {
        case '/api/me': return send(res, 200, { ok: true, me: me(acc, !lite) });
        case '/api/logout': acc.tok = ''; acc.admTok = ''; mark(acc.id); return send(res, 200, { ok: true });
        case '/api/lookup': { // tra cứu công khai: tên + kho xe/súng (phục vụ trao đổi, tặng quà)
          const t = db.accounts[String(b.id || '').trim()];
          if (!t) return fail(res, 404, 'Không tìm thấy ID này');
          return send(res, 200, { ok: true, id: t.id, username: t.username, admin: isAdmin(t), tanks: (t.save.owned || []).filter(k => k !== 'basic' && k !== 'custom'), guns: t.save.dguns || [] });
        }
        case '/api/password': {
          const old = String(b.old || ''), nw = String(b.new || '');
          if (limited('p' + acc.id, 6, 600000)) return fail(res, 429, 'Thử quá nhiều lần');
          if (!safeEq((await scrypt(old, acc.salt)).toString('hex'), acc.hash)) { hit('p' + acc.id); return fail(res, 401, 'Mật khẩu cũ không đúng'); }
          if (nw.length < 6 || nw.length > 64) return fail(res, 400, 'Mật khẩu mới 6-64 ký tự');
          acc.salt = crypto.randomBytes(16).toString('hex'); acc.hash = (await scrypt(nw, acc.salt)).toString('hex'); mark(acc.id);
          return send(res, 200, { ok: true });
        }
        case '/api/save': {
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
          const item = { kind: b.kind === 'tank' ? 'tank' : 'gems' };
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
          pushInbox(to, Object.assign({ from: acc.id, fromName: acc.username, note: String(b.note || '').slice(0, 60) }, item));
          mark(acc.id); mark(to.id);
          return send(res, 200, { ok: true, rev: acc.rev, gems: s.gems, owned: s.owned, dguns: s.dguns, type: s.type, to: pub(to) });
        }
        case '/api/claim': { // nhận hết quà trong hộp thư
          if (Number(b.rev) !== acc.rev) return fail(res, 409, 'Dữ liệu đã thay đổi ở nơi khác, hãy tải lại trang', { rev: acc.rev });
          const s = sanitizeSave(b.save); if (!s) return fail(res, 400, 'Dữ liệu lưu không hợp lệ');
          const got = [];
          (acc.inbox || []).forEach(g => {
            if (g.kind === 'gems') { s.gems += g.amount; got.push(g); }
            else if (g.kind === 'tank') { if (!s.owned.includes(g.tank)) { s.owned.push(g.tank); got.push(g); } }
            else if (g.kind === 'bundle') { addItems(s, cleanItems(g.items)); got.push(g); }
          });
          acc.inbox = []; acc.save = s; acc.rev++; mark(acc.id);
          return send(res, 200, { ok: true, rev: acc.rev, gems: s.gems, owned: s.owned, dguns: s.dguns, claimed: got });
        }
        /* ---------- Mã quà ---------- */
        case '/api/redeem': {
          if (Number(b.rev) !== acc.rev) return fail(res, 409, 'Dữ liệu đã thay đổi ở nơi khác, hãy tải lại trang', { rev: acc.rev });
          if (limited('c' + acc.id, 10, 600000)) return fail(res, 429, 'Nhập sai quá nhiều lần, thử lại sau');
          const code = String(b.code || '').trim().toUpperCase(), c = db.meta.codes[code];
          if (!c) { hit('c' + acc.id); return fail(res, 404, 'Mã không hợp lệ'); }
          if (c.expires && c.expires < Date.now()) return fail(res, 410, 'Mã đã hết hạn');
          if (c.max && c.used.length >= c.max) return fail(res, 410, 'Mã đã hết lượt sử dụng');
          if (c.used.includes(acc.id)) return fail(res, 400, 'Bạn đã dùng mã này rồi');
          const s = sanitizeSave(b.save); if (!s) return fail(res, 400, 'Dữ liệu lưu không hợp lệ');
          const r = c.reward || {}, got = addItems(s, { gems: r.gems, tanks: r.tank ? [r.tank] : [], guns: r.gun ? [r.gun] : [] });
          if (r.exp) s.pendExp += r.exp;
          c.used.push(acc.id); acc.save = s; acc.rev++; mark(acc.id); mark();
          return send(res, 200, { ok: true, rev: acc.rev, gems: s.gems, owned: s.owned, dguns: s.dguns, pendExp: s.pendExp, reward: { gems: got.gems, exp: r.exp || 0, tanks: got.tanks, guns: got.guns } });
        }
        /* ---------- Cửa hàng (xe do admin đăng) ---------- */
        case '/api/shop/buy': {
          if (Number(b.rev) !== acc.rev) return fail(res, 409, 'Dữ liệu đã thay đổi ở nơi khác, hãy tải lại trang', { rev: acc.rev });
          const it = db.meta.shop[String(b.key || '')];
          if (!it || it.hidden) return fail(res, 404, 'Xe này không còn bán');
          const s = sanitizeSave(b.save); if (!s) return fail(res, 400, 'Dữ liệu lưu không hợp lệ');
          if (s.owned.includes(it.key)) return fail(res, 400, 'Bạn đã có xe này');
          if (!admin && s.gems < it.price) return fail(res, 400, 'Không đủ gems (cần ' + it.price + ')');
          if (!admin) s.gems -= it.price;
          s.owned.push(it.key); acc.save = s; acc.rev++; mark(acc.id);
          return send(res, 200, { ok: true, rev: acc.rev, gems: s.gems, owned: s.owned, key: it.key });
        }
        /* ---------- Trao đổi (có ký quỹ) ---------- */
        case '/api/trade/offer': {
          if (Number(b.rev) !== acc.rev) return fail(res, 409, 'Dữ liệu đã thay đổi ở nơi khác, hãy tải lại trang', { rev: acc.rev });
          const to = db.accounts[String(b.to || '').trim()];
          if (!to) return fail(res, 404, 'Không tìm thấy ID người nhận');
          if (to.id === acc.id) return fail(res, 400, 'Không thể trao đổi với chính mình');
          const s = sanitizeSave(b.save); if (!s) return fail(res, 400, 'Dữ liệu lưu không hợp lệ');
          const offer = cleanItems(b.offer), want = cleanItems(b.want);
          if (itemsEmpty(offer) || itemsEmpty(want)) return fail(res, 400, 'Mỗi bên phải có ít nhất 1 vật phẩm');
          if (!hasItems(s, offer)) return fail(res, 400, 'Bạn không có đủ vật phẩm để đưa ra');
          if (offer.tanks.some(k => (to.save.owned || []).includes(k)) || offer.guns.some(k => (to.save.dguns || []).includes(k))) return fail(res, 400, 'Người nhận đã có vật phẩm bạn đưa ra');
          if (!hasItems(sanitizeSave(to.save), want)) return fail(res, 400, 'Người nhận không có đủ vật phẩm bạn muốn đổi');
          if (Object.values(db.meta.trades).filter(t => t.st === 'pending' && t.from === acc.id).length >= 10) return fail(res, 400, 'Bạn đang có quá nhiều giao dịch chờ');
          takeItems(s, offer); acc.save = s; acc.rev++;
          const t = { id: newGid(), from: acc.id, fromName: acc.username, to: to.id, toName: to.username, offer, want, t: Date.now(), exp: Date.now() + 48 * 3600000, st: 'pending', note: String(b.note || '').slice(0, 60) };
          db.meta.trades[t.id] = t; mark(acc.id); mark(to.id);
          return send(res, 200, { ok: true, rev: acc.rev, gems: s.gems, owned: s.owned, dguns: s.dguns, type: s.type, trade: t });
        }
        case '/api/trade/list': {
          sweepTrades();
          const mine = Object.values(db.meta.trades).filter(t => t.from === acc.id || t.to === acc.id).sort((a, c) => c.t - a.t).slice(0, 40);
          return send(res, 200, { ok: true, trades: mine });
        }
        case '/api/trade/accept': {
          if (Number(b.rev) !== acc.rev) return fail(res, 409, 'Dữ liệu đã thay đổi ở nơi khác, hãy tải lại trang', { rev: acc.rev });
          const t = db.meta.trades[String(b.id || '')];
          if (!t || t.st !== 'pending' || t.to !== acc.id) return fail(res, 404, 'Giao dịch không còn hiệu lực');
          if (t.exp < Date.now()) { refundTrade(t, 'expired'); return fail(res, 410, 'Giao dịch đã hết hạn'); }
          const s = sanitizeSave(b.save); if (!s) return fail(res, 400, 'Dữ liệu lưu không hợp lệ');
          if (!hasItems(s, t.want)) return fail(res, 400, 'Bạn không còn đủ vật phẩm để đổi');
          if (t.offer.tanks.some(k => s.owned.includes(k)) || t.offer.guns.some(k => s.dguns.includes(k))) return fail(res, 400, 'Bạn đã có vật phẩm được đưa ra');
          takeItems(s, t.want); addItems(s, t.offer);
          const f = db.accounts[t.from];
          if (f) { pushInbox(f, { kind: 'bundle', items: t.want, from: acc.id, fromName: acc.username, note: 'Trao đổi thành công' }); mark(f.id); }
          t.st = 'done'; t.done = Date.now(); acc.save = s; acc.rev++; mark(acc.id);
          return send(res, 200, { ok: true, rev: acc.rev, gems: s.gems, owned: s.owned, dguns: s.dguns, type: s.type });
        }
        case '/api/trade/cancel': { // người đề nghị hủy, hoặc người nhận từ chối
          const t = db.meta.trades[String(b.id || '')];
          if (!t || t.st !== 'pending' || (t.from !== acc.id && t.to !== acc.id)) return fail(res, 404, 'Giao dịch không còn hiệu lực');
          refundTrade(t, t.from === acc.id ? 'cancelled' : 'declined');
          return send(res, 200, { ok: true });
        }
      }
      /* ================= QUẢN TRỊ ================= */
      if (route.startsWith('/api/admin/')) {
        if (!admin) return fail(res, 403, 'Chỉ dành cho quản trị viên');
        if (route === '/api/admin/unlock') { // phải nhập lại mật khẩu để mở bảng quản trị
          if (limited('a' + acc.id, 6, 600000)) return fail(res, 429, 'Thử sai quá nhiều lần, hãy đợi 10 phút');
          if (!safeEq((await scrypt(String(b.password || ''), acc.salt)).toString('hex'), acc.hash)) { hit('a' + acc.id); return fail(res, 401, 'Sai mật khẩu'); }
          const sec = crypto.randomBytes(24).toString('hex'); acc.admTok = sha(sec); acc.admExp = Date.now() + 20 * 60000;
          return send(res, 200, { ok: true, admToken: sec, expires: acc.admExp });
        }
        if (!adminOk(req, acc)) return fail(res, 401, 'Cần nhập lại mật khẩu để dùng công cụ quản trị', { locked: true });
        const target = () => db.accounts[String(b.id || '').trim()];
        const row = a => ({ id: a.id, username: a.username, created: a.created, seen: a.seen || 0, ip: a.ip || '', admin: isAdmin(a), ban: banned(a) ? a.ban : null, muted: muted(a), mutedUntil: a.mute || 0, gems: a.save.gems || 0, level: a.save.level || 1, tanks: (a.save.owned || []).length, guns: (a.save.dguns || []).length, rev: a.rev });
        const search = q => {
          q = String(q || '').trim().toLowerCase();
          return Object.values(db.accounts).filter(a => !q || a.id.includes(q) || a.username.toLowerCase().includes(q)).sort((x, y) => y.created - x.created);
        };
        switch (route) {
          case '/api/admin/users': { const l = search(b.q); return send(res, 200, { ok: true, total: l.length, users: l.slice(0, Math.min(200, +b.limit || 50)).map(row) }); }
          case '/api/admin/export': { // .docx danh sách tài khoản (theo ô tìm kiếm)
            const q = decodeURIComponent((/(^|&)q=([^&]*)/.exec(query) || [])[2] || ''), l = search(q);
            const buf = makeDocx('Danh sách tài khoản - Tank Warfare', 'Xuất lúc ' + new Date().toLocaleString('vi-VN') + ' · ' + l.length + ' tài khoản' + (q ? ' · lọc: "' + q + '"' : '') + ' (không chứa mật khẩu)',
              ['ID', 'Tên đăng nhập', 'Ngày tạo', 'Cấp', 'Gems', 'Số xe', 'Trạng thái'],
              l.map(a => [a.id, a.username, new Date(a.created).toLocaleDateString('vi-VN'), String(a.save.level || 1), String(a.save.gems || 0), String((a.save.owned || []).length), [isAdmin(a) ? 'Admin' : '', banned(a) ? 'Bị khóa' : '', muted(a) ? 'Bị cấm chat' : ''].filter(Boolean).join(', ') || 'Bình thường']));
            res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': 'attachment; filename="tai-khoan.docx"', 'Cache-Control': 'no-store' });
            return res.end(buf);
          }
          case '/api/admin/user': { const t = target(); if (!t) return fail(res, 404, 'Không tìm thấy tài khoản'); return send(res, 200, { ok: true, user: Object.assign(row(t), { save: t.save, inbox: t.inbox || [] }) }); }
          case '/api/admin/edit': { // chỉnh mọi thứ của tài khoản (kể cả của chính admin)
            const t = target(); if (!t) return fail(res, 404, 'Không tìm thấy tài khoản');
            const p = b.patch || {}, s = sanitizeSave(t.save), num = v => Math.max(0, Math.min(1e12, Math.floor(Number(v)))), keys = a => (Array.isArray(a) ? a : []).map(String).filter(k => KEYRE.test(k));
            if (p.gems !== undefined && Number.isFinite(+p.gems)) s.gems = num(p.gems);
            if (p.level !== undefined && Number.isFinite(+p.level)) s.level = Math.max(1, Math.min(1e6, Math.floor(+p.level)));
            if (p.addExp !== undefined && Number.isFinite(+p.addExp)) s.pendExp += num(p.addExp);
            if (typeof p.type === 'string' && KEYRE.test(p.type)) s.type = p.type;
            keys(p.addTanks).forEach(k => { if (!s.owned.includes(k)) s.owned.push(k); });
            keys(p.removeTanks).forEach(k => { if (k !== 'basic') { s.owned = s.owned.filter(x => x !== k); if (s.type === k) s.type = 'basic'; } });
            keys(p.addGuns).forEach(k => { if (!s.dguns.includes(k)) s.dguns.push(k); });
            keys(p.removeGuns).forEach(k => { s.dguns = s.dguns.filter(x => x !== k); });
            t.save = s; t.rev++; mark(t.id);
            return send(res, 200, { ok: true, user: Object.assign(row(t), { save: t.save }) });
          }
          case '/api/admin/resetpw': { // KHÔNG xem được mật khẩu cũ (chỉ lưu bản băm); admin chỉ đặt mật khẩu mới
            const t = target(); if (!t) return fail(res, 404, 'Không tìm thấy tài khoản');
            if (t.id !== acc.id && isAdmin(t)) return fail(res, 403, 'Không đặt lại mật khẩu của admin khác');
            const pw = String(b.password || '') || crypto.randomBytes(5).toString('hex');
            if (pw.length < 6 || pw.length > 64) return fail(res, 400, 'Mật khẩu 6-64 ký tự');
            t.salt = crypto.randomBytes(16).toString('hex'); t.hash = (await scrypt(pw, t.salt)).toString('hex'); t.tok = ''; mark(t.id);
            if (hooks.kick) hooks.kick(t.id);
            return send(res, 200, { ok: true, password: pw, id: t.id, username: t.username });
          }
          case '/api/admin/ban': {
            const t = target(); if (!t) return fail(res, 404, 'Không tìm thấy tài khoản');
            if (isAdmin(t)) return fail(res, 403, 'Không khóa được admin');
            if (b.ban) {
              const hours = Math.max(0, Math.floor(+b.hours || 0));
              t.ban = { until: hours ? Date.now() + hours * 3600000 : 0, reason: String(b.reason || '').slice(0, 80) }; t.tok = '';
              if (b.ip && t.ip) db.meta.bans.ips[t.ip] = hours ? Date.now() + hours * 3600000 : 0;
              if (hooks.kick) hooks.kick(t.id);
            } else { delete t.ban; if (t.ip) delete db.meta.bans.ips[t.ip]; }
            mark(t.id); return send(res, 200, { ok: true, user: row(t) });
          }
          case '/api/admin/mute': {
            const t = target(); if (!t) return fail(res, 404, 'Không tìm thấy tài khoản');
            if (isAdmin(t)) return fail(res, 403, 'Không cấm chat được admin');
            const min = Math.max(0, Math.floor(+b.minutes || 0)); t.mute = b.mute ? (min ? Date.now() + min * 60000 : Date.now() + 3650 * 86400000) : 0;
            mark(t.id); return send(res, 200, { ok: true, user: row(t) });
          }
          case '/api/admin/codes': {
            const act = String(b.action || 'list');
            if (act === 'create') {
              const r = b.reward || {}, reward = { gems: Math.max(0, Math.min(1e9, Math.floor(+r.gems || 0))), exp: Math.max(0, Math.min(1e12, Math.floor(+r.exp || 0))), tank: KEYRE.test(String(r.tank || '')) ? String(r.tank) : '', gun: KEYRE.test(String(r.gun || '')) ? String(r.gun) : '' };
              if (!reward.gems && !reward.exp && !reward.tank && !reward.gun) return fail(res, 400, 'Hãy nhập ít nhất 1 phần thưởng');
              let code = String(b.code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24);
              if (!code) code = crypto.randomBytes(4).toString('hex').toUpperCase();
              if (code.length < 3) return fail(res, 400, 'Code tối thiểu 3 ký tự (chữ/số/_/-)');
              if (db.meta.codes[code]) return fail(res, 409, 'Code này đã tồn tại');
              const days = Number(b.days), expires = Number(b.expires) > 0 ? Number(b.expires) : (days > 0 ? Date.now() + days * 86400000 : 0);
              db.meta.codes[code] = { code, reward, expires, max: Math.max(0, Math.floor(+b.max || 0)), used: [], created: Date.now(), by: acc.username };
              mark(); return send(res, 200, { ok: true, code: db.meta.codes[code] });
            }
            if (act === 'delete') { delete db.meta.codes[String(b.code || '').toUpperCase()]; mark(); }
            return send(res, 200, { ok: true, codes: Object.values(db.meta.codes).sort((x, y) => y.created - x.created) });
          }
          case '/api/admin/shop': {
            const act = String(b.action || 'list');
            if (act === 'add') {
              const name = String(b.name || '').trim().slice(0, 30), tier = String(b.tier || '').toUpperCase(), price = Math.floor(Number(b.price));
              if (!name) return fail(res, 400, 'Nhập tên xe'); if (!TIERS.includes(tier)) return fail(res, 400, 'Tier không hợp lệ');
              if (!(price >= 0 && price <= 1e9)) return fail(res, 400, 'Giá không hợp lệ');
              if (!b.design || typeof b.design !== 'object' || JSON.stringify(b.design).length > 60000) return fail(res, 400, 'Thiết kế xe không hợp lệ');
              const key = 'shop_' + crypto.randomBytes(3).toString('hex');
              db.meta.shop[key] = { key, name, tier, price, design: JSON.parse(JSON.stringify(b.design)), by: acc.username, t: Date.now() }; mark();
            } else if (act === 'delete') { // gỡ khỏi cửa hàng; người đã mua vẫn giữ xe (ẩn, không bán nữa)
              const it = db.meta.shop[String(b.key || '')]; if (it) { it.hidden = true; mark(); }
            } else if (act === 'price') {
              const it = db.meta.shop[String(b.key || '')], price = Math.floor(Number(b.price)); if (it && price >= 0 && price <= 1e9) { it.price = price; if (b.tier && TIERS.includes(String(b.tier).toUpperCase())) it.tier = String(b.tier).toUpperCase(); mark(); }
            }
            return send(res, 200, { ok: true, shop: shopList() });
          }
          case '/api/admin/backup': {
            const act = String(b.action || 'list');
            if (act === 'create') { const name = 'bk-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); await store.saveBackup(name, db); return send(res, 200, { ok: true, name, backups: await store.listBackups() }); }
            if (act === 'restore') {
              const name = String(b.name || ''); if (!/^bk-[0-9A-Za-z\-]+$/.test(name)) return fail(res, 400, 'Tên bản sao lưu không hợp lệ');
              const snap = await store.loadBackup(name); if (!snap || !snap.accounts) return fail(res, 404, 'Không tìm thấy bản sao lưu');
              await store.saveBackup('bk-truoc-khi-khoi-phuc-' + Date.now(), db); // luôn sao lưu trạng thái hiện tại trước
              db = snap; fixMeta(); Object.keys(db.accounts).forEach(id => dirty.acc.add(id)); mark();
              return send(res, 200, { ok: true, restored: name, accounts: Object.keys(db.accounts).length });
            }
            return send(res, 200, { ok: true, backups: await store.listBackups() });
          }
          case '/api/admin/announce': { if (hooks.announce) hooks.announce({ t: 'announce', m: String(b.m || '').slice(0, 200), by: acc.username }); return send(res, 200, { ok: true, sent: !!hooks.announce }); }
          case '/api/admin/cmd': { // lệnh trực tiếp lên người chơi đang online: freeze / tp / kick
            const aid = String(b.aid || '');
            if (b.cmd === 'kick') { if (hooks.kick) hooks.kick(aid); return send(res, 200, { ok: true }); }
            if (!['freeze', 'tp', 'msg'].includes(b.cmd)) return fail(res, 400, 'Lệnh không hợp lệ');
            const ok = hooks.cmd ? hooks.cmd(aid, { t: 'adm', cmd: b.cmd, x: +b.x || 0, y: +b.y || 0, ms: Math.min(60000, +b.ms || 5000), m: String(b.m || '').slice(0, 120) }) : false;
            return send(res, ok ? 200 : 404, { ok, error: ok ? undefined : 'Người chơi không online trong máy chủ này' });
          }
        }
        return fail(res, 404, 'Không có chức năng này');
      }
      return fail(res, 404, 'Không có chức năng này');
    } catch (e) { console.error('[tài khoản] lỗi', route, e); return fail(res, 500, 'Lỗi máy chủ'); }
  }

  /* dùng cho hub: kiểm tra token WebSocket */
  function verify(token) {
    const m = /^(\d+)\.([0-9a-f]+)$/.exec(String(token || '')); if (!m) return null;
    const a = db.accounts[m[1]]; if (!a || !a.tok || !safeEq(a.tok, sha(m[2])) || banned(a)) return null;
    return { id: a.id, username: a.username, admin: isAdmin(a) };
  }

  return { handle, flushNow, verify, isMuted: id => muted(db.accounts[id]), ready: () => initP, status: () => ({ ready, accounts: Object.keys(db.accounts).length, storage: store.kind }), _db: () => db };
}

module.exports = { create, sanitizeSave, makeDocx, PRETTY_ADMIN_IDS };
