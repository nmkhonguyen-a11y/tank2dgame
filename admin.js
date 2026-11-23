/* eslint-disable */
/* Tank Warfare: Evolution — CÔNG CỤ QUẢN TRỊ (chỉ tài khoản admin)
   A) Bảng quản trị (cần NHẬP LẠI MẬT KHẨU): tra cứu/chỉnh sửa mọi tài khoản, đặt lại mật khẩu, khóa/cấm chat, mã quà,
      đăng/gỡ xe lên cửa hàng, thông báo toàn máy chủ, lệnh lên người chơi online, sao lưu/khôi phục, tải danh sách .docx.
   B) Công cụ trong game (phím F2): bay/xuyên tường, bất tử, vô hạn gems/EXP, chỉnh chỉ số, dịch chuyển, tàng hình, triệu hồi,
      quét sạch, khung va chạm, ngày/đêm + mưa, bảng lệnh.
   Quyền thật sự được máy chủ kiểm tra; phần công cụ trong game chỉ chạy ở máy của chính admin. */
(function () {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TIERS = ['C', 'B', 'A', 'S', 'SS', 'SSS', 'SSSS', 'SSSSS', 'ULTRA', 'HYPER', 'MYTHIC'];
  const AC = () => window.TWE_ACCOUNT, isAdm = () => !!(AC() && AC().isAdmin);
  const $q = id => document.getElementById(id);
  const ADM = window.TWE_ADM = { noclip: false, god: false, infGems: false, infExp: false, speed: 1, dmg: 1, rate: 1, invisible: false, hitbox: false, night: false, rain: false };
  let admTok = '', admExp = 0, tab = 'users', msg = '', users = [], total = 0, sel = null, codes = [], shop = [], backups = [], lastQ = '';

  /* ================= A) BẢNG QUẢN TRỊ ================= */
  const css = document.createElement('style');
  css.textContent = '#admOv{z-index:27;background:#020617;overflow:auto}#admOv .pn{max-width:900px;width:100%;box-sizing:border-box;text-align:left}#admOv input,#admOv select{font-size:13px;box-sizing:border-box;margin:2px 0;max-width:100%}' +
    '#admOv table{width:100%;border-collapse:collapse;font-size:12px}#admOv td,#admOv th{padding:4px 6px;border-bottom:1px solid #1e293b;text-align:left}#admOv th{color:#94a3b8}.adr{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:4px 0}.adr>*{flex:0 1 auto}' +
    '#admTools{position:fixed;left:8px;top:90px;z-index:28;width:300px;max-height:calc(100vh - 110px);overflow:auto;background:rgba(2,6,23,.94);border:1px solid #f59e0b;border-radius:12px;padding:8px;font-size:12px}#admTools button{padding:4px 8px;font-size:12px;margin:2px}#admTools .on{background:#16a34a}#admTools input{width:70px;font-size:12px}#admCon{width:100%;font-size:12px;box-sizing:border-box}#admLog{background:#0b1220;border-radius:6px;padding:4px;height:90px;overflow:auto;font-family:monospace;font-size:11px;white-space:pre-wrap}';
  document.head.appendChild(css);
  const ov = document.createElement('div'); ov.id = 'admOv'; ov.className = 'ov hidden'; document.body.appendChild(ov);
  const setMsg = (t, ok) => { msg = t ? '<div class="pn" style="color:' + (ok ? '#4ade80' : '#fcd34d') + ';word-break:break-word">' + t + '</div>' : '' };
  const allKeys = () => Object.keys(S).sort((a, b) => S[a].name.localeCompare(S[b].name));
  const tankOpts = (selK, none) => (none ? '<option value="">' + none + '</option>' : '') + allKeys().map(k => '<option value="' + k + '"' + (k === selK ? ' selected' : '') + '>' + esc(S[k].name) + ' [' + S[k].tier + '] ' + k + '</option>').join('');
  const gunOpts = none => (none ? '<option value="">' + none + '</option>' : '') + Object.keys(DGUN).map(k => '<option value="' + k + '">' + esc(DGUN[k]) + ' (' + k + ')</option>').join('');
  const val = id => { const e = $q(id); return e ? String(e.value).trim() : '' };
  const fdate = t => t ? new Date(t).toLocaleString() : '—';

  async function A(path, body, raw) { // gọi API quản trị kèm mã mở khóa
    if (!admTok || admExp < Date.now()) { admTok = ''; throw new Error('LOCKED') }
    const r = await AC().api(path, body === undefined ? 'GET' : 'POST', body, { headers: { 'X-Admin': admTok }, raw });
    if (raw) return r;
    if (r.code === 401 && r.j.locked) { admTok = ''; throw new Error('LOCKED') }
    if (!r.j.ok) throw new Error(r.j.error || 'Lỗi');
    return r.j;
  }
  const run = async fn => { try { await fn() } catch (e) { if (e.message === 'LOCKED') { setMsg('Phiên quản trị đã khóa, hãy nhập lại mật khẩu.'); } else setMsg(esc(e.message)) } render() };

  function render() {
    if (ov.classList.contains('hidden')) return;
    if (!isAdm()) { ov.innerHTML = '<h1>🛠️ QUẢN TRỊ</h1><div class="pn">Chỉ tài khoản admin (3 tài khoản đăng ký đầu tiên) mới dùng được.</div><button class="red" onclick="TWE_ADMIN.close()">ĐÓNG</button>'; return }
    if (!admTok || admExp < Date.now()) {
      ov.innerHTML = '<h1 style="font-size:clamp(24px,5vw,40px)">🛠️ BẢNG QUẢN TRỊ</h1>' + msg + '<div class="pn" style="max-width:420px"><b>🔒 Nhập mật khẩu tài khoản của bạn để mở</b><div class="mu" style="font-size:11px">Phiên mở khóa kéo dài 20 phút. Mật khẩu của người chơi được lưu dạng băm một chiều nên <b>không ai xem được</b>; bạn chỉ có thể đặt mật khẩu mới cho họ.</div>' +
        '<input id="adPw" type="password" placeholder="Mật khẩu của bạn (' + esc(AC().user.username) + ')" style="width:100%" autocomplete="current-password" onkeydown="event.stopPropagation();if(event.key===\'Enter\')TWE_ADMIN.unlock()"><div style="text-align:center;margin-top:6px"><button style="background:#b45309" onclick="TWE_ADMIN.unlock()">MỞ KHÓA</button></div></div><button class="red" onclick="TWE_ADMIN.close()">✕ ĐÓNG</button>';
      return;
    }
    const tabs = [['users', '👥 Tài khoản'], ['codes', '🎟️ Mã quà'], ['shop', '🛒 Cửa hàng'], ['sys', '📡 Hệ thống'], ['tools', '🎮 Công cụ game']];
    let body = '';
    if (tab === 'users') body = usersHtml(); else if (tab === 'codes') body = codesHtml(); else if (tab === 'shop') body = shopHtml(); else if (tab === 'sys') body = sysHtml(); else body = '<div class="pn"><b>🎮 Công cụ trong game</b><div class="mu">Mở bảng công cụ bay/xuyên tường, bất tử, vô hạn, dịch chuyển, triệu hồi, bảng lệnh... Trong lúc chơi bấm <b>F2</b> để bật/tắt.</div><div style="text-align:center;margin-top:8px"><button style="background:#16a34a" onclick="TWE_ADMIN.tools(true)">MỞ BẢNG CÔNG CỤ</button></div></div>';
    ov.innerHTML = '<h1 style="font-size:clamp(22px,4vw,34px)">🛠️ QUẢN TRỊ · ' + esc(AC().user.username) + ' #' + AC().user.id + '</h1>' + msg +
      '<div class="pn" style="padding:6px"><div style="display:flex;gap:6px;flex-wrap:wrap">' + tabs.map(t => '<button style="' + (tab === t[0] ? 'background:#7c3aed' : 'background:#1e293b') + '" onclick="TWE_ADMIN.tab(\'' + t[0] + '\')">' + t[1] + '</button>').join('') + '<button class="red" style="margin-left:auto" onclick="TWE_ADMIN.close()">✕ ĐÓNG</button></div></div>' + body;
  }

  function usersHtml() {
    const flag = u => [u.admin ? '<span style="color:#fbbf24">ADMIN</span>' : '', u.ban ? '<span style="color:#f87171">KHÓA</span>' : '', u.muted ? '<span style="color:#fb923c">CẤM CHAT</span>' : ''].filter(Boolean).join(' ') || '<span class="mu">bình thường</span>';
    let h = '<div class="pn"><div class="adr"><input id="adQ" placeholder="🔍 Tìm tên tài khoản hoặc ID" value="' + esc(lastQ) + '" style="flex:1;min-width:200px" onkeydown="event.stopPropagation();if(event.key===\'Enter\')TWE_ADMIN.search()"><button style="background:#0ea5e9" onclick="TWE_ADMIN.search()">TÌM</button><button style="background:#1d4ed8" onclick="TWE_ADMIN.docx()">📄 TẢI DANH SÁCH .DOCX</button></div>' +
      '<div class="mu" style="font-size:11px">Tổng: ' + total + ' tài khoản' + (total > users.length ? ' (hiện ' + users.length + ' đầu tiên, hãy thu hẹp bằng ô tìm kiếm)' : '') + '. File .docx không chứa mật khẩu.</div>' +
      '<div style="overflow:auto;max-height:260px"><table><tr><th>ID</th><th>Tên</th><th>Cấp</th><th>Gems</th><th>Xe</th><th>Trạng thái</th><th></th></tr>' +
      users.map(u => '<tr><td><b>' + u.id + '</b></td><td>' + esc(u.username) + '</td><td>' + u.level + '</td><td>' + u.gems.toLocaleString() + '</td><td>' + u.tanks + '</td><td>' + flag(u) + '</td><td><button style="padding:2px 8px" onclick="TWE_ADMIN.open_user(\'' + u.id + '\')">MỞ</button></td></tr>').join('') + '</table></div></div>';
    if (!sel) return h;
    const u = sel, sv = u.save || {}, own = sv.owned || [];
    h += '<div class="pn" style="border-color:#f59e0b"><b style="font-size:16px">👤 ' + esc(u.username) + ' · ID ' + u.id + '</b> ' + flag(u) + '<div class="mu" style="font-size:11px">Tạo: ' + fdate(u.created) + ' · Thấy lần cuối: ' + fdate(u.seen) + ' · IP: ' + esc(u.ip || '—') + ' · phiên bản dữ liệu ' + u.rev + '</div>' +
      '<div class="adr"><label>💎 Gems <input id="aeG" type="number" value="' + (sv.gems || 0) + '" style="width:130px"></label><label>Cấp <input id="aeL" type="number" value="' + (sv.level || 1) + '" style="width:80px"></label><label>+EXP <input id="aeE" type="number" value="0" style="width:120px"></label><label>Xe đang dùng <select id="aeT">' + tankOpts(sv.type) + '</select></label><button style="background:#16a34a" onclick="TWE_ADMIN.saveUser()">LƯU CHỈNH SỬA</button><button style="background:#b45309" onclick="TWE_ADMIN.maxUser()">∞ VÔ HẠN (1.000 tỷ gems + 1 tỷ EXP)</button></div>' +
      '<div class="mu" style="margin-top:4px"><b>🚗 Túi xe (' + own.length + ')</b> — bấm ✕ để lấy lại</div><div style="max-height:90px;overflow:auto;display:flex;flex-wrap:wrap;gap:4px">' + own.map(k => '<span class="acg" style="padding:2px 6px;margin:0;font-size:11px">' + esc(S[k] ? S[k].name : k) + (k !== 'basic' ? ' <a href="#" style="color:#f87171" onclick="TWE_ADMIN.takeTank(\'' + k + '\');return false">✕</a>' : '') + '</span>').join('') + '</div>' +
      '<div class="adr"><select id="aeAT" style="max-width:260px">' + tankOpts('', '— chọn xe để cấp —') + '</select><button onclick="TWE_ADMIN.giveTank()">➕ CẤP XE</button><select id="aeAG">' + gunOpts('— súng drone —') + '</select><button onclick="TWE_ADMIN.giveGun()">➕ CẤP SÚNG</button></div>' +
      '<div class="mu" style="font-size:11px">Súng drone đang có: ' + ((sv.dguns || []).map(k => esc(DGUN[k] || k)).join(', ') || 'không') + '</div>' +
      '<hr style="border-color:#1e293b"><div class="adr"><b>🔑 Mật khẩu</b><span class="mu" style="font-size:11px">(không xem được mật khẩu cũ — chỉ đặt mới)</span><input id="aeP" placeholder="mật khẩu mới (để trống = tự tạo)" style="width:200px"><button style="background:#b45309" onclick="TWE_ADMIN.resetPw()">ĐẶT LẠI MẬT KHẨU</button></div>' +
      (u.admin ? '' : '<div class="adr"><b>⛔ Khóa</b><input id="abH" type="number" placeholder="giờ (0=vĩnh viễn)" style="width:130px"><input id="abR" placeholder="lý do" style="width:160px"><label><input type="checkbox" id="abI"> khóa cả IP</label><button class="red" onclick="TWE_ADMIN.ban(1)">KHÓA</button><button style="background:#16a34a" onclick="TWE_ADMIN.ban(0)">MỞ KHÓA</button></div>' +
        '<div class="adr"><b>🔇 Cấm chat</b><input id="amM" type="number" placeholder="phút (0=vĩnh viễn)" style="width:150px"><button class="red" onclick="TWE_ADMIN.mute(1)">CẤM CHAT</button><button style="background:#16a34a" onclick="TWE_ADMIN.mute(0)">BỎ CẤM</button></div>') +
      '<div class="mu" style="font-size:11px">Hộp thư: ' + (u.inbox || []).length + ' quà chưa nhận.</div></div>';
    return h;
  }
  function codesHtml() {
    return '<div class="pn"><b>🎟️ Tạo code nhận thưởng</b><div class="adr"><input id="cdC" placeholder="Code (để trống = tự tạo)" maxlength="24" style="width:180px"><label>💎 <input id="cdG" type="number" min="0" value="0" style="width:110px"></label><label>EXP <input id="cdE" type="number" min="0" value="0" style="width:110px"></label></div>' +
      '<div class="adr"><select id="cdT" style="max-width:280px">' + tankOpts('', '🚗 (không tặng xe)') + '</select><select id="cdU">' + gunOpts('🔫 (không tặng súng drone)') + '</select></div>' +
      '<div class="adr"><label>Hết hạn lúc <input id="cdX" type="datetime-local"></label><span class="mu">hoặc</span><label>sau <input id="cdD" type="number" min="0" value="0" style="width:70px"> ngày</label><label>Số lượt tối đa <input id="cdM" type="number" min="0" value="0" style="width:80px"> <span class="mu" style="font-size:11px">(0 = không giới hạn)</span></label></div>' +
      '<div style="text-align:center"><button style="background:#16a34a" onclick="TWE_ADMIN.makeCode()">TẠO CODE</button></div></div>' +
      '<div class="pn"><b>📋 Danh sách code (' + codes.length + ')</b><div style="overflow:auto;max-height:300px"><table><tr><th>Code</th><th>Thưởng</th><th>Hết hạn</th><th>Đã dùng</th><th></th></tr>' +
      codes.map(c => { const r = c.reward || {}, ex = c.expires && c.expires < Date.now(); return '<tr><td><b>' + esc(c.code) + '</b></td><td>' + [r.gems ? '💎' + r.gems : '', r.exp ? r.exp + ' EXP' : '', r.tank ? '🚗' + esc(S[r.tank] ? S[r.tank].name : r.tank) : '', r.gun ? '🔫' + esc(DGUN[r.gun] || r.gun) : ''].filter(Boolean).join(' ') + '</td><td style="' + (ex ? 'color:#f87171' : '') + '">' + (c.expires ? fdate(c.expires) + (ex ? ' (đã hết)' : '') : 'không hết hạn') + '</td><td>' + c.used.length + (c.max ? '/' + c.max : '') + '</td><td><button class="red" style="padding:2px 8px" onclick="TWE_ADMIN.delCode(\'' + esc(c.code) + '\')">XÓA</button></td></tr>' }).join('') + '</table></div></div>';
  }
  function shopHtml() {
    const gar = D.garage || [];
    return '<div class="pn"><b>🛒 Đăng xe tăng lên cửa hàng</b><div class="mu" style="font-size:12px">Tạo xe bằng nút <b>🔧 XE TĂNG TỰ TẠO</b> ở menu (mã <b>newtank</b>) — xe nằm trong "Kho xe đã tạo". Chọn thiết kế bên dưới rồi đặt tên, tier và giá.</div>' +
      (gar.length ? '<div class="adr"><select id="shD" style="max-width:240px" onchange="TWE_ADMIN.shopPick()">' + gar.map((g, i) => '<option value="' + i + '">' + esc(g.name || 'Xe ' + g.gid) + '</option>').join('') + '</select><input id="shN" placeholder="Tên hiển thị" maxlength="30" value="' + esc(gar[0].name || '') + '" style="width:180px"><select id="shT">' + TIERS.map(t => '<option' + (t === 'S' ? ' selected' : '') + '>' + t + '</option>').join('') + '</select><label>💎 <input id="shP" type="number" min="0" value="1000" style="width:110px"></label><button style="background:#16a34a" onclick="TWE_ADMIN.shopAdd()">ĐĂNG LÊN CỬA HÀNG</button></div>' : '<div class="pn" style="color:#fcd34d">Bạn chưa có thiết kế nào trong kho xe. Hãy tạo xe bằng "XE TĂNG TỰ TẠO" trước.</div>') + '</div>' +
      '<div class="pn"><b>📋 Xe do admin đăng (' + shop.length + ')</b><div style="overflow:auto;max-height:320px"><table><tr><th>Xe</th><th>Tier</th><th>Giá</th><th>Đăng bởi</th><th></th></tr>' +
      shop.map(s => '<tr style="' + (s.hidden ? 'opacity:.5' : '') + '"><td><b>' + esc(s.name) + '</b><br><span class="mu" style="font-size:10px">' + s.key + (s.hidden ? ' · ĐÃ GỠ' : '') + '</span></td><td>' + s.tier + '</td><td><input type="number" value="' + s.price + '" id="sp_' + s.key + '" style="width:90px"> <button style="padding:2px 6px" onclick="TWE_ADMIN.shopPrice(\'' + s.key + '\')">Đổi giá</button></td><td>' + esc(s.by) + '</td><td>' + (s.hidden ? '' : '<button class="red" style="padding:2px 8px" onclick="TWE_ADMIN.shopDel(\'' + s.key + '\')">GỠ KHỎI CỬA HÀNG</button>') + '</td></tr>').join('') + '</table></div><div class="mu" style="font-size:11px">Gỡ khỏi cửa hàng: không bán nữa nhưng người đã mua vẫn giữ và dùng được xe.</div></div>';
  }
  function sysHtml() {
    return '<div class="pn"><b>📢 Thông báo toàn máy chủ</b><div class="adr"><input id="syM" maxlength="200" placeholder="Nội dung thông báo hiện cho mọi người đang online" style="flex:1;min-width:240px"><button style="background:#0ea5e9" onclick="TWE_ADMIN.announce()">GỬI</button></div></div>' +
      '<div class="pn"><b>🎯 Lệnh lên người chơi đang online</b><div class="adr"><input id="syA" placeholder="ID tài khoản" style="width:130px"><button onclick="TWE_ADMIN.cmd(\'freeze\')">🧊 Đóng băng 8s</button><button onclick="TWE_ADMIN.cmd(\'tpme\')">🧲 Kéo về chỗ tôi</button><button class="red" onclick="TWE_ADMIN.cmd(\'kick\')">👢 Đuổi khỏi máy chủ</button></div><div class="mu" style="font-size:11px">Dịch chuyển "kéo về chỗ tôi" dùng vị trí hiện tại của bạn trong trận. Cấm chat / khóa tài khoản: vào tab Tài khoản.</div></div>' +
      '<div class="pn"><b>💾 Sao lưu / khôi phục dữ liệu máy chủ</b><div class="adr"><button style="background:#16a34a" onclick="TWE_ADMIN.backup()">TẠO BẢN SAO LƯU NGAY</button><button onclick="TWE_ADMIN.loadBackups()">🔄 Tải danh sách</button></div>' +
      (backups.length ? '<table><tr><th>Bản sao lưu</th><th>Thời gian</th><th></th></tr>' + backups.map(b => '<tr><td>' + esc(b.name) + '</td><td>' + fdate(b.t) + '</td><td><button class="red" style="padding:2px 8px" onclick="TWE_ADMIN.restore(\'' + esc(b.name) + '\')">KHÔI PHỤC</button></td></tr>').join('') + '</table>' : '<div class="mu">Chưa tải / chưa có bản sao lưu.</div>') +
      '<div class="mu" style="font-size:11px">Khôi phục sẽ đưa MỌI tài khoản về thời điểm sao lưu (trạng thái hiện tại được sao lưu tự động trước khi khôi phục).</div></div>';
  }

  window.TWE_ADMIN = {
    open() { ov.classList.remove('hidden'); msg = ''; render(); if (admTok && admExp > Date.now()) run(async () => { if (!users.length) await this.search(true) }) },
    close() { ov.classList.add('hidden') },
    onLogin() { },
    tab(t) { tab = t; msg = ''; sel = null; render(); if (t === 'codes') run(async () => { codes = (await A('/api/admin/codes', { action: 'list' })).codes }); if (t === 'shop') run(async () => { shop = (await A('/api/admin/shop', { action: 'list' })).shop }); if (t === 'sys') this.loadBackups() },
    async unlock() {
      const pw = val('adPw'); if (!pw) return;
      try { const r = await AC().api('/api/admin/unlock', 'POST', { password: pw }); if (!r.j.ok) { setMsg(esc(r.j.error || 'Lỗi')); return render() } admTok = r.j.admToken; admExp = r.j.expires; msg = ''; render(); this.search(true) } catch (e) { setMsg(esc(e.message)); render() }
    },
    async search(silent) { if (!silent) lastQ = val('adQ'); await run(async () => { const r = await A('/api/admin/users', { q: lastQ, limit: 100 }); users = r.users; total = r.total }) },
    async docx() {
      lastQ = val('adQ') || lastQ;
      try {
        const r = await A('/api/admin/export?q=' + encodeURIComponent(lastQ), undefined, true);
        if (r.status !== 200) { let j = {}; try { j = await r.json() } catch (e) { } throw new Error(j.error || 'Không tải được file') }
        const blob = await r.blob(), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'tai-khoan.docx'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 500);
        setMsg('Đã tải tai-khoan.docx', true);
      } catch (e) { setMsg(e.message === 'LOCKED' ? 'Phiên quản trị đã khóa, hãy nhập lại mật khẩu.' : esc(e.message)) }
      render();
    },
    open_user(id) { run(async () => { sel = (await A('/api/admin/user', { id })).user }) },
    async patch(p) { await run(async () => { const r = await A('/api/admin/edit', { id: sel.id, patch: p }); sel = Object.assign(sel, r.user); const i = users.findIndex(x => x.id === sel.id); if (i >= 0) users[i] = Object.assign(users[i], r.user); setMsg('Đã cập nhật ' + esc(sel.username) + '. Người chơi sẽ tự đồng bộ dữ liệu mới.', true) }) },
    saveUser() { this.patch({ gems: +val('aeG'), level: +val('aeL'), addExp: +val('aeE') || 0, type: val('aeT') }) },
    maxUser() { if (confirm('Đặt gems 1.000 tỷ và +1 tỷ EXP cho ' + sel.username + '?')) this.patch({ gems: 1e12, addExp: 1e9 }) },
    giveTank() { if (val('aeAT')) this.patch({ addTanks: [val('aeAT')] }) },
    takeTank(k) { if (confirm('Lấy lại xe này của người chơi?')) this.patch({ removeTanks: [k] }) },
    giveGun() { if (val('aeAG')) this.patch({ addGuns: [val('aeAG')] }) },
    async resetPw() { if (!confirm('Đặt lại mật khẩu cho ' + sel.username + '? Họ sẽ bị đăng xuất.')) return; await run(async () => { const r = await A('/api/admin/resetpw', { id: sel.id, password: val('aeP') }); setMsg('Mật khẩu mới của <b>' + esc(r.username) + '</b> (#' + r.id + '): <b style="font-size:18px;user-select:all">' + esc(r.password) + '</b> — hãy gửi cho họ rồi bảo họ đổi lại.', true) }) },
    async ban(on) { await run(async () => { const r = await A('/api/admin/ban', { id: sel.id, ban: !!on, hours: +val('abH') || 0, reason: val('abR'), ip: !!($q('abI') && $q('abI').checked) }); Object.assign(sel, r.user); setMsg(on ? 'Đã khóa tài khoản.' : 'Đã mở khóa.', true); await this.search(true) }) },
    async mute(on) { await run(async () => { const r = await A('/api/admin/mute', { id: sel.id, mute: !!on, minutes: +val('amM') || 0 }); Object.assign(sel, r.user); setMsg(on ? 'Đã cấm chat.' : 'Đã bỏ cấm chat.', true) }) },
    async makeCode() {
      await run(async () => {
        const x = val('cdX'); const body = { action: 'create', code: val('cdC'), reward: { gems: +val('cdG') || 0, exp: +val('cdE') || 0, tank: val('cdT'), gun: val('cdU') }, max: +val('cdM') || 0 };
        if (x) body.expires = new Date(x).getTime(); else if (+val('cdD') > 0) body.days = +val('cdD');
        const r = await A('/api/admin/codes', body); codes = (await A('/api/admin/codes', { action: 'list' })).codes; setMsg('Đã tạo code: <b style="font-size:18px;user-select:all">' + esc(r.code.code) + '</b>', true);
      });
    },
    async delCode(c) { await run(async () => { codes = (await A('/api/admin/codes', { action: 'delete', code: c })).codes; setMsg('Đã xóa code ' + esc(c), true) }) },
    shopPick() { const g = (D.garage || [])[+val('shD')]; if (g && $q('shN')) $q('shN').value = g.name || '' },
    async shopAdd() {
      await run(async () => {
        const g = (D.garage || [])[+val('shD')]; if (!g) throw new Error('Chọn thiết kế');
        shop = (await A('/api/admin/shop', { action: 'add', name: val('shN') || g.name, tier: val('shT'), price: +val('shP'), design: JSON.parse(JSON.stringify(g)) })).shop;
        setMsg('Đã đăng lên cửa hàng. Người chơi sẽ thấy khi tải lại trang.', true);
        const r = await AC().api('/api/shop'); if (r.j.ok) { try { localStorage.setItem('twe_catalog', JSON.stringify(r.j.shop)) } catch (e) { } }
      });
    },
    async shopPrice(k) { await run(async () => { shop = (await A('/api/admin/shop', { action: 'price', key: k, price: +val('sp_' + k) })).shop; setMsg('Đã đổi giá.', true) }) },
    async shopDel(k) { if (!confirm('Gỡ xe này khỏi cửa hàng?')) return; await run(async () => { shop = (await A('/api/admin/shop', { action: 'delete', key: k })).shop; setMsg('Đã gỡ khỏi cửa hàng.', true) }) },
    async announce() { await run(async () => { await A('/api/admin/announce', { m: val('syM') }); setMsg('Đã gửi thông báo.', true) }) },
    async cmd(c) {
      const aid = val('syA'); if (!aid) { setMsg('Nhập ID tài khoản'); return render() }
      await run(async () => {
        const body = { aid, cmd: c === 'tpme' ? 'tp' : c, ms: 8000 };
        if (c === 'tpme') { if (typeof player === 'undefined' || !player) throw new Error('Bạn phải đang trong trận để kéo người chơi về chỗ mình'); body.x = player.x; body.y = player.y }
        await A('/api/admin/cmd', body); setMsg('Đã gửi lệnh.', true);
      });
    },
    async loadBackups() { await run(async () => { backups = (await A('/api/admin/backup', { action: 'list' })).backups }) },
    async backup() { await run(async () => { const r = await A('/api/admin/backup', { action: 'create' }); backups = r.backups; setMsg('Đã tạo bản sao lưu ' + esc(r.name), true) }) },
    async restore(n) { if (!confirm('KHÔI PHỤC dữ liệu về bản "' + n + '"? Mọi thay đổi sau thời điểm đó sẽ mất (đã có bản sao lưu tự động trước đó).')) return; await run(async () => { const r = await A('/api/admin/backup', { action: 'restore', name: n }); setMsg('Đã khôi phục ' + esc(n) + ' (' + r.accounts + ' tài khoản).', true); users = []; await this.search(true) }) },
    tools(show) { toolsToggle(show) }
  };

  /* ================= B) CÔNG CỤ TRONG GAME (F2) ================= */
  let logBuf = 'Gõ "help" để xem lệnh.\n';
  const box = document.createElement('div'); box.id = 'admTools'; box.style.display = 'none'; document.body.appendChild(box);
  const clampXY = (x, y) => [Math.max(40, Math.min(MAP - 40, x)), Math.max(40, Math.min(MAP - 40, y))];
  const live = () => typeof player !== 'undefined' && player && typeof running !== 'undefined' && running;
  function log(t) { logBuf += t + '\n'; if (logBuf.length > 4000) logBuf = logBuf.slice(-3000); const l = $q('admLog'); if (l) { l.textContent = logBuf; l.scrollTop = 1e9 } }
  function toolsHtml() {
    const tg = (k, l) => '<button class="' + (ADM[k] ? 'on' : '') + '" onclick="TWE_ADM_UI.tog(\'' + k + '\')">' + l + '</button>';
    const near = (typeof enemies !== 'undefined' ? enemies : []).filter(e => !e.dead && (e.label || e.nm)).slice(0, 40);
    return '<div style="display:flex;justify-content:space-between"><b style="color:#f59e0b">🎮 CÔNG CỤ ADMIN</b><a href="#" onclick="TWE_ADMIN.tools(false);return false" style="color:#f87171">✕ (F2)</a></div>' +
      '<div>' + tg('noclip', '🕊️ Bay/xuyên tường') + tg('god', '🛡️ Bất tử') + tg('invisible', '👻 Tàng hình') + tg('hitbox', '🔲 Khung va chạm') + tg('infGems', '💎 Vô hạn gems') + tg('infExp', '⭐ Vô hạn EXP') + tg('night', '🌙 Đêm') + tg('rain', '🌧️ Mưa') + '<button style="background:#b45309" onclick="TWE_ADM_UI.all()">♾️ VÔ HẠN TẤT CẢ</button></div>' +
      '<hr style="border-color:#334155"><b>⚙️ Chỉ số</b><div>Tốc độ ×<input id="adS" type="number" step="0.5" value="' + ADM.speed + '"> Sát thương ×<input id="adD" type="number" step="0.5" value="' + ADM.dmg + '"> Tốc bắn ×<input id="adR" type="number" step="0.5" value="' + ADM.rate + '"> <button onclick="TWE_ADM_UI.stats()">ÁP DỤNG</button></div>' +
      '<div><button onclick="TWE_ADM_UI.lv(10)">+10 cấp</button><button onclick="TWE_ADM_UI.lv(100)">+100 cấp</button><button onclick="TWE_ADM_UI.lv(1000)">+1000 cấp</button><button onclick="TWE_ADM_UI.maxst()">Tối đa chỉ số</button><button onclick="TWE_ADM_UI.heal()">Hồi máu</button></div>' +
      '<hr style="border-color:#334155"><b>📍 Dịch chuyển</b><div>X<input id="adX" type="number" value="' + (live() ? Math.round(player.x) : 0) + '"> Y<input id="adY" type="number" value="' + (live() ? Math.round(player.y) : 0) + '"> <button onclick="TWE_ADM_UI.tp()">ĐI</button><button onclick="TWE_ADM_UI.center()">Giữa bản đồ</button></div>' +
      '<div><select id="adE" style="max-width:190px"><option value="">— tới người/quái —</option>' + near.map((e, i) => '<option value="' + i + '">' + esc(e.label || e.nm) + '</option>').join('') + '</select><button onclick="TWE_ADM_UI.tpe()">TỚI</button></div>' +
      '<hr style="border-color:#334155"><b>👹 Triệu hồi / dọn</b><div><input id="adN" type="number" value="5" style="width:50px"> <button onclick="TWE_ADM_UI.spawn(false)">Quái</button><button onclick="TWE_ADM_UI.spawn(true)">BOSS</button><button class="red" onclick="TWE_ADM_UI.kill()">☢️ QUÉT SẠCH</button></div>' +
      '<hr style="border-color:#334155"><b>⌨️ Bảng lệnh</b><input id="admCon" placeholder="gõ lệnh, vd: help" onkeydown="event.stopPropagation();if(event.key===\'Enter\')TWE_ADM_UI.con(this)"><div id="admLog">' + esc(logBuf) + '</div>';
  }
  function toolsToggle(show) {
    if (!isAdm()) return;
    const on = show === undefined ? box.style.display === 'none' : !!show;
    box.style.display = on ? '' : 'none'; if (on) { box.innerHTML = toolsHtml(); const l = $q('admLog'); if (l) l.scrollTop = 1e9 }
  }
  addEventListener('keydown', e => { if (e.code === 'F2' && isAdm()) { e.preventDefault(); toolsToggle() } }, true);
  const refreshBox = () => { if (box.style.display !== 'none') { const c = $q('admCon') ? $q('admCon').value : ''; box.innerHTML = toolsHtml(); if ($q('admCon')) $q('admCon').value = c } };

  function summon(n, boss) {
    if (!live()) return 0; let k = 0;
    for (let i = 0; i < n; i++) {
      let e; try { e = new Enemy() } catch (x) { continue } if (!e || e.dead) continue;
      const a = rnd(0, 6.28), d = rnd(250, 600); [e.x, e.y] = clampXY(player.x + Math.cos(a) * d, player.y + Math.sin(a) * d); if (typeof hitWall === 'function' && hitWall(e.x, e.y, 30)) { e.x = player.x + 200; e.y = player.y }
      if (boss) { e.maxHp *= 25; e.hp = e.maxHp; e.dmg *= 3; e.r = (e.r || 26) * 1.5; e.label = '👹 BOSS ' + (e.nm || ''); e.exp = (e.exp || 100) * 20 }
      enemies.push(e); k++;
    }
    return k;
  }
  function killAll() { let n = 0; enemies.forEach(e => { if (!e.net && !e.dead) { e.dead = true; n++ } }); proj = proj.filter(p => p.own === player); traps = traps.filter(t => t.own === player); return n }
  const U = window.TWE_ADM_UI = {
    tog(k) { ADM[k] = !ADM[k]; if (k === 'noclip') log('Xuyên tường: ' + (ADM.noclip ? 'BẬT' : 'TẮT')); refreshBox() },
    all() { const on = !(ADM.god && ADM.infGems && ADM.infExp); ADM.god = ADM.infGems = ADM.infExp = on; if (on) { ADM.speed = Math.max(ADM.speed, 2) } refreshBox(); log(on ? '♾️ Đã bật VÔ HẠN: bất tử, gems, EXP' : 'Đã tắt vô hạn') },
    stats() { ADM.speed = +val('adS') || 1; ADM.dmg = +val('adD') || 1; ADM.rate = +val('adR') || 1; if (live()) { try { player.recalc() } catch (e) { } } log('Đã áp dụng chỉ số') },
    lv(n) { if (live()) player.addLevels(n); else log('Cần đang trong trận') },
    maxst() { if (!live()) return log('Cần đang trong trận'); for (const k in player.st) player.st[k] = player.cap[k] || player.st[k]; player.recalc(); player.hp = player.maxHp; log('Đã tối đa chỉ số') },
    heal() { if (live()) player.hp = player.maxHp },
    tp() { if (!live()) return; [player.x, player.y] = clampXY(+val('adX'), +val('adY')); log('Dịch chuyển tới ' + Math.round(player.x) + ',' + Math.round(player.y)) },
    center() { if (live()) { player.x = player.y = MAP / 2 } },
    tpe() { const i = val('adE'); if (i === '' || !live()) return; const e = enemies.filter(e => !e.dead && (e.label || e.nm)).slice(0, 40)[+i]; if (e) { [player.x, player.y] = clampXY(e.x + 80, e.y); log('Tới ' + (e.label || e.nm)) } },
    spawn(boss) { log('Đã triệu hồi ' + summon(Math.max(1, +val('adN') || 1), boss) + (boss ? ' boss' : ' quái')) },
    kill() { log('Đã quét sạch ' + killAll() + ' mục tiêu') },
    con(inp) {
      const line = inp.value.trim(); inp.value = ''; if (!line) return; log('> ' + line);
      const [c, ...a] = line.split(/\s+/), n = +a[0];
      try {
        switch (c.toLowerCase()) {
          case 'help': log('god noclip invis hitbox night rain inf | speed N | dmg N | rate N | gems N | exp N | level N | hp | max | tp X Y | spawn N | boss | killall | tank KEY | give KEY | js CODE'); break;
          case 'god': U.tog('god'); break; case 'noclip': case 'fly': U.tog('noclip'); break; case 'invis': U.tog('invisible'); break; case 'hitbox': U.tog('hitbox'); break; case 'night': U.tog('night'); break; case 'rain': U.tog('rain'); break; case 'inf': U.all(); break;
          case 'speed': ADM.speed = n || 1; break; case 'dmg': ADM.dmg = n || 1; break; case 'rate': ADM.rate = n || 1; break;
          case 'gems': D.gems = Math.max(0, n || 0); save(); log('Gems = ' + D.gems); break;
          case 'exp': if (live()) player.addExp(n || 0); else grantExp(n || 0); break;
          case 'level': if (live()) player.addLevels(n || 1); break;
          case 'hp': U.heal(); break; case 'max': U.maxst(); break;
          case 'tp': if (live()) { [player.x, player.y] = clampXY(+a[0], +a[1]) } break;
          case 'spawn': log('Đã triệu hồi ' + summon(n || 1, false)); break; case 'boss': summon(1, true); break; case 'killall': log('Đã quét ' + killAll()); break;
          case 'tank': if (S[a[0]] && live()) { player.setT(a[0]); log('Đã đổi xe ' + a[0]) } else log('Không có xe ' + a[0]); break;
          case 'give': if (S[a[0]]) { if (!D.owned.includes(a[0])) D.owned.push(a[0]); save(); log('Đã cấp ' + a[0]) } break;
          case 'js': { const r = new Function('return (' + line.slice(3) + ')')(); log(String(r)); break }
          default: log('Lệnh lạ. Gõ help.');
        }
      } catch (e) { log('Lỗi: ' + e.message) }
      refreshBox();
    }
  };

  /* ---- hook vào game ---- */
  const on = k => isAdm() && ADM[k];
  const _pushOut = pushOut; pushOut = function (o, r) { if (on('noclip') && o === player) return; return _pushOut.apply(this, arguments) };
  const _hurt = hurtPlayer; hurtPlayer = function () { if (on('god')) return; return _hurt.apply(this, arguments) };
  const rain = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random(), v: .6 + Math.random() * .8 }));
  const _dz = drawZones; drawZones = function () {
    _dz.apply(this, arguments); if (!isAdm() || typeof player === 'undefined' || !player) return;
    if (ADM.hitbox) {
      ctx.save(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#22d3ee'; ctx.beginPath(); ctx.arc(player.x - camX, player.y - camY, 24, 0, 7); ctx.stroke();
      ctx.strokeStyle = '#f87171'; enemies.forEach(e => { if (!e.dead && Math.abs(e.x - player.x) < 1200 && Math.abs(e.y - player.y) < 800) { ctx.beginPath(); ctx.arc(e.x - camX, e.y - camY, e.r || 24, 0, 7); ctx.stroke() } });
      ctx.strokeStyle = '#fbbf24'; let n = 0; for (const p of proj) { if (p.dead || ++n > 400) continue; ctx.beginPath(); ctx.arc(p.x - camX, p.y - camY, p.r || 6, 0, 7); ctx.stroke() }
      ctx.strokeStyle = '#a78bfa'; for (const t of traps) { ctx.beginPath(); ctx.arc(t.x - camX, t.y - camY, t.r || 12, 0, 7); ctx.stroke() } ctx.restore();
    }
    if (ADM.night) { const x = player.x - camX, y = player.y - camY, g = ctx.createRadialGradient(x, y, 120, x, y, 720); g.addColorStop(0, 'rgba(2,6,23,0)'); g.addColorStop(1, 'rgba(2,6,23,.82)'); ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height); ctx.restore() }
    if (ADM.rain) { ctx.save(); ctx.strokeStyle = 'rgba(147,197,253,.55)'; ctx.lineWidth = 1; ctx.beginPath(); rain.forEach(r => { r.y += r.v * .02; r.x -= .004 * r.v; if (r.y > 1) { r.y = 0; r.x = Math.random() * 1.2 } if (r.x < 0) r.x += 1; const X = r.x * cv.width, Y = r.y * cv.height; ctx.moveTo(X, Y); ctx.lineTo(X - 5, Y + 16) }); ctx.stroke(); ctx.restore() }
  };
  function tick() {
    requestAnimationFrame(tick);
    if (!isAdm() || !live()) return;
    if (ADM.infGems && D.gems < 1e11) D.gems = 1e12;
    if (ADM.infExp && frame % 90 === 0) { try { player.addExp(1e8) } catch (e) { } }
    if (ADM.god) player.hp = player.maxHp;
    if (ADM.speed !== 1) player.speed = (player.base.speed + player.st.mv * SF.mv) * ADM.speed;
    if (ADM.dmg !== 1) player.dmg = (player.base.dmg + player.st.bd * SF.bd) * ADM.dmg;
    if (ADM.rate !== 1) player.rt = Math.max(2, player.base.reload * Math.pow(SF.rl, player.st.rl)) / ADM.rate;
    if (ADM.noclip && player.x !== undefined) { player.x = Math.max(40, Math.min(MAP - 40, player.x)); player.y = Math.max(40, Math.min(MAP - 40, player.y)) }
  }
  requestAnimationFrame(tick);
})();
