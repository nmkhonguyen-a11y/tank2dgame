/* eslint-disable */
/* Tank Warfare: Evolution — TÀI KHOẢN (phía người chơi)
   - Đăng ký / đăng nhập, mỗi tài khoản có ID số riêng. Tiến trình game được lưu lên máy chủ (tự động) và theo bạn sang máy khác.
   - Hộp thư quà + tặng quà (gems, xe tăng) cho tài khoản khác bằng ID.
   - Khi đăng nhập, tiến trình cũ của máy này (chơi khách) được cất đi và trả lại khi bạn đăng xuất.
   Cần máy chủ chạy server.js (cùng máy chủ chơi online). Dùng chung D, S, KEY, save của game. */
(function () {
  const SK = 'twe_account', GUEST = 'tank7x3_guest_backup', FLAG = 'twe_guest_stashed';
  const lg = k => { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch (e) { return null } };
  const ls = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)) } catch (e) { } };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let stopped = false;
  // Khi đang chuyển tài khoản/khách, CHẶN mọi lần ghi vào khóa lưu của game (game tự lưu lúc đóng trang sẽ ghi đè dữ liệu vừa nạp).
  const _setItem = Storage.prototype.setItem, rawSet = (k, v) => _setItem.call(localStorage, k, v);
  Storage.prototype.setItem = function (k, v) { if (stopped && k === KEY && this === localStorage) return; return _setItem.apply(this, arguments) };
  let sess = lg(SK), me = null, baseUrl = null, msg = '', tab = 'login', saveTimer = null, busy = false, lastSent = '', notice = '';

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
    const pref = (lg('twe_account_server') || '');
    if (pref) cand.push(pref);
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
    const headers = { 'Content-Type': 'application/json' }; if (sess && sess.token) headers.Authorization = 'Bearer ' + sess.token;
    const r = await timeoutFetch(b + path, { method: method || 'GET', headers, body: body ? JSON.stringify(body) : undefined, keepalive: !!(opt && opt.keepalive) });
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
    sess = { token, id: m.id, username: m.username, rev: m.rev, server: baseUrl || '' }; persist();
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
      else if (r.code === 401) leaveAccount('Tài khoản của bạn vừa được đăng nhập ở nơi khác nên phiên này đã bị đăng xuất.');
      else if (r.code === 409) syncFromServer('Dữ liệu tài khoản đã thay đổi ở nơi khác (tab/thiết bị khác).');
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

  /* ---------- Khởi động: kiểm tra phiên ---------- */
  async function init() {
    try { notice = sessionStorage.getItem('twe_acct_note') || ''; sessionStorage.removeItem('twe_acct_note') } catch (e) { }
    if (!sess) { badge(); if (notice) { msg = notice; } return }
    try {
      const r = await api('/api/me');
      if (r.code === 401) return leaveAccount('Phiên đăng nhập đã hết hạn hoặc tài khoản được đăng nhập ở nơi khác.');
      if (!r.j.ok) throw new Error(r.j.error);
      me = r.j.me;
      if (me.rev !== sess.rev) { // máy chủ có bản mới hơn => máy chủ thắng
        stopped = true; sess.rev = me.rev; persist(); rawSet(KEY, JSON.stringify(me.save));
        try { sessionStorage.setItem('twe_acct_note', 'Đã tải tiến trình mới nhất từ tài khoản.') } catch (e) { }
        return location.reload();
      }
      badge(); setInterval(poll, 60000);
    } catch (e) { badge(); }
  }
  async function poll() { if (!sess || stopped) return; try { const r = await api('/api/me?lite=1'); if (r.code === 401) return leaveAccount('Tài khoản vừa được đăng nhập ở nơi khác.'); if (r.j.ok) { me = Object.assign(me || {}, r.j.me); badge(); if (!$('acOv').classList.contains('hidden')) render() } } catch (e) { } }
  function badge() {
    const b = document.getElementById('acBtn'); if (!b) return;
    b.innerHTML = sess ? '👤 ' + esc(sess.username) + ' <span style="opacity:.7">#' + sess.id + '</span>' + (me && me.inbox && me.inbox.length ? ' <b style="color:#fbbf24">🎁' + me.inbox.length + '</b>' : '') : '👤 TÀI KHOẢN (đăng nhập)';
  }

  /* ---------- Giao diện ---------- */
  const css = document.createElement('style');
  css.textContent = '#acOv{z-index:26;background:#020617;overflow:auto}#acOv .pn{max-width:620px;width:100%;box-sizing:border-box;text-align:left}#acOv input,#acOv select{font-size:14px;width:100%;box-sizing:border-box;margin:3px 0}' +
    '.acg{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:8px;background:#0f172a;border:1px solid #334155;margin:4px 0}.act{display:flex;gap:6px;margin-bottom:8px}.act button{flex:1;background:#1e293b}.act button.on{background:#7c3aed}';
  document.head.appendChild(css);
  const ov = document.createElement('div'); ov.id = 'acOv'; ov.className = 'ov hidden'; document.body.appendChild(ov);
  const $q = id => document.getElementById(id);
  const setMsg = (t, ok) => { msg = t ? '<div class="pn" style="color:' + (ok ? '#4ade80' : '#fcd34d') + '">' + esc(t) + '</div>' : '' };
  const tkName = k => (S[k] ? S[k].name + ' [' + S[k].tier + ']' : k);
  const giftText = g => g.kind === 'gems' ? '💎 ' + g.amount.toLocaleString() + ' gems' : '🚗 ' + tkName(g.tank);

  function render() {
    if (ov.classList.contains('hidden')) return;
    if (!sess) {
      ov.innerHTML = '<h1 style="font-size:clamp(24px,5vw,40px)">👤 TÀI KHOẢN</h1>' + msg +
        '<div class="pn"><div class="act"><button class="' + (tab === 'login' ? 'on' : '') + '" onclick="TWE_ACCOUNT.tab(\'login\')">ĐĂNG NHẬP</button><button class="' + (tab === 'reg' ? 'on' : '') + '" onclick="TWE_ACCOUNT.tab(\'reg\')">ĐĂNG KÝ</button></div>' +
        '<input id="acU" placeholder="' + (tab === 'login' ? 'Tên đăng nhập hoặc ID' : 'Tên đăng nhập (3-16 ký tự: chữ không dấu, số, _ . -)') + '" maxlength="16" autocomplete="username">' +
        '<input id="acP" type="password" placeholder="Mật khẩu (6-64 ký tự)" autocomplete="' + (tab === 'login' ? 'current-password' : 'new-password') + '" onkeydown="event.stopPropagation();if(event.key===\'Enter\')TWE_ACCOUNT.submit()">' +
        (tab === 'reg' ? '<input id="acP2" type="password" placeholder="Nhập lại mật khẩu" autocomplete="new-password" onkeydown="event.stopPropagation();if(event.key===\'Enter\')TWE_ACCOUNT.submit()">' : '') +
        '<div style="margin-top:8px;text-align:center"><button style="background:#16a34a;padding:10px 24px" onclick="TWE_ACCOUNT.submit()">' + (tab === 'login' ? 'ĐĂNG NHẬP' : 'TẠO TÀI KHOẢN') + '</button></div>' +
        '<div class="mu" style="font-size:12px;margin-top:8px">' + (tab === 'reg' ? 'Tài khoản mới bắt đầu từ đầu với <b>xe tăng mặc định</b>. Bạn nhận một ID số để bạn bè tặng quà.<br>' : '') + 'Tiến trình đang chơi (khách) trên máy này được cất đi và <b>trả lại khi bạn đăng xuất</b>.</div>' +
        '<details style="margin-top:8px"><summary class="mu" style="cursor:pointer;font-size:12px">Máy chủ tài khoản</summary><input id="acSrv" placeholder="để trống = tự nhận (https://ten-may-chu.onrender.com)" value="' + esc(lg('twe_account_server') || '') + '" onchange="TWE_ACCOUNT.setServer(this.value)"></details></div>' +
        '<button class="red" onclick="TWE_ACCOUNT.close()">✕ ĐÓNG</button>';
      return;
    }
    const m = me || { inbox: [], admin: false }, owned = (D.owned || []).filter(k => k !== 'basic' && k !== 'custom' && S[k]);
    const tankList = (m.admin ? Object.keys(S).filter(k => k !== 'basic' && k !== 'custom') : owned).sort((a, b) => S[a].name.localeCompare(S[b].name));
    ov.innerHTML = '<h1 style="font-size:clamp(24px,5vw,40px)">👤 ' + esc(sess.username) + (m.admin ? ' <span style="font-size:14px;color:#fbbf24">QUẢN TRỊ</span>' : '') + '</h1>' + msg +
      '<div class="pn"><div class="acg"><span style="flex:1">ID của bạn<br><b style="font-size:26px;letter-spacing:2px;color:#fcd34d">' + sess.id + '</b></span><button style="background:#334155" onclick="TWE_ACCOUNT.copyId()">📋 Sao chép</button></div>' +
      '<div class="acg"><span style="flex:1">💎 Gems: <b>' + (D.gems || 0).toLocaleString() + '</b> · 🚗 Xe sở hữu: <b>' + (D.owned || []).length + '</b></span></div>' +
      '<div class="mu" style="font-size:11px">Tiến trình được tự động lưu lên máy chủ. Đưa ID cho bạn bè để họ tặng quà cho bạn.</div></div>' +
      '<div class="pn"><b>🎁 Hộp thư quà (' + (m.inbox || []).length + ')</b>' +
      ((m.inbox || []).length ? m.inbox.map(g => '<div class="acg"><span style="flex:1">' + giftText(g) + '<br><span class="mu" style="font-size:11px">từ ' + esc(g.fromName) + ' #' + g.from + ' · ' + new Date(g.t).toLocaleString() + (g.note ? ' · “' + esc(g.note) + '”' : '') + '</span></span></div>').join('') + '<div style="text-align:center;margin-top:6px"><button style="background:#16a34a" onclick="TWE_ACCOUNT.claim()">NHẬN TẤT CẢ QUÀ</button></div>' : '<div class="mu" style="margin-top:4px">Chưa có quà nào.</div>') + '</div>' +
      '<div class="pn"><b>💝 Tặng quà cho bạn bè</b>' + (m.admin ? '<div class="mu" style="font-size:11px;color:#fbbf24">Quản trị: tặng KHÔNG bị trừ, được tặng bất kỳ xe nào.</div>' : '') +
      '<input id="acTo" placeholder="ID người nhận (vd 100002)" maxlength="12" inputmode="numeric" onchange="TWE_ACCOUNT.lookup()">' +
      '<div id="acWho" class="mu" style="font-size:12px;min-height:16px"></div>' +
      '<select id="acKind" onchange="TWE_ACCOUNT.kindChange()"><option value="gems">💎 Gems</option><option value="tank">🚗 Xe tăng</option></select>' +
      '<input id="acAmt" type="number" min="1" placeholder="Số gems">' +
      '<select id="acTank" style="display:none">' + (tankList.length ? tankList.map(k => '<option value="' + k + '">' + esc(tkName(k)) + '</option>').join('') : '<option value="">(bạn chưa có xe nào để tặng)</option>') + '</select>' +
      '<input id="acNote" maxlength="60" placeholder="Lời nhắn (không bắt buộc)">' +
      '<div style="text-align:center;margin-top:6px"><button style="background:#be185d" onclick="TWE_ACCOUNT.gift()">TẶNG QUÀ</button></div></div>' +
      '<div class="pn"><details><summary class="mu" style="cursor:pointer">Đổi mật khẩu</summary><input id="acOld" type="password" placeholder="Mật khẩu cũ" autocomplete="current-password" onkeydown="event.stopPropagation()"><input id="acNew" type="password" placeholder="Mật khẩu mới (6-64 ký tự)" autocomplete="new-password" onkeydown="event.stopPropagation()"><div style="text-align:center"><button onclick="TWE_ACCOUNT.changePw()">ĐỔI MẬT KHẨU</button></div></details></div>' +
      '<div style="display:flex;gap:8px"><button style="background:#334155" onclick="TWE_ACCOUNT.close()">✕ ĐÓNG</button><button class="red" onclick="TWE_ACCOUNT.logout()">ĐĂNG XUẤT</button></div>';
  }
  const busyBtn = on => { ov.querySelectorAll('button').forEach(b => b.disabled = on) };
  const need = f => { const v = ($q(f) || {}).value; return v === undefined ? '' : String(v).trim() };

  async function refreshMe() { const r = await api('/api/me?lite=1'); if (r.j.ok) { me = r.j.me; badge() } return r }
  function applyInventory(j) { // sau khi tặng/nhận: cập nhật kho đồ trong game
    D.gems = j.gems; D.owned = j.owned; if (j.type !== undefined) D.type = j.type; sess.rev = j.rev; persist();
    try { _save() } catch (e) { } lastSent = JSON.stringify(D);
    try { menuInfo() } catch (e) { }
  }

  window.TWE_ACCOUNT = {
    get user() { return sess ? { id: sess.id, username: sess.username } : null },
    open() { ov.classList.remove('hidden'); if (!msg && notice) { setMsg(notice, true); notice = '' } render(); if (sess) refreshMe().then(() => render()).catch(() => { }) },
    close() { ov.classList.add('hidden'); msg = '' },
    tab(t) { tab = t; msg = ''; render() },
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
      busyBtn(true);
      try {
        try { _save() } catch (e) { } // đồng bộ tiến trình hiện tại vào D trước khi gửi
        const r = await api('/api/gift', 'POST', { rev: sess.rev, save: D, to, kind, amount: +amount, tank, note });
        if (r.j.ok) { applyInventory(r.j); await refreshMe(); setMsg('Đã tặng thành công cho ' + r.j.to.username + ' (#' + r.j.to.id + ')', true) }
        else if (r.code === 409) return syncFromServer('Dữ liệu đã thay đổi ở nơi khác.');
        else if (r.code === 401) return leaveAccount('Tài khoản vừa được đăng nhập ở nơi khác.');
        else setMsg(r.j.error);
      } catch (e) { setMsg(e.message) }
      render();
    },
    async claim() {
      busyBtn(true);
      try {
        try { _save() } catch (e) { }
        const r = await api('/api/claim', 'POST', { rev: sess.rev, save: D });
        if (r.j.ok) { applyInventory(r.j); await refreshMe(); setMsg(r.j.claimed.length ? 'Đã nhận: ' + r.j.claimed.map(giftText).join(', ') : 'Không có quà mới', true) }
        else if (r.code === 409) return syncFromServer('Dữ liệu đã thay đổi ở nơi khác.');
        else if (r.code === 401) return leaveAccount('Tài khoản vừa được đăng nhập ở nơi khác.');
        else setMsg(r.j.error);
      } catch (e) { setMsg(e.message) }
      render();
    },
    async changePw() {
      const o = need('acOld'), n = need('acNew'); busyBtn(true);
      try { const r = await api('/api/password', 'POST', { old: o, new: n }); setMsg(r.j.ok ? 'Đã đổi mật khẩu' : r.j.error, r.j.ok) } catch (e) { setMsg(e.message) }
      render();
    }
  };
  init();
})();
