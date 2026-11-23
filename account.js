/* eslint-disable */
/* Tank Warfare: Evolution — TÀI KHOẢN (phía người chơi)
   - Đăng ký / đăng nhập (ID số ngẫu nhiên; 3 tài khoản đầu là admin). Tiến trình tự lưu lên máy chủ, theo bạn sang máy khác.
   - Hộp thư quà, tặng quà, TRAO ĐỔI (tìm theo ID), nhập CODE, mua xe do admin đăng lên cửa hàng.
   - Khi đăng nhập, tiến trình cũ của máy này (chơi khách) được cất đi và trả lại khi đăng xuất.
   Cần máy chủ chạy server.js. Dùng chung D, S, KEY, save của game. */
(function () {
  const SK = 'twe_account', GUEST = 'tank7x3_guest_backup', FLAG = 'twe_guest_stashed', CAT = 'twe_catalog';
  const lg = k => { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch (e) { return null } };
  const ls = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)) } catch (e) { } };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let stopped = false;
  // Khi đang chuyển tài khoản/khách, CHẶN mọi lần ghi vào khóa lưu của game (game tự lưu lúc đóng trang sẽ ghi đè dữ liệu vừa nạp).
  const _setItem = Storage.prototype.setItem, rawSet = (k, v) => _setItem.call(localStorage, k, v);
  Storage.prototype.setItem = function (k, v) { if (stopped && k === KEY && this === localStorage) return; return _setItem.apply(this, arguments) };
  let sess = lg(SK), me = null, baseUrl = null, msg = '', tab = 'login', sub = 'home', saveTimer = null, busy = false, lastSent = '', notice = '';
  let trades = [], partner = null;

  /* ---------- Địa chỉ máy chủ ---------- */
  const toHttp = u => String(u || '').trim().replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:').replace(/\/+$/, '');
  function timeoutFetch(url, opt, ms) {
    const c = new AbortController(), t = setTimeout(() => c.abort(), ms || 12000);
    return fetch(url, Object.assign({}, opt, { signal: c.signal })).finally(() => clearTimeout(t));
  }
  async function resolveBase(force) {
    if (baseUrl !== null && !force) return baseUrl;
    const cand = [];
    if (sess && sess.server) cand.push(sess.server);
    const pref = (lg('twe_account_server') || ''); if (pref) cand.push(pref);
    if (/^https?:$/.test(location.protocol)) cand.push('');
    const ol = lg('twe_online'); if (ol && ol.url) cand.push(toHttp(ol.url));
    cand.push('http://localhost:8080');
    for (const b of [...new Set(cand)]) {
      try { const r = await timeoutFetch(b + '/api/status', {}, 4000), j = await r.json(); if (j && j.ok) { baseUrl = b; return b } } catch (e) { }
    }
    baseUrl = null; throw new Error('Không kết nối được máy chủ tài khoản. Máy chủ phải chạy server.js (ô "Máy chủ tài khoản" ở dưới).');
  }
  async function api(path, method, body, opt) {
    const b = await resolveBase();
    const headers = Object.assign({ 'Content-Type': 'application/json' }, (opt && opt.headers) || {}); if (sess && sess.token) headers.Authorization = 'Bearer ' + sess.token;
    const r = await timeoutFetch(b + path, { method: method || 'GET', headers, body: body ? JSON.stringify(body) : undefined, keepalive: !!(opt && opt.keepalive) });
    if (opt && opt.raw) return r;
    let j = null; try { j = await r.json() } catch (e) { }
    return { code: r.status, j: j || { ok: false, error: 'Máy chủ trả về dữ liệu lạ' } };
  }
  const persist = () => ls(SK, sess);

  /* ---------- Chuyển đổi giữa khách và tài khoản ---------- */
  function stashGuest() { if (localStorage.getItem(FLAG)) return; try { const v = localStorage.getItem(KEY); localStorage.setItem(GUEST, v === null ? '' : v); localStorage.setItem(FLAG, '1') } catch (e) { } }
  function restoreGuest() {
    try { const g = localStorage.getItem(GUEST); if (g) rawSet(KEY, g); else localStorage.removeItem(KEY); localStorage.removeItem(GUEST); localStorage.removeItem(FLAG) } catch (e) { }
  }
  function enterAccount(token, m) {
    stopped = true; stashGuest();
    sess = { token, id: m.id, username: m.username, rev: m.rev, admin: !!m.admin, server: baseUrl || '' }; persist();
    try { rawSet(KEY, JSON.stringify(m.save)) } catch (e) { }
    location.reload();
  }
  function leaveAccount(reason) {
    stopped = true; ls(SK, null); sess = null; restoreGuest();
    if (reason) try { sessionStorage.setItem('twe_acct_note', reason) } catch (e) { }
    location.reload();
  }

  /* ---------- Cloud save tự động ---------- */
  const _save = save;
  save = function () { _save.apply(this, arguments); if (sess && !stopped) schedule() };
  function schedule() { if (saveTimer) return; saveTimer = setTimeout(() => { saveTimer = null; upload() }, 8000) }
  async function upload(keepalive) {
    if (!sess || stopped || busy) return;
    const s = JSON.stringify(D); if (s === lastSent) return;
    busy = true;
    try {
      const r = await api('/api/save', 'POST', { rev: sess.rev, save: D }, { keepalive });
      if (r.j.ok) { sess.rev = r.j.rev; persist(); lastSent = s; }
      else if (r.code === 401) leaveAccount('Tài khoản của bạn vừa được đăng nhập ở nơi khác (hoặc bị khóa) nên phiên này đã bị đăng xuất.');
      else if (r.code === 409) syncFromServer('Dữ liệu tài khoản đã thay đổi ở nơi khác (tab/thiết bị khác hoặc do quản trị viên).');
    } catch (e) { /* mất mạng: thử lại lần lưu sau */ }
    busy = false;
  }
  async function syncFromServer(why) { // máy chủ thắng: tải bản đã lưu về rồi nạp lại trang
    stopped = true;
    try {
      const r = await api('/api/me'); if (!r.j.ok) return leaveAccount('Phiên đã hết hạn, hãy đăng nhập lại.');
      sess.rev = r.j.me.rev; persist(); rawSet(KEY, JSON.stringify(r.j.me.save));
      try { sessionStorage.setItem('twe_acct_note', why + ' Đã tải lại dữ liệu mới nhất.') } catch (e) { }
      location.reload();
    } catch (e) { stopped = false }
  }
  addEventListener('pagehide', () => { if (sess && !stopped) { try { _save() } catch (e) { } upload(true) } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && sess && !stopped) upload(true) });

  /* EXP chờ (do mã quà / quản trị viên cộng): cộng vào tiến trình khi đang ở menu */
  function consumePend() {
    const n = Math.min(Math.floor(D.pendExp || 0), 1e11); D.pendExp = 0;
    if (n > 0) { try { grantExp(n) } catch (e) { D.exp += n } try { _save() } catch (e) { } }
    return n;
  }

  /* ---------- Cửa hàng do admin đăng: đăng ký xe vào game ---------- */
  function regCatalog(list) {
    (list || []).forEach(it => {
      try {
        const sp = ctSpec(it.design);
        Object.assign(sp, { name: it.name, tier: it.tier, price: it.price, hidden: !!it.hidden, desc: 'Xe cửa hàng · đăng bởi ' + it.by, shopItem: true });
        S[it.key] = sp;
      } catch (e) { console.warn('Bỏ qua xe cửa hàng lỗi', it && it.key, e) }
    });
    if (D._pt && S[D._pt]) { D.type = D._pt; delete D._pt }
    try { menuInfo() } catch (e) { }
    try { const sh = document.getElementById('shop'); if (sh && !sh.classList.contains('hidden')) renderShop() } catch (e) { }
  }
  async function loadCatalog() {
    const cached = lg(CAT); if (cached) regCatalog(cached);
    try { const r = await api('/api/shop'); if (r.j.ok) { ls(CAT, r.j.shop); regCatalog(r.j.shop) } } catch (e) { }
  }
  const _buy = buy;
  buy = function (k) {
    if (!/^shop_/.test(k)) return _buy(k);
    const s = S[k]; if (!s || D.owned.includes(k)) return;
    if (!sess) { // chơi khách: mua tại máy
      if (D.gems < s.price) return alert('Không đủ gems (cần ' + s.price + ' 💎)');
      D.gems -= s.price; D.owned.push(k); try { equip(k) } catch (e) { save() } return;
    }
    (async () => {
      try {
        try { _save() } catch (e) { }
        const r = await api('/api/shop/buy', 'POST', { key: k, rev: sess.rev, save: D });
        if (r.j.ok) { applyInventory(r.j); try { equip(k) } catch (e) { save() } }
        else if (r.code === 409) syncFromServer('Dữ liệu đã thay đổi ở nơi khác.');
        else if (r.code === 401) leaveAccount('Tài khoản vừa được đăng nhập ở nơi khác.');
        else alert(r.j.error);
      } catch (e) { alert(e.message) }
    })();
  };

  /* ---------- Khởi động: kiểm tra phiên ---------- */
  async function init() {
    try { notice = sessionStorage.getItem('twe_acct_note') || ''; sessionStorage.removeItem('twe_acct_note') } catch (e) { }
    loadCatalog();
    if (!sess) { badge(); if (notice) { msg = notice; } return }
    try {
      const r = await api('/api/me');
      if (r.code === 401) return leaveAccount('Phiên đăng nhập đã hết hạn hoặc tài khoản được đăng nhập ở nơi khác.');
      if (!r.j.ok) throw new Error(r.j.error);
      me = r.j.me; sess.admin = !!me.admin; persist();
      if (me.rev !== sess.rev) { // máy chủ có bản mới hơn => máy chủ thắng
        stopped = true; sess.rev = me.rev; persist(); rawSet(KEY, JSON.stringify(me.save));
        try { sessionStorage.setItem('twe_acct_note', 'Đã tải tiến trình mới nhất từ tài khoản.') } catch (e) { }
        return location.reload();
      }
      if (D.pendExp > 0) { const n = consumePend(); if (n) { msg = '<div class="pn" style="color:#4ade80">Đã cộng ' + n.toLocaleString() + ' EXP chờ vào tiến trình.</div>' } }
      badge(); setInterval(poll, 60000);
      if (window.TWE_ADMIN && TWE_ADMIN.onLogin) TWE_ADMIN.onLogin();
    } catch (e) { badge(); }
  }
  async function poll() { if (!sess || stopped) return; try { const r = await api('/api/me?lite=1'); if (r.code === 401) return leaveAccount('Tài khoản vừa được đăng nhập ở nơi khác.'); if (r.j.ok) { me = Object.assign(me || {}, r.j.me); badge(); if (!ov.classList.contains('hidden')) render() } } catch (e) { } }
  function badge() {
    const b = document.getElementById('acBtn'); if (!b) return;
    const n = me && me.inbox ? me.inbox.length : 0, t = me ? me.tradesIn || 0 : 0;
    b.innerHTML = sess ? '👤 ' + esc(sess.username) + ' <span style="opacity:.7">#' + sess.id + '</span>' + (n ? ' <b style="color:#fbbf24">🎁' + n + '</b>' : '') + (t ? ' <b style="color:#38bdf8">🔄' + t + '</b>' : '') : '👤 TÀI KHOẢN (đăng nhập)';
  }

  /* ---------- Giao diện ---------- */
  const css = document.createElement('style');
  css.textContent = '#acOv{z-index:26;background:#020617;overflow:auto}#acOv .pn{max-width:640px;width:100%;box-sizing:border-box;text-align:left}#acOv input,#acOv select{font-size:14px;width:100%;box-sizing:border-box;margin:3px 0}' +
    '.acg{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:8px;background:#0f172a;border:1px solid #334155;margin:4px 0}.act{display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap}.act button{flex:1;background:#1e293b;min-width:96px}.act button.on{background:#7c3aed}';
  document.head.appendChild(css);
  const ov = document.createElement('div'); ov.id = 'acOv'; ov.className = 'ov hidden'; document.body.appendChild(ov);
  const $q = id => document.getElementById(id);
  const setMsg = (t, ok) => { msg = t ? '<div class="pn" style="color:' + (ok ? '#4ade80' : '#fcd34d') + '">' + esc(t) + '</div>' : '' };
  const tkName = k => (S[k] ? S[k].name + ' [' + S[k].tier + ']' : k);
  const gunName = k => (typeof DGUN !== 'undefined' && DGUN[k]) || k;
  const itemsText = it => it ? [it.gems ? '💎 ' + it.gems.toLocaleString() : '', ...(it.tanks || []).map(k => '🚗 ' + tkName(k)), ...(it.guns || []).map(k => '🔫 ' + gunName(k))].filter(Boolean).join(' + ') : '';
  const giftText = g => g.kind === 'gems' ? '💎 ' + g.amount.toLocaleString() + ' gems' : (g.kind === 'bundle' ? '📦 ' + itemsText(g.items) : '🚗 ' + tkName(g.tank));
  const myTanks = () => (D.owned || []).filter(k => k !== 'basic' && k !== 'custom' && S[k]);
  const opts = (arr, label, none) => arr.length ? arr.map(k => '<option value="' + k + '">' + esc(label(k)) + '</option>').join('') : '<option value="">' + none + '</option>';

  function render() {
    if (ov.classList.contains('hidden')) return;
    if (!sess) {
      ov.innerHTML = '<h1 style="font-size:clamp(24px,5vw,40px)">👤 TÀI KHOẢN</h1>' + msg +
        '<div class="pn"><div class="act"><button class="' + (tab === 'login' ? 'on' : '') + '" onclick="TWE_ACCOUNT.tab(\'login\')">ĐĂNG NHẬP</button><button class="' + (tab === 'reg' ? 'on' : '') + '" onclick="TWE_ACCOUNT.tab(\'reg\')">ĐĂNG KÝ</button></div>' +
        '<input id="acU" placeholder="' + (tab === 'login' ? 'Tên đăng nhập hoặc ID' : 'Tên đăng nhập (3-16 ký tự: chữ không dấu, số, _ . -)') + '" maxlength="16" autocomplete="username">' +
        '<input id="acP" type="password" placeholder="Mật khẩu (6-64 ký tự)" autocomplete="' + (tab === 'login' ? 'current-password' : 'new-password') + '" onkeydown="event.stopPropagation();if(event.key===\'Enter\')TWE_ACCOUNT.submit()">' +
        (tab === 'reg' ? '<input id="acP2" type="password" placeholder="Nhập lại mật khẩu" autocomplete="new-password" onkeydown="event.stopPropagation();if(event.key===\'Enter\')TWE_ACCOUNT.submit()">' : '') +
        '<div style="margin-top:8px;text-align:center"><button style="background:#16a34a;padding:10px 24px" onclick="TWE_ACCOUNT.submit()">' + (tab === 'login' ? 'ĐĂNG NHẬP' : 'TẠO TÀI KHOẢN') + '</button></div>' +
        '<div class="mu" style="font-size:12px;margin-top:8px">' + (tab === 'reg' ? 'Tài khoản mới bắt đầu từ đầu với <b>xe tăng mặc định</b>. Bạn nhận một ID số để bạn bè tặng quà và trao đổi.<br>' : '') + 'Tiến trình đang chơi (khách) trên máy này được cất đi và <b>trả lại khi bạn đăng xuất</b>.</div>' +
        '<details style="margin-top:8px"><summary class="mu" style="cursor:pointer;font-size:12px">Máy chủ tài khoản</summary><input id="acSrv" placeholder="để trống = tự nhận (https://ten-may-chu.onrender.com)" value="' + esc(lg('twe_account_server') || '') + '" onchange="TWE_ACCOUNT.setServer(this.value)"></details></div>' +
        '<button class="red" onclick="TWE_ACCOUNT.close()">✕ ĐÓNG</button>';
      return;
    }
    const m = me || { inbox: [], admin: !!sess.admin };
    const head = '<h1 style="font-size:clamp(24px,5vw,40px)">👤 ' + esc(sess.username) + (m.admin ? ' <span style="font-size:14px;color:#fbbf24">QUẢN TRỊ</span>' : '') + '</h1>' + msg +
      '<div class="pn" style="padding-bottom:6px"><div class="act">' + [['home', '🏠 Tổng quan'], ['gift', '💝 Tặng quà'], ['trade', '🔄 Trao đổi' + (m.tradesIn ? ' (' + m.tradesIn + ')' : '')]].map(x => '<button class="' + (sub === x[0] ? 'on' : '') + '" onclick="TWE_ACCOUNT.sub(\'' + x[0] + '\')">' + x[1] + '</button>').join('') +
      (m.admin ? '<button style="background:#b45309" onclick="TWE_ACCOUNT.close();TWE_ADMIN.open()">🛠️ QUẢN TRỊ</button>' : '') + '</div></div>';
    const foot = '<div style="display:flex;gap:8px"><button style="background:#334155" onclick="TWE_ACCOUNT.close()">✕ ĐÓNG</button><button class="red" onclick="TWE_ACCOUNT.logout()">ĐĂNG XUẤT</button></div>';
    if (sub === 'gift') {
      const tl = (m.admin ? Object.keys(S).filter(k => k !== 'basic' && k !== 'custom') : myTanks()).sort((a, b) => S[a].name.localeCompare(S[b].name));
      ov.innerHTML = head + '<div class="pn"><b>💝 Tặng quà cho bạn bè</b>' + (m.admin ? '<div class="mu" style="font-size:11px;color:#fbbf24">Quản trị: tặng KHÔNG bị trừ, được tặng bất kỳ xe nào.</div>' : '') +
        '<input id="acTo" placeholder="ID người nhận" maxlength="12" inputmode="numeric" onchange="TWE_ACCOUNT.lookup()"><div id="acWho" class="mu" style="font-size:12px;min-height:16px"></div>' +
        '<select id="acKind" onchange="TWE_ACCOUNT.kindChange()"><option value="gems">💎 Gems</option><option value="tank">🚗 Xe tăng</option></select>' +
        '<input id="acAmt" type="number" min="1" placeholder="Số gems"><select id="acTank" style="display:none">' + opts(tl, tkName, '(bạn chưa có xe nào để tặng)') + '</select>' +
        '<input id="acNote" maxlength="60" placeholder="Lời nhắn (không bắt buộc)"><div style="text-align:center;margin-top:6px"><button style="background:#be185d" onclick="TWE_ACCOUNT.gift()">TẶNG QUÀ</button></div></div>' + foot;
      return;
    }
    if (sub === 'trade') {
      const p = partner, mine = myTanks(), mg = D.dguns || [];
      const tr = t => { const inn = t.to === sess.id, who = inn ? t.fromName + ' #' + t.from : t.toName + ' #' + t.to; return '<div class="acg" style="flex-wrap:wrap"><span style="flex:1;min-width:220px;font-size:13px">' + (inn ? '⬇️ <b>' + esc(who) + '</b> muốn đổi' : '⬆️ Bạn đề nghị <b>' + esc(who) + '</b>') + '<br>Đưa: ' + esc(itemsText(t.offer)) + '<br>Lấy: ' + esc(itemsText(t.want)) + '<br><span class="mu" style="font-size:11px">' + ({ pending: 'đang chờ', done: '✅ hoàn tất', cancelled: 'đã hủy', declined: 'bị từ chối', expired: 'hết hạn' }[t.st]) + ' · ' + new Date(t.t).toLocaleString() + '</span></span>' + (t.st === 'pending' ? (inn ? '<button style="background:#16a34a" onclick="TWE_ACCOUNT.tradeAccept(\'' + t.id + '\')">ĐỒNG Ý</button><button class="red" onclick="TWE_ACCOUNT.tradeCancel(\'' + t.id + '\')">TỪ CHỐI</button>' : '<button class="red" onclick="TWE_ACCOUNT.tradeCancel(\'' + t.id + '\')">HỦY</button>') : '') + '</div>' };
      ov.innerHTML = head + '<div class="pn"><b>🔄 Trao đổi với người chơi khác</b><div class="mu" style="font-size:11px">Vật phẩm bạn đưa ra được giữ lại (ký quỹ) cho tới khi đối phương đồng ý, từ chối hoặc hết 48 giờ — rồi sẽ trả về hộp thư.</div>' +
        '<div style="display:flex;gap:6px"><input id="acTP" placeholder="🔍 Tìm ID người chơi để trao đổi" maxlength="12" inputmode="numeric" value="' + (p ? p.id : '') + '" onkeydown="event.stopPropagation();if(event.key===\'Enter\')TWE_ACCOUNT.tradeFind()"><button style="background:#0ea5e9;margin:3px 0" onclick="TWE_ACCOUNT.tradeFind()">TÌM</button></div>' +
        (p ? '<div class="acg">→ <b style="color:#4ade80">' + esc(p.username) + '</b> (#' + p.id + ')' + (p.admin ? ' <span style="color:#fbbf24">QUẢN TRỊ</span>' : '') + '<span class="mu" style="font-size:11px"> · ' + p.tanks.length + ' xe · ' + p.guns.length + ' súng drone</span></div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap"><div style="flex:1;min-width:240px"><b style="color:#fbbf24">BẠN ĐƯA</b><input id="tOg" type="number" min="0" placeholder="💎 gems"><select id="tOt"><option value="">🚗 (không đưa xe)</option>' + mine.map(k => '<option value="' + k + '">' + esc(tkName(k)) + '</option>').join('') + '</select><select id="tOu"><option value="">🔫 (không đưa súng drone)</option>' + mg.map(k => '<option value="' + k + '">' + esc(gunName(k)) + '</option>').join('') + '</select></div>' +
          '<div style="flex:1;min-width:240px"><b style="color:#38bdf8">BẠN MUỐN LẤY</b><input id="tWg" type="number" min="0" placeholder="💎 gems"><select id="tWt"><option value="">🚗 (không lấy xe)</option>' + p.tanks.map(k => '<option value="' + k + '">' + esc(tkName(k)) + '</option>').join('') + '</select><select id="tWu"><option value="">🔫 (không lấy súng drone)</option>' + p.guns.map(k => '<option value="' + k + '">' + esc(gunName(k)) + '</option>').join('') + '</select></div></div>' +
          '<div style="text-align:center;margin-top:6px"><button style="background:#16a34a" onclick="TWE_ACCOUNT.tradeSend()">GỬI ĐỀ NGHỊ TRAO ĐỔI</button></div>' : '') + '</div>' +
        '<div class="pn"><b>📋 Giao dịch của bạn</b>' + (trades.length ? trades.map(tr).join('') : '<div class="mu">Chưa có giao dịch nào.</div>') + '</div>' + foot;
      return;
    }
    const nd = (D.dguns || []).length;
    ov.innerHTML = head +
      '<div class="pn"><div class="acg"><span style="flex:1">ID của bạn<br><b style="font-size:26px;letter-spacing:2px;color:#fcd34d">' + sess.id + '</b></span><button style="background:#334155" onclick="TWE_ACCOUNT.copyId()">📋 Sao chép</button></div>' +
      '<div class="acg"><span style="flex:1">💎 Gems: <b>' + (D.gems || 0).toLocaleString() + '</b> · 🚗 Xe: <b>' + (D.owned || []).length + '</b> · 🔫 Súng drone mua thêm: <b>' + nd + '</b></span></div>' +
      '<div class="mu" style="font-size:11px">Tiến trình tự động lưu lên máy chủ. Đưa ID cho bạn bè để tặng quà / trao đổi / chơi cùng.</div></div>' +
      '<div class="pn"><b>🎁 Hộp thư quà (' + (m.inbox || []).length + ')</b>' +
      ((m.inbox || []).length ? m.inbox.map(g => '<div class="acg"><span style="flex:1">' + giftText(g) + '<br><span class="mu" style="font-size:11px">từ ' + esc(g.fromName || '') + (g.from ? ' #' + g.from : '') + ' · ' + new Date(g.t).toLocaleString() + (g.note ? ' · “' + esc(g.note) + '”' : '') + '</span></span></div>').join('') + '<div style="text-align:center;margin-top:6px"><button style="background:#16a34a" onclick="TWE_ACCOUNT.claim()">NHẬN TẤT CẢ QUÀ</button></div>' : '<div class="mu" style="margin-top:4px">Chưa có quà nào.</div>') + '</div>' +
      '<div class="pn"><b>🎟️ Nhập code nhận thưởng</b><div style="display:flex;gap:6px"><input id="acCode" placeholder="Nhập code" maxlength="24" style="text-transform:uppercase" onkeydown="event.stopPropagation();if(event.key===\'Enter\')TWE_ACCOUNT.redeem()"><button style="background:#16a34a;margin:3px 0" onclick="TWE_ACCOUNT.redeem()">NHẬN</button></div></div>' +
      '<div class="pn"><details><summary class="mu" style="cursor:pointer">Đổi mật khẩu</summary><input id="acOld" type="password" placeholder="Mật khẩu cũ" autocomplete="current-password" onkeydown="event.stopPropagation()"><input id="acNew" type="password" placeholder="Mật khẩu mới (6-64 ký tự)" autocomplete="new-password" onkeydown="event.stopPropagation()"><div style="text-align:center"><button onclick="TWE_ACCOUNT.changePw()">ĐỔI MẬT KHẨU</button></div></details></div>' + foot;
  }
  const busyBtn = on => { ov.querySelectorAll('button').forEach(b => b.disabled = on) };
  const need = f => { const v = ($q(f) || {}).value; return v === undefined ? '' : String(v).trim() };
  async function refreshMe() { const r = await api('/api/me?lite=1'); if (r.j.ok) { me = r.j.me; badge() } return r }
  async function loadTrades() { try { const r = await api('/api/trade/list', 'POST', {}); if (r.j.ok) trades = r.j.trades } catch (e) { } }
  function applyInventory(j) { // sau khi tặng/nhận/mua/đổi: cập nhật kho đồ trong game
    D.gems = j.gems; D.owned = j.owned; if (j.dguns) D.dguns = j.dguns; if (j.type !== undefined) D.type = j.type; if (j.pendExp !== undefined) D.pendExp = j.pendExp;
    sess.rev = j.rev; persist(); consumePend();
    try { _save() } catch (e) { } lastSent = JSON.stringify(D);
    try { menuInfo() } catch (e) { }
  }
  async function guarded(fn) { // chạy 1 thao tác cần máy chủ, xử lý lỗi chung
    busyBtn(true);
    try { try { _save() } catch (e) { } await fn() } catch (e) { setMsg(e.message) }
    render();
  }
  function handleErr(r) {
    if (r.code === 409 && r.j.rev !== undefined) { syncFromServer('Dữ liệu đã thay đổi ở nơi khác.'); return true } // xung đột phiên bản thật sự (máy chủ luôn kèm rev)
    if (r.code === 401) { leaveAccount('Tài khoản vừa được đăng nhập ở nơi khác.'); return true }
    setMsg(r.j.error); return false;
  }

  window.TWE_ACCOUNT = {
    get user() { return sess ? { id: sess.id, username: sess.username, admin: !!(me ? me.admin : sess.admin) } : null },
    get token() { return sess ? sess.token : '' },
    get isAdmin() { return !!(sess && (me ? me.admin : sess.admin)) },
    api, tkName, gunName, itemsText, consumePend,
    open(s) { ov.classList.remove('hidden'); if (s) sub = s; if (!msg && notice) { setMsg(notice, true); notice = '' } render(); if (sess) { refreshMe().then(() => render()).catch(() => { }); if (sub === 'trade') loadTrades().then(render) } },
    close() { ov.classList.add('hidden'); msg = '' },
    tab(t) { tab = t; msg = ''; render() },
    sub(s) { sub = s; msg = ''; render(); if (s === 'trade') loadTrades().then(render) },
    setServer(v) { ls('twe_account_server', String(v).trim() ? toHttp(v) : null); baseUrl = null },
    async submit() {
      const u = need('acU'), p = ($q('acP') || {}).value || '';
      if (tab === 'reg' && p !== (($q('acP2') || {}).value || '')) { setMsg('Hai mật khẩu không giống nhau'); return render() }
      setMsg('Đang xử lý...', true); render(); busyBtn(true);
      try {
        const r = await api(tab === 'login' ? '/api/login' : '/api/register', 'POST', { username: u, password: p });
        if (r.j.ok) return enterAccount(r.j.token, r.j.me);
        setMsg(r.j.error || 'Lỗi không rõ');
      } catch (e) { setMsg(e.message) }
      render();
    },
    async logout() {
      if (!confirm('Đăng xuất? Tiến trình tài khoản đã được lưu; tiến trình khách trước đó sẽ được trả lại.')) return;
      busyBtn(true); stopped = true;
      try { _save() } catch (e) { }
      try { await api('/api/save', 'POST', { rev: sess.rev, save: D }); await api('/api/logout', 'POST', {}) } catch (e) { }
      leaveAccount('');
    },
    copyId() { try { navigator.clipboard.writeText(sess.id); setMsg('Đã sao chép ID ' + sess.id, true) } catch (e) { setMsg('ID của bạn: ' + sess.id, true) } render() },
    async lookup() {
      const id = need('acTo'), w = $q('acWho'); if (!w) return; if (!/^\d+$/.test(id)) { w.textContent = ''; return }
      try { const r = await api('/api/lookup', 'POST', { id }); w.innerHTML = r.j.ok ? '→ <b style="color:#4ade80">' + esc(r.j.username) + '</b> (#' + r.j.id + ')' : '<span style="color:#fca5a5">' + esc(r.j.error) + '</span>' } catch (e) { w.textContent = e.message }
    },
    kindChange() { const k = need('acKind'); $q('acAmt').style.display = k === 'gems' ? '' : 'none'; $q('acTank').style.display = k === 'tank' ? '' : 'none' },
    async gift() {
      const to = need('acTo'), kind = need('acKind'), amount = need('acAmt'), tank = need('acTank'), note = need('acNote');
      if (!/^\d+$/.test(to)) { setMsg('Nhập ID người nhận (chỉ gồm số)'); return render() }
      if (kind === 'gems' && !(+amount >= 1)) { setMsg('Nhập số gems muốn tặng'); return render() }
      if (kind === 'tank' && !tank) { setMsg('Bạn chưa có xe nào để tặng'); return render() }
      if (!confirm('Tặng ' + (kind === 'gems' ? (+amount).toLocaleString() + ' gems' : tkName(tank)) + ' cho ID ' + to + '? Không thể thu hồi.')) return;
      await guarded(async () => {
        const r = await api('/api/gift', 'POST', { rev: sess.rev, save: D, to, kind, amount: +amount, tank, note });
        if (r.j.ok) { applyInventory(r.j); await refreshMe(); setMsg('Đã tặng thành công cho ' + r.j.to.username + ' (#' + r.j.to.id + ')', true) } else handleErr(r);
      });
    },
    async claim() {
      await guarded(async () => {
        const r = await api('/api/claim', 'POST', { rev: sess.rev, save: D });
        if (r.j.ok) { applyInventory(r.j); await refreshMe(); setMsg(r.j.claimed.length ? 'Đã nhận: ' + r.j.claimed.map(giftText).join(', ') : 'Không có quà mới', true) } else handleErr(r);
      });
    },
    async redeem() {
      const code = need('acCode'); if (!code) { setMsg('Nhập code'); return render() }
      await guarded(async () => {
        const r = await api('/api/redeem', 'POST', { code, rev: sess.rev, save: D });
        if (r.j.ok) { const w = r.j.reward; applyInventory(r.j); await refreshMe(); setMsg('Nhận thưởng: ' + [w.gems ? w.gems.toLocaleString() + ' gems' : '', w.exp ? w.exp.toLocaleString() + ' EXP' : '', ...(w.tanks || []).map(tkName), ...(w.guns || []).map(gunName)].filter(Boolean).join(', '), true) } else handleErr(r);
      });
    },
    async tradeFind() {
      const id = need('acTP'); if (!/^\d+$/.test(id)) { setMsg('Nhập ID (chỉ gồm số)'); return render() }
      try { const r = await api('/api/lookup', 'POST', { id }); if (r.j.ok) { partner = r.j; if (id === sess.id) { partner = null; setMsg('Đó là ID của chính bạn') } else msg = '' } else { partner = null; setMsg(r.j.error) } } catch (e) { setMsg(e.message) }
      render();
    },
    async tradeSend() {
      if (!partner) return;
      const g = v => Math.max(0, Math.floor(+need(v) || 0)), arr = v => (need(v) ? [need(v)] : []);
      const offer = { gems: g('tOg'), tanks: arr('tOt'), guns: arr('tOu') }, want = { gems: g('tWg'), tanks: arr('tWt'), guns: arr('tWu') };
      if (!(offer.gems || offer.tanks.length || offer.guns.length) || !(want.gems || want.tanks.length || want.guns.length)) { setMsg('Mỗi bên phải có ít nhất 1 vật phẩm'); return render() }
      if (!confirm('Gửi đề nghị cho ' + partner.username + ' (#' + partner.id + ')?\nBạn đưa: ' + itemsText(offer) + '\nBạn lấy: ' + itemsText(want) + '\n(Vật phẩm bạn đưa sẽ được giữ lại cho tới khi có kết quả.)')) return;
      await guarded(async () => {
        const r = await api('/api/trade/offer', 'POST', { rev: sess.rev, save: D, to: partner.id, offer, want });
        if (r.j.ok) { applyInventory(r.j); await loadTrades(); await refreshMe(); setMsg('Đã gửi đề nghị. Chờ ' + partner.username + ' phản hồi.', true) } else handleErr(r);
      });
    },
    async tradeAccept(id) {
      await guarded(async () => {
        const r = await api('/api/trade/accept', 'POST', { id, rev: sess.rev, save: D });
        if (r.j.ok) { applyInventory(r.j); await loadTrades(); await refreshMe(); setMsg('Trao đổi thành công!', true) } else { handleErr(r); await loadTrades() }
      });
    },
    async tradeCancel(id) {
      await guarded(async () => {
        const r = await api('/api/trade/cancel', 'POST', { id });
        if (r.j.ok) { await loadTrades(); await refreshMe(); setMsg('Đã hủy/từ chối. Vật phẩm ký quỹ (nếu của bạn) sẽ về hộp thư.', true) } else handleErr(r);
      });
    },
    async changePw() {
      const o = need('acOld'), n = need('acNew'); busyBtn(true);
      try { const r = await api('/api/password', 'POST', { old: o, new: n }); setMsg(r.j.ok ? 'Đã đổi mật khẩu' : r.j.error, r.j.ok) } catch (e) { setMsg(e.message) }
      render();
    }
  };
  init();
})();
