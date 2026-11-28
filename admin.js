/* eslint-disable */
/* Tank Warfare: Evolution — CÔNG CỤ QUẢN TRỊ (chỉ tài khoản admin)
   A) Bảng quản trị (cần NHẬP LẠI MẬT KHẨU): tra cứu/chỉnh sửa mọi tài khoản, đặt lại mật khẩu, khóa/cấm chat, mã quà,
      đăng/gỡ xe lên cửa hàng, thông báo toàn máy chủ, lệnh lên người chơi online, sao lưu/khôi phục, tải danh sách .docx.
   B) Công cụ trong game (phím 1): bay/xuyên tường, bất tử, vô hạn gems/EXP, chỉnh chỉ số, dịch chuyển, tàng hình, triệu hồi,
      quét sạch, khung va chạm, ngày/đêm + mưa/tuyết/bão, đóng băng quái, chiếm hữu, vẽ/xóa tường (map editor),
      tạo vật phẩm/soi túi đồ, bóng tối (chỉ thấy quanh mình; NPC cũng bị tối), vô hạn đạn, bảng lệnh có lệnh dạng /kick /ban /tp ...
   D) Giao diện điện thoại: nút nổi 🛠/👑 (kéo được), bảng công cụ co giãn, thanh vẽ tường cảm ứng.
   E) Lệnh gửi tới TẤT CẢ người chơi online qua server: /kick|/freeze|/bring|/mute|/unmute|/ban|/unban|/give|/gems|/exp|/level|/max all, /announce.
   F) Hiệu ứng/lệnh cho TẤT CẢ người chơi đang kết nối máy chủ (qua kênh thông báo của server): /dark|night|rain|snow|storm|god|speed|dmg|rate|noclip|ammo|hitbox|npcfreeze|heal|kill|spawn|boss|killnpc all, /clearfx.
   G) Thời tiết ảnh hưởng gameplay: ❄️ lạnh → mọi xe đi chậm hơn (xe dùng lửa bị chậm ít hơn); ⛈️ bão → thỉnh thoảng sét đánh trúng một xe, xe đó mất 50% máu.
   C) Màn hình chờ 3 giây mỗi khi chết (vào lại game hoặc đổi xe tăng) — áp dụng cho mọi người chơi.
   Quyền thật sự được máy chủ kiểm tra; phần công cụ trong game chỉ chạy ở máy của chính admin. */
(function () {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TIERS = ['C', 'B', 'A', 'S', 'SS', 'SSS', 'SSSS', 'SSSSS', 'ULTRA', 'HYPER', 'MYTHIC'];
  const AC = () => window.TWE_ACCOUNT, isAdm = () => !!(AC() && AC().isAdmin);
  let FXON = false, fxUntil = 0, fxW = {}, fxWUntil = 0; const adx = () => isAdm() || FXON; // FXON: máy người chơi thường đang chịu hiệu ứng do admin bật cho tất cả
  const $q = id => document.getElementById(id);
  const ADM = window.TWE_ADM = { noclip: false, god: false, infGems: false, infExp: false, speed: 1, dmg: 1, rate: 1, invisible: false, hitbox: false, night: false, rain: false, snow: false, storm: false, freezeAll: false, brush: '', brushSize: 120, dark: false, darkNpc: true, darkR: 260, infAmmo: false, spec: null };
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
  const gunOpts = none => (none ? '<option value="">' + none + '</option>' : '') + '<option value="creator">🔧 Quyền tạo xe tăng (creator)</option>' + Object.keys(DGUN).map(k => '<option value="' + k + '">' + esc(DGUN[k]) + ' (' + k + ')</option>').join('');
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
    if (tab === 'users') body = usersHtml(); else if (tab === 'codes') body = codesHtml(); else if (tab === 'shop') body = shopHtml(); else if (tab === 'sys') body = sysHtml(); else body = '<div class="pn"><b>🎮 Công cụ trong game</b><div class="mu">Mở bảng công cụ bay/xuyên tường, bất tử, vô hạn, dịch chuyển, triệu hồi, bảng lệnh... Trong lúc chơi bấm <b>1</b> để bật/tắt.</div><div style="text-align:center;margin-top:8px"><button style="background:#16a34a" onclick="TWE_ADMIN.tools(true)">MỞ BẢNG CÔNG CỤ</button></div></div>';
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
      '<div class="adr"><select id="aeAT" style="max-width:260px">' + tankOpts('', '— chọn xe để cấp —') + '</select><button onclick="TWE_ADMIN.giveTank()">➕ CẤP XE</button><select id="aeAG">' + gunOpts('— súng drone —') + '</select><button onclick="TWE_ADMIN.giveGun()">➕ CẤP SÚNG</button><button style="background:#0ea5e9" onclick="TWE_ADMIN.giveCreator()">🔧 CẤP QUYỀN TẠO XE</button></div>' +
      '<div class="mu" style="font-size:11px">Súng drone đang có: ' + ((sv.dguns || []).filter(k => k !== 'creator').map(k => esc(DGUN[k] || k)).join(', ') || 'không') + ' · Quyền tạo xe: ' + ((sv.dguns || []).includes('creator') ? '✅ có' : '❌ chưa') + '</div>' +
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
    giveCreator() { this.patch({ addGuns: ['creator'] }) },
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

  /* ================= B) CÔNG CỤ TRONG GAME (phím 1) ================= */
  let logBuf = 'Gõ "help" để xem lệnh.\n';
  const box = document.createElement('div'); box.id = 'admTools'; box.style.display = 'none'; document.body.appendChild(box);
  const clampXY = (x, y) => [Math.max(40, Math.min(MAP - 40, x)), Math.max(40, Math.min(MAP - 40, y))];
  const live = () => typeof player !== 'undefined' && player && typeof running !== 'undefined' && running;
  function log(t) { logBuf += t + '\n'; if (logBuf.length > 4000) logBuf = logBuf.slice(-3000); const l = $q('admLog'); if (l) { l.textContent = logBuf; l.scrollTop = 1e9 } }
  function toolsHtml() {
    const tg = (k, l) => '<button class="' + (ADM[k] ? 'on' : '') + '" onclick="TWE_ADM_UI.tog(\'' + k + '\')">' + l + '</button>';
    const near = (typeof enemies !== 'undefined' ? enemies : []).filter(e => !e.dead && (e.label || e.nm)).slice(0, 40);
    return '<div style="display:flex;justify-content:space-between"><b style="color:#f59e0b">🎮 CÔNG CỤ ADMIN</b><a href="#" onclick="TWE_ADMIN.tools(false);return false" style="color:#f87171">✕ Đóng</a></div>' +
      '<div>' + tg('noclip', '🕊️ Bay/xuyên tường') + tg('god', '🛡️ Bất tử') + tg('invisible', '👻 Tàng hình') + tg('hitbox', '🔲 Khung va chạm') + tg('infGems', '💎 Vô hạn gems') + tg('infExp', '⭐ Vô hạn EXP') + tg('night', '🌙 Đêm') + tg('rain', '🌧️ Mưa') + tg('snow', '❄️ Tuyết') + tg('storm', '⛈️ Bão') + tg('freezeAll', '🧊 Đóng băng quái') + tg('dark', '🕶️ Bóng tối') + tg('darkNpc', '🤖 NPC cũng bị tối') + tg('infAmmo', '🔫 Vô hạn đạn') + '<button style="background:#b45309" onclick="TWE_ADM_UI.all()">♾️ VÔ HẠN TẤT CẢ</button></div>' +
      '<div>Tầm nhìn bóng tối <input id="adDr" type="number" value="' + ADM.darkR + '" style="width:70px"> <button onclick="TWE_ADM_UI.darkR()">ÁP DỤNG</button></div>' +
      '<hr style="border-color:#334155"><b>⚙️ Chỉ số</b><div>Tốc độ ×<input id="adS" type="number" step="0.5" value="' + ADM.speed + '"> Sát thương ×<input id="adD" type="number" step="0.5" value="' + ADM.dmg + '"> Tốc bắn ×<input id="adR" type="number" step="0.5" value="' + ADM.rate + '"> <button onclick="TWE_ADM_UI.stats()">ÁP DỤNG</button></div>' +
      '<div><button onclick="TWE_ADM_UI.lv(10)">+10 cấp</button><button onclick="TWE_ADM_UI.lv(100)">+100 cấp</button><button onclick="TWE_ADM_UI.lv(1000)">+1000 cấp</button><button onclick="TWE_ADM_UI.maxst()">Tối đa chỉ số</button><button onclick="TWE_ADM_UI.heal()">Hồi máu</button></div>' +
      '<hr style="border-color:#334155"><b>📍 Dịch chuyển</b><div>X<input id="adX" type="number" value="' + (live() ? Math.round(player.x) : 0) + '"> Y<input id="adY" type="number" value="' + (live() ? Math.round(player.y) : 0) + '"> <button onclick="TWE_ADM_UI.tp()">ĐI</button><button onclick="TWE_ADM_UI.center()">Giữa bản đồ</button></div>' +
      '<div><select id="adE" style="max-width:190px"><option value="">— tới người/quái —</option>' + near.map((e, i) => '<option value="' + i + '">' + esc(e.label || e.nm) + '</option>').join('') + '</select><button onclick="TWE_ADM_UI.tpe()">TỚI</button><button onclick="TWE_ADM_UI.possess()">👁️ CHIẾM HỮU</button></div>' +
      '<hr style="border-color:#334155"><b>👹 Triệu hồi / dọn</b><div><input id="adN" type="number" value="5" style="width:50px"> <button onclick="TWE_ADM_UI.spawn(false)">Quái</button><button onclick="TWE_ADM_UI.spawn(true)">BOSS</button><button class="red" onclick="TWE_ADM_UI.kill()">☢️ QUÉT SẠCH</button></div>' +
      '<hr style="border-color:#334155"><b>🎁 Vật phẩm / 🎒 Túi đồ</b><div>💎<input id="adGm" type="number" value="1000000" style="width:110px"> <button onclick="TWE_ADM_UI.addGems()">+ Gems</button><button onclick="TWE_ADM_UI.inv()">🎒 Soi túi</button></div><div><input id="adT" list="adTL" placeholder="mã xe" style="width:120px"><datalist id="adTL">' + toolTankOpts() + '</datalist> <button onclick="TWE_ADM_UI.giveT()">Cấp xe</button><button onclick="TWE_ADM_UI.useT()">Dùng xe</button><button class="red" onclick="TWE_ADM_UI.takeT()">Thu hồi</button></div>' +
      '<hr style="border-color:#334155"><b>🗺️ Chỉnh bản đồ</b><div><button class="' + (ADM.brush === 'add' ? 'on' : '') + '" onclick="TWE_ADM_UI.brush(\'add\')">🧱 Vẽ tường</button><button class="' + (ADM.brush === 'del' ? 'on' : '') + '" onclick="TWE_ADM_UI.brush(\'del\')">🧹 Xóa tường</button> cỡ<input id="adBs" type="number" step="40" value="' + ADM.brushSize + '" style="width:60px"><button onclick="TWE_ADM_UI.undo()">↩️</button><button onclick="TWE_ADM_UI.resetMap()">♻️ Khôi phục</button></div><div class="mu">Bật chế độ rồi bấm lên bản đồ trong trận (chỉ đổi trên máy bạn).</div>' +
      '<hr style="border-color:#334155"><b>📡 Tất cả người chơi online</b><div><button onclick="TWE_ADM_UI.all_(\'freeze\')">🧊 Đóng băng</button><button onclick="TWE_ADM_UI.all_(\'bring\')">🧲 Kéo về chỗ tôi</button><button class="red" onclick="TWE_ADM_UI.all_(\'kick\')">👢 Đuổi</button><button onclick="TWE_ADM_UI.all_(\'mute\')">🔇 Cấm chat</button><button onclick="TWE_ADM_UI.all_(\'unmute\')">🔊 Bỏ cấm chat</button></div><div><input id="adAn" maxlength="200" placeholder="Thông báo tới mọi người" style="width:60%"> <button onclick="TWE_ADM_UI.announce()">📢 GỬI</button></div><div><input id="adAk" list="adTL" placeholder="mã xe/súng" style="width:110px"> <button onclick="TWE_ADM_UI.all_(\'give\')">🎁 Tặng tất cả</button> <input id="adAg" type="number" value="100000" style="width:90px"> <button onclick="TWE_ADM_UI.all_(\'gems\')">💎 + Gems tất cả</button></div><div class="mu">Gửi qua server tới mọi tài khoản đang online (15 phút gần nhất, không gồm admin). Cần mở khóa bảng quản trị 1 lần. Gõ <b>force</b> cuối lệnh để gửi cho mọi tài khoản.</div>' +
      '<hr style="border-color:#334155"><b>🌐 Hiệu ứng cho TẤT CẢ người chơi</b><div>⏱<input id="adFxS" type="number" value="0" style="width:60px" title="giây, 0 = đến khi tắt"> tầm<input id="adFxR" type="number" value="260" style="width:64px"> ×<input id="adFxN" type="number" value="2" step="0.5" style="width:56px"></div><div><button onclick="TWE_ADM_UI.fx(\'dark\')">🌑 Bóng tối</button><button onclick="TWE_ADM_UI.fx(\'night\')">🌙 Đêm</button><button onclick="TWE_ADM_UI.fx(\'rain\')">🌧️ Mưa</button><button onclick="TWE_ADM_UI.fx(\'snow\')">❄️ Tuyết</button><button onclick="TWE_ADM_UI.fx(\'storm\')">⛈️ Bão</button><button onclick="TWE_ADM_UI.fx(\'god\')">🛡️ Bất tử</button><button onclick="TWE_ADM_UI.fx(\'noclip\')">🕊️ Xuyên tường</button><button onclick="TWE_ADM_UI.fx(\'ammo\')">🔫 Vô hạn đạn</button><button onclick="TWE_ADM_UI.fx(\'speed\')">⚡ Tốc độ</button><button onclick="TWE_ADM_UI.fx(\'dmg\')">💥 Sát thương</button><button onclick="TWE_ADM_UI.fx(\'rate\')">🎯 Tốc bắn</button><button onclick="TWE_ADM_UI.fx(\'heal\')">💚 Hồi máu</button><button class="red" onclick="TWE_ADM_UI.fx(\'kill\')">☠️ Hạ gục</button><button onclick="TWE_ADM_UI.fx(\'npcfreeze\')">🧊 Quái đứng yên</button><button onclick="TWE_ADM_UI.fx(\'spawn\')">👾 Quái +×</button><button onclick="TWE_ADM_UI.fx(\'boss\')">👹 Boss</button><button class="red" onclick="TWE_ADM_UI.fx(\'killnpc\')">☢️ Xóa quái</button><button style="background:#b45309" onclick="TWE_ADM_UI.fxOff()">✖ Tắt hiệu ứng</button></div><div class="mu">Gửi qua server tới mọi người đang kết nối (không gồm admin và người chơi P2P). ⏱ = giây, 0 là đến khi bấm Tắt. Quái/boss do chủ mỗi phòng thực hiện.</div>' +
      '<hr style="border-color:#334155"><b>⌨️ Bảng lệnh</b><input id="admCon" autocapitalize="none" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="send" placeholder="gõ lệnh, vd: /help" onkeydown="event.stopPropagation();if(event.key===\'Enter\')TWE_ADM_UI.con(this)"><button onclick="TWE_ADM_UI.con(document.getElementById(\'admCon\'))">GỬI ↵</button><div id="admLog">' + esc(logBuf) + '</div>';
  }
  function toolsToggle(show) {
    if (!isAdm()) return;
    const on = show === undefined ? box.style.display === 'none' : !!show;
    box.style.display = on ? '' : 'none'; if (on) { box.innerHTML = toolsHtml(); const l = $q('admLog'); if (l) l.scrollTop = 1e9 }
  }
  addEventListener('keydown', e => { const el = e.target, typing = el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable); if (e.code === 'Digit1' && !e.repeat && !typing && isAdm()) { e.preventDefault(); e.stopImmediatePropagation(); toolsToggle() } }, true);
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
  let _tankOpts = '';
  const toolTankOpts = () => _tankOpts || (_tankOpts = typeof S !== 'undefined' ? Object.keys(S).slice(0, 1500).map(k => '<option value="' + esc(k) + '">' + esc((S[k] && S[k].name) || '') + '</option>').join('') : '');
  const selEnemy = () => { const i = val('adE'); if (i === '') return null; return enemies.filter(e => !e.dead && (e.label || e.nm)).slice(0, 40)[+i] || null };
  const nearestEnemy = () => { let b = null, bd = 1e9; enemies.forEach(e => { if (e.dead) return; const d = Math.hypot(e.x - player.x, e.y - player.y); if (d < bd) { bd = d; b = e } }); return b };
  function possessEnemy(e) {
    if (!live()) return log('Cần đang trong trận');
    if (!e) return log('Chưa chọn mục tiêu');
    const key = Object.keys(S).find(k => S[k] === e.sp);
    if (!key || typeof player.setT !== 'function') return log('Không chiếm hữu được mục tiêu này');
    try {
      player.setT(key); const d = (e.level || 0) - player.level; if (d > 0) player.addLevels(d);
      player.hp = player.maxHp; [player.x, player.y] = clampXY(e.x, e.y); e.dead = true; boom(e.x, e.y);
      log('👁️ Đã chiếm hữu ' + (e.label || e.nm) + ' (Lv ' + e.level + ')');
    } catch (x) { log('Lỗi: ' + x.message) }
  }

  /* ---- Map editor: vẽ / xóa tường ngay trong trận ---- */
  let origObs = null, origMAP = 0, bscr = null; const wallEdits = [];
  const keepOrig = () => { if (!origObs || origMAP !== MAP) { origObs = OBS.map(q => q.slice()); origMAP = MAP; wallEdits.length = 0 } };
  const navReset = () => { try { NAV = null; NST = 0 } catch (e) { } };
  const zm = () => (typeof ZM !== 'undefined' && ZM) || 1;
  function wallAt(wx, wy, del) {
    if (!live()) return; keepOrig();
    if (del) {
      for (let i = OBS.length - 1; i >= 0; i--) { const q = OBS[i]; if (wx >= q[0] && wx <= q[2] && wy >= q[1] && wy <= q[3]) { wallEdits.push({ t: 'del', i, q }); OBS.splice(i, 1); navReset(); return log('🧹 Đã xóa 1 tường') } }
      return log('Không có tường ở đó');
    }
    const s = ADM.brushSize, gx = Math.max(0, Math.min(MAP - s, Math.floor(wx / 40) * 40)), gy = Math.max(0, Math.min(MAP - s, Math.floor(wy / 40) * 40)), q = [gx, gy, gx + s, gy + s];
    const cx = Math.max(q[0], Math.min(q[2], player.x)), cy = Math.max(q[1], Math.min(q[3], player.y));
    if (!ADM.noclip && (player.x - cx) ** 2 + (player.y - cy) ** 2 < 3600) return log('Quá gần xe của bạn (bật xuyên tường để đặt)');
    if (OBS.some(o => o[0] === q[0] && o[1] === q[1] && o[2] === q[2] && o[3] === q[3])) return log('Ô này đã có tường');
    OBS.push(q); wallEdits.push({ t: 'add', q }); navReset(); log('🧱 Đã đặt tường ' + s + '×' + s);
  }
  function undoWall() {
    const e = wallEdits.pop(); if (!e) return log('Không còn gì để hoàn tác');
    if (e.t === 'add') { const i = OBS.lastIndexOf(e.q); if (i >= 0) OBS.splice(i, 1) } else OBS.splice(Math.min(e.i, OBS.length), 0, e.q);
    navReset(); log('↩️ Đã hoàn tác');
  }
  function resetWalls() {
    if (!origObs || origMAP !== MAP) return log('Chưa chỉnh bản đồ');
    OBS.length = 0; origObs.forEach(q => OBS.push(q.slice())); wallEdits.length = 0; navReset(); log('♻️ Đã khôi phục bản đồ gốc');
  }
  addEventListener('mousemove', e => { if (ADM.brush && e.target === cv) bscr = [e.clientX * zm(), e.clientY * zm()] }, true);
  addEventListener('mousedown', e => {
    if (!ADM.brush || !isAdm() || e.target !== cv || !live()) return;
    e.preventDefault(); e.stopImmediatePropagation();
    wallAt(e.clientX * zm() + camX, e.clientY * zm() + camY, ADM.brush === 'del');
  }, true);
  /* ---- NPC cũng bị tối: chỉ thấy mục tiêu trong tầm nhìn, đi chậm khi mù, phục kích/quét góc, rút lui khi yếu hoặc bị vây ---- */
  function blindUpdate(e, orig, args) {
    const R2 = Math.max(60, ADM.darkR) ** 2, d2 = o => (o.x - e.x) ** 2 + (o.y - e.y) ** 2, pvp = mode === 'pvp', foe = o => !pvp || o.team !== e.team;
    const hidden = [], vis = [];
    enemies.forEach(o => { if (o === e || o.dead) return; if (d2(o) > R2) { o.dead = true; hidden.push(o) } else if (foe(o)) vis.push(o) });
    const pSees = !!player && !player.dead && d2(player) <= R2; if (pSees && foe(player)) vis.push(player);
    const pDead0 = player.dead, tier0 = e.tier, spd0 = e.spd; let tierHack = null, scaled = false;
    if (!pSees) { player.dead = true; e.aggro = 0; tierHack = e.tier = Math.min(e.tier, 2) }
    try {
      if (e._amb === undefined) e._amb = Math.random() < .35;
      if (!vis.length) {
        e.spd = spd0 * .6; scaled = true;
        if (e._amb && !T4 && (frame + (e.nv || 0) * 37) % 600 < 240) { e.ang += .03; if (e.regen && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.regen); if (e.cd > 0) e.cd--; return }
      } else if (e.hp < e.maxHp * .35 || (vis.length >= 3 && e.hp < e.maxHp * .7)) {
        let near = vis[0], bd = d2(near); vis.forEach(o => { const d = d2(o); if (d < bd) { bd = d; near = o } });
        const dx = e.x - near.x, dy = e.y - near.y, dd = Math.hypot(dx, dy) || 1, sp = (spd0 || 2) * 1.1, [nx, ny] = clampXY(e.x + dx / dd * sp, e.y + dy / dd * sp);
        if (!hitWall(nx, e.y, e.r)) e.x = nx; if (!hitWall(e.x, ny, e.r)) e.y = ny; e.ang = Math.atan2(dy, dx);
        if (e.regen && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.regen); if (e.cd > 0) e.cd--; return;
      }
      return orig.apply(e, args);
    } finally {
      hidden.forEach(o => { o.dead = false }); player.dead = pDead0;
      if (tierHack !== null && e.tier === tierHack) e.tier = tier0; if (scaled && e.spd === spd0 * .6) e.spd = spd0;
    }
  }
  const _eUpd = Enemy.prototype.update;
  Enemy.prototype.update = function () {
    if (adx() && ADM.freezeAll) return;
    if (adx() && ADM.dark && ADM.darkNpc && live() && !SIM && !WATCH && !this.net) return blindUpdate(this, _eUpd, arguments);
    return _eUpd.apply(this, arguments);
  };


  /* ---- Bóng tối: chỉ nhìn thấy vùng quanh xe (vẽ phủ lên toàn cảnh, trước HUD) ---- */
  const _minimap = minimap; minimap = function () {
    if (adx() && ADM.dark && live() && !SIM) {
      const px = player.x - camX, py = player.y - camY, R = Math.max(60, ADM.darkR), g = ctx.createRadialGradient(px, py, R * .5, px, py, R);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)'); ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height); ctx.restore();
    }
    const r = _minimap.apply(this, arguments);
    if (adx() && ADM.dark && live()) { try { mc.fillStyle = '#000'; mc.fillRect(0, 0, 130, 130) } catch (e) { } }
    return r;
  };

  /* ================= C) MÀN HÌNH CHỜ KHI CHẾT ================= */
  let deathWait = 3, lastBegin, dwTimer = 0, dwOn = false, dwPvp = false;
  const dw = document.createElement('div'); dw.id = 'deathWait'; dw.className = 'ov hidden'; dw.style.zIndex = 40;
  ((($q('over') && $q('over').parentNode) || document.body)).appendChild(dw);
  ['mousedown', 'mouseup', 'click', 'contextmenu', 'wheel'].forEach(ev => dw.addEventListener(ev, e => e.stopPropagation()));
  function dwHide() { dwOn = false; dwPvp = false; clearInterval(dwTimer); dw.classList.add('hidden') }
  function dwShow(title, info, again, pvp) {
    dwOn = true; dwPvp = !!pvp; const end = Date.now() + deathWait * 1000;
    dw.innerHTML = '<h1 style="-webkit-text-fill-color:#ef4444">' + esc(title) + '</h1><div class="pn" style="line-height:1.8">' + info + '</div><div id="dwCount" style="font-size:44px;font-weight:800;color:#fbbf24"></div><div class="mu">Màn hình chờ hồi sinh. Khi hết giờ bạn có thể vào lại game hoặc đổi xe tăng.</div><div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center"><button id="dwA" disabled>▶ VÀO LẠI GAME</button><button id="dwB" disabled>🔧 ĐỔI XE TĂNG</button></div>';
    const tick = () => {
      const c = $q('dwCount'); if (!c) return clearInterval(dwTimer);
      if (dwPvp && (!running || !player)) return dwHide();
      const s = Math.ceil((end - Date.now()) / 1000);
      if (s > 0) c.textContent = s + ' giây'; else { clearInterval(dwTimer); c.textContent = 'Sẵn sàng!'; $q('dwA').disabled = false; $q('dwB').disabled = false }
    };
    clearInterval(dwTimer); dwTimer = setInterval(tick, 200);
    $q('dwA').onclick = () => { dwHide(); again() };
    $q('dwB').onclick = () => { dwHide(); if (typeof running !== 'undefined' && running) exitGame(); else toMenu() };
    dw.classList.remove('hidden'); tick();
  }
  const _begin = begin; begin = function (m) { lastBegin = m; dwHide(); return _begin.apply(this, arguments) };
  const _gameOver = gameOver; gameOver = function () {
    const r = _gameOver.apply(this, arguments);
    try { if (deathWait > 0 && !SIM && !WATCH) { $q('over').classList.add('hidden'); dwShow($q('overT').textContent, $q('overI').innerHTML, () => begin(lastBegin), false) } } catch (e) { }
    return r;
  };
  const _respawn = respawn; respawn = function () {
    if (deathWait > 0 && !dwOn && running && mode === 'pvp' && !SIM && !WATCH && player && player.hp <= 0) {
      player.hp = 1; player.inv = 1e12;
      dwShow('💀 BẠN ĐÃ BỊ HẠ GỤC', 'Bạn sẽ hồi sinh tại căn cứ của đội mình.', () => { try { _respawn() } catch (e) { } }, true);
      return;
    }
    return _respawn.apply(this, arguments);
  };
  const _loop = loop; loop = function () { if (dwOn && dwPvp && running) { requestAnimationFrame(loop); return } return _loop.apply(this, arguments) }; // đóng băng cả trận khi đang chờ hồi sinh (PvP)
  addEventListener('keydown', e => { if (dwOn && dwPvp && running && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) { e.stopImmediatePropagation(); e.preventDefault() } }, true);

  /* ---- Lệnh dạng /kick /ban /tp ... trong bảng lệnh ---- */
  let specPrev = {};
  const asrv = async fn => { try { await fn() } catch (e) { log(e.message === 'LOCKED' ? '🔒 Hãy mở khóa bảng quản trị (nhập mật khẩu) trước' : 'Lỗi: ' + e.message) } };
  const findAcc = async name => { const r = await A('/api/admin/users', { q: name, limit: 10 }), us = r.users || [], q = String(name).toLowerCase(); return us.find(u => String(u.username).toLowerCase() === q) || us[0] || null };
  const findEnt = q => {
    q = String(q || '').toLowerCase(); if (!q) return null; if (q === 'me' || q === 'tôi') return player;
    let best = null; enemies.forEach(e => { if (e.dead) return; const n = String(e.label || e.nm || e.name || '').toLowerCase(); if (!n) return; if (n === q) best = e; else if (!best && n.includes(q)) best = e }); return best;
  };
  function slash(c, a) {
    const name = a.join(' ');
    if (/^(all|\*)$/i.test(a[0] || '') && ALLC.includes(c)) return runAll(c, a.slice(1));
    switch (c) {
      case 'announce': case 'say': if (!name) return log('Dùng: /announce [nội dung]'); return asrv(async () => { await A('/api/admin/announce', { m: name }); log('📢 Đã gửi thông báo tới mọi người') });
      case 'kick': if (!name) return log('Dùng: /kick [tên]'); return asrv(async () => { const u = await findAcc(name); if (!u) return log('Không thấy tài khoản ' + name); await A('/api/admin/cmd', { aid: u.id, cmd: 'kick', ms: 8000 }); log('👢 Đã đuổi ' + u.username) });
      case 'ban': case 'unban': {
        if (!a[0]) return log('Dùng: /ban [tên] [giờ, 0=vĩnh viễn] [lý do] | /unban [tên]'); const on = c === 'ban', hasH = a[1] !== undefined && !isNaN(+a[1]);
        return asrv(async () => { const u = await findAcc(a[0]); if (!u) return log('Không thấy tài khoản ' + a[0]); await A('/api/admin/ban', { id: u.id, ban: on, hours: hasH ? +a[1] : 0, reason: a.slice(hasH ? 2 : 1).join(' '), ip: false }); log(on ? '⛔ Đã khóa ' + u.username + (hasH && +a[1] > 0 ? ' ' + a[1] + ' giờ' : ' vĩnh viễn') : '✅ Đã mở khóa ' + u.username) });
      }
      case 'mute': case 'unmute': {
        if (!a[0]) return log('Dùng: /mute [tên] [phút, 0=vô hạn] | /unmute [tên]'); const on = c === 'mute';
        return asrv(async () => { const u = await findAcc(a[0]); if (!u) return log('Không thấy tài khoản ' + a[0]); await A('/api/admin/mute', { id: u.id, mute: on, minutes: on ? (+a[1] || 0) : 0 }); log(on ? '🔇 Đã cấm chat ' + u.username : '🔊 Đã bỏ cấm chat ' + u.username) });
      }
      case 'freeze': {
        if (!a[0]) return log('Dùng: /freeze [tên] [giây] (không có tên: bật/tắt đóng băng quái)'); const s = Math.max(1, Math.min(60, +a[1] || 8));
        return asrv(async () => { const u = await findAcc(a[0]); if (!u) return log('Không thấy tài khoản ' + a[0]); await A('/api/admin/cmd', { aid: u.id, cmd: 'freeze', ms: s * 1000 }); log('🧊 Đã đóng băng ' + u.username + ' ' + s + ' giây') });
      }
      case 'slap': case 'kill': {
        if (!live()) return log('Cần đang trong trận'); const e = findEnt(name || (c === 'kill' ? 'me' : ''));
        if (!e) return log(name ? 'Không thấy "' + name + '" trong trận' : 'Dùng: /slap [tên]');
        if (e === player) { player.inv = 0; hurtPlayer(c === 'kill' ? 1e9 : player.maxHp * .2, null); return log(c === 'kill' ? '☠️ Bạn tự hạ gục' : 'Bạn bị tát') }
        if (e.net) return log('Người chơi online: cần server hỗ trợ lệnh này');
        hurtEnemy(e, c === 'kill' ? 1e12 : Math.max(1, e.maxHp * .2), player); return log((c === 'kill' ? '☠️ Đã hạ ' : '👋 Đã tát ') + (e.label || e.nm));
      }
      case 'spec': {
        if (!live()) return log('Cần đang trong trận');
        if (!name || name === 'off') { if (ADM.spec) { ADM.spec = null; Object.assign(ADM, specPrev); refreshBox(); return log('Đã thoát chế độ theo dõi') } return log('Dùng: /spec [tên] | /spec off') }
        const e = findEnt(name); if (!e || e === player) return log('Không thấy "' + name + '" trong trận');
        if (!ADM.spec) specPrev = { noclip: ADM.noclip, god: ADM.god, invisible: ADM.invisible };
        ADM.spec = e; ADM.noclip = ADM.god = ADM.invisible = true; refreshBox(); return log('👁️ Đang theo dõi ' + (e.label || e.nm) + ' (tàng hình + bất tử). /spec off để thoát');
      }
      case 'heal': {
        if (!live()) return log('Cần đang trong trận'); if (!name) { U.heal(); return log('Đã hồi đầy máu') }
        const e = findEnt(name); if (!e) return log('Không thấy "' + name + '" trong trận'); if (e.net) return log('Người chơi online: cần server hỗ trợ lệnh này');
        e.hp = e.maxHp; return log('💚 Đã hồi máu cho ' + (e.label || e.nm || 'bản thân'));
      }
      case 'give': case 'equip': {
        if (!a[0]) return log('Dùng: /give [mã xe hoặc súng drone] | /give [tên] [mã]');
        if (a.length >= 2) { const k = a[1], isT = !!S[k]; if (!isT && !DGUN[k] && k !== 'creator') return log('Không có mã ' + k); return asrv(async () => { const u = await findAcc(a[0]); if (!u) return log('Không thấy tài khoản ' + a[0]); await A('/api/admin/edit', { id: u.id, patch: isT ? { addTanks: [k] } : { addGuns: [k] } }); log('🎁 Đã cấp ' + k + ' cho ' + u.username) }) }
        const k = a[0];
        if (S[k]) { if (!D.owned.includes(k)) D.owned.push(k); save(); return log('Đã cấp xe ' + k) }
        if (DGUN[k]) { D.dguns = D.dguns || []; if (!D.dguns.includes(k)) D.dguns.push(k); save(); return log('Đã cấp súng drone ' + DGUN[k]) }
        return log('Không có mã ' + k + '. Súng drone: ' + Object.keys(DGUN).join(', '));
      }
      case 'tp': case 'goto': case 'bring': {
        if (!live()) return log('Cần đang trong trận');
        if (c === 'tp' && a.length >= 2 && !isNaN(+a[0]) && !isNaN(+a[1])) { [player.x, player.y] = clampXY(+a[0], +a[1]); return log('Dịch chuyển tới ' + Math.round(player.x) + ',' + Math.round(player.y)) }
        if (!a.length) return log('Dùng: /tp X Y | /tp [tên] | /tp [A] [B] | /goto [tên] | /bring [tên]');
        let from = 'me', to = 'me'; if (c === 'bring') from = name; else if (c === 'goto' || a.length === 1) to = name; else { from = a[0]; to = a[1] }
        const dst = findEnt(to); if (!dst) return log('Không thấy "' + to + '" trong trận');
        const [x, y] = clampXY(dst === player ? player.x : dst.x + 80, dst.y);
        const src = findEnt(from); if (src === player) { [player.x, player.y] = [x, y]; return log('Đã tới ' + to) }
        if (src && !src.net) { src.x = x; src.y = y; return log('Đã dịch chuyển ' + from + ' tới ' + to) }
        return asrv(async () => { const u = await findAcc(from); if (!u) return log('Không thấy tài khoản ' + from); await A('/api/admin/cmd', { aid: u.id, cmd: 'tp', x, y, ms: 8000 }); log('Đã kéo ' + u.username + ' tới ' + to) });
      }
      case 'map': case 'changemap': {
        if (!live()) return log('Cần đang trong trận'); if (T4 || mode === 'pvp') return log('Chỉ đổi cỡ bản đồ được ở chế độ PvE thường');
        const v = String(a[0] || '').toLowerCase(), sz = (v === 'big' || v === 'lon' || v === 'lớn') ? BIGMAP : (v === 'small' || v === 'nho' || v === 'nhỏ') ? 4000 : +v;
        if (!(sz >= 2000 && sz <= 16000)) return log('Dùng: /map small | big | cỡ (2000-16000). Hiện tại: ' + MAP);
        if (sz === MAP) return log('Đang ở bản đồ cỡ ' + MAP);
        setMap(sz); enemies.length = 0; shapes.length = 0; proj.length = 0; traps.length = 0; minions.length = 0; randSpawn(); return log('🗺️ Đã đổi bản đồ sang cỡ ' + sz);
      }
      case 'restart': case 'rr': begin(lastBegin); return log('🔄 Đã khởi động lại ván');
      case 'gravity': return log('Game nhìn từ trên xuống nên không có trọng lực. Dùng /speed [số] để đổi tốc độ di chuyển.');
      case 'bots': {
        if (!live()) return log('Cần đang trong trận'); if (T4) return log('Chế độ đội: không chỉnh bot bằng lệnh này');
        const list = enemies.filter(e => !e.dead && !e.net), cur = list.length; if (isNaN(+a[0])) return log('Dùng: /bots [số lượng]. Hiện có ' + cur);
        const n = Math.max(0, Math.min(200, Math.floor(+a[0])));
        if (n > cur) { if (mode === 'pvp' && typeof mkBot === 'function') { for (let i = cur; i < n; i++) mkBot(i % 2 ? 'r' : 'b') } else summon(n - cur, false) } else for (let i = 0; i < cur - n; i++) list[list.length - 1 - i].dead = true;
        const cap = Math.round(16 * (MAP > 4000 ? 1.75 : 1)); return log('🤖 Bot: ' + cur + ' → ' + n + (mode === 'pve' && n < cap ? ' (PvE tự bổ sung quái tới ' + cap + '; dùng freeze nếu muốn đứng yên)' : ''));
      }
    }
  }

  /* ================= E) LỆNH CHO TẤT CẢ NGƯỜI CHƠI ONLINE (qua API server) ================= */
  const ALLC = ['kick', 'freeze', 'tp', 'bring', 'mute', 'unmute', 'ban', 'unban', 'give', 'equip', 'gems', 'exp', 'level', 'max'];
  async function allTargets(force) {
    const r = await A('/api/admin/users', { q: '', limit: 200 }), me = AC() && AC().user && AC().user.username, got = r.users || [];
    const all = got.filter(u => !u.admin && u.username !== me), t0 = Date.now() - 15 * 60e3;
    return { list: force ? all : all.filter(u => u.seen && u.seen >= t0), total: r.total || got.length, shown: got.length };
  }
  async function pool(list, fn, n = 4) {
    let ok = 0, bad = 0, i = 0;
    await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) { const u = list[i++]; try { await fn(u); ok++ } catch (e) { if (e.message === 'LOCKED') throw e; bad++ } } }));
    return [ok, bad];
  }
  function runAll(c, rest) {
    const force = rest[rest.length - 1] === 'force', args = force ? rest.slice(0, -1) : rest, N = +args[0];
    return asrv(async () => {
      let fn;
      switch (c) {
        case 'kick': fn = u => A('/api/admin/cmd', { aid: u.id, cmd: 'kick', ms: 8000 }); break;
        case 'freeze': { const s = Math.max(1, Math.min(60, N || 8)); fn = u => A('/api/admin/cmd', { aid: u.id, cmd: 'freeze', ms: s * 1000 }); break }
        case 'tp': case 'bring': { if (!live()) return log('Cần đang trong trận để kéo mọi người về chỗ bạn'); const x = Math.round(player.x), y = Math.round(player.y); fn = u => A('/api/admin/cmd', { aid: u.id, cmd: 'tp', x, y, ms: 8000 }); break }
        case 'mute': case 'unmute': { const on = c === 'mute', m = on ? (N || 0) : 0; fn = u => A('/api/admin/mute', { id: u.id, mute: on, minutes: m }); break }
        case 'ban': case 'unban': { const on = c === 'ban', hasH = args[0] !== undefined && !isNaN(N), h = hasH ? N : 0, reason = args.slice(hasH ? 1 : 0).join(' '); fn = u => A('/api/admin/ban', { id: u.id, ban: on, hours: h, reason, ip: false }); break }
        case 'give': case 'equip': { const k = args[0], isT = !!(k && S[k]); if (!k || (!isT && !DGUN[k] && k !== 'creator')) return log('Dùng: /give all [mã xe hoặc súng drone]'); fn = u => A('/api/admin/edit', { id: u.id, patch: isT ? { addTanks: [k] } : { addGuns: [k] } }); break }
        case 'gems': if (isNaN(N)) return log('Dùng: /gems all [số gems cộng thêm]'); fn = u => A('/api/admin/edit', { id: u.id, patch: { gems: Math.max(0, Math.round((u.gems || 0) + N)) } }); break;
        case 'exp': if (isNaN(N)) return log('Dùng: /exp all [số EXP cộng thêm]'); fn = u => A('/api/admin/edit', { id: u.id, patch: { addExp: N } }); break;
        case 'level': if (!(N >= 1)) return log('Dùng: /level all [cấp]'); fn = u => A('/api/admin/edit', { id: u.id, patch: { level: Math.round(N) } }); break;
        case 'max': fn = u => A('/api/admin/edit', { id: u.id, patch: { gems: 1e12, addExp: 1e9 } }); break;
        default: return log('Lệnh /' + c + ' chưa hỗ trợ cho tất cả');
      }
      const { list, total, shown } = await allTargets(force);
      if (!list.length) return log('Không thấy ai online (theo "thấy lần cuối" trong 15 phút). Thêm "force" cuối lệnh để gửi cho mọi tài khoản.');
      if (!confirm((c === 'ban' ? '⛔ KHÓA ' : '/' + c + ' → ') + list.length + ' tài khoản' + (force ? ' (mọi tài khoản)' : ' đang online') + ' (không gồm admin). Tiếp tục?')) return log('Đã hủy');
      const [ok, bad] = await pool(list, fn);
      log('✅ /' + c + ' all: ' + ok + ' thành công' + (bad ? ', ' + bad + ' lỗi' : '') + (total > shown ? ' · chỉ lấy được ' + shown + '/' + total + ' tài khoản đầu tiên' : ''));
    });
  }

  /* ================= D) GIAO DIỆN ĐIỆN THOẠI ================= */
  const css2 = document.createElement('style');
  css2.textContent = '#admFab{position:fixed;z-index:29;display:none;gap:8px;touch-action:none;user-select:none;-webkit-user-select:none}#admFab button{width:46px;height:46px;border-radius:50%;font-size:22px;padding:0;border:2px solid #f59e0b;background:rgba(2,6,23,.88);box-shadow:0 2px 8px rgba(0,0,0,.5)}' +
    '#admBrushLayer{position:fixed;left:0;top:0;right:0;bottom:0;z-index:26;display:none;touch-action:none;background:transparent}' +
    '#admBrushBar{position:fixed;z-index:29;left:50%;transform:translateX(-50%);bottom:calc(10px + env(safe-area-inset-bottom,0px));display:none;gap:6px;align-items:center;background:rgba(2,6,23,.92);border:1px solid #f59e0b;border-radius:12px;padding:6px;color:#e2e8f0;font-size:13px}#admBrushBar button{min-height:38px;min-width:38px;padding:4px 8px}#admBrushBar .on{background:#16a34a}' +
    '@media (max-width:760px),(pointer:coarse){#admTools{left:6px!important;right:6px;top:calc(8px + env(safe-area-inset-top,0px))!important;width:auto!important;max-height:calc(100vh - 100px)!important;font-size:14px!important;padding:10px!important}#admTools button{min-height:38px;font-size:13px!important;padding:6px 10px!important;margin:3px!important}#admTools input,#admTools select,#admCon{font-size:16px!important;min-height:36px;box-sizing:border-box}#admTools input[type=number]{width:90px!important}#admCon{width:100%!important}#admOv{padding:8px!important}#admOv table{display:block;overflow-x:auto;white-space:nowrap}#admOv input,#admOv select,#admOv button{font-size:16px;min-height:36px}}';
  document.head.appendChild(css2);
  const fab = document.createElement('div'); fab.id = 'admFab';
  fab.innerHTML = '<button id="admFabT" title="Công cụ admin">🛠</button><button id="admFabP" title="Bảng quản trị">👑</button>'; document.body.appendChild(fab);
  let fp = { x: null, y: null }; try { fp = JSON.parse(localStorage.getItem('twe_admfab')) || fp } catch (e) { }
  const place = () => { const x = fp.x == null ? 8 : Math.max(0, Math.min(innerWidth - 104, fp.x)), y = fp.y == null ? Math.round(innerHeight * .4) : Math.max(0, Math.min(innerHeight - 52, fp.y)); fab.style.left = x + 'px'; fab.style.top = y + 'px' };
  let drag = null, moved = false;
  fab.addEventListener('pointerdown', e => { drag = { sx: e.clientX, sy: e.clientY, ox: fab.offsetLeft || parseFloat(fab.style.left) || 0, oy: fab.offsetTop || parseFloat(fab.style.top) || 0 }; moved = false });
  addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy; if (!moved && Math.hypot(dx, dy) < 8) return; moved = true; fp = { x: drag.ox + dx, y: drag.oy + dy }; place() }, true);
  addEventListener('pointerup', e => {
    if (!drag) return; const was = moved; drag = null;
    if (was) { try { localStorage.setItem('twe_admfab', JSON.stringify(fp)) } catch (x) { } return }
    const b = e.target && e.target.closest && e.target.closest('#admFab button'); if (b) { if (b.id === 'admFabT') toolsToggle(); else TWE_ADMIN.open() }
  }, true);
  ['pointerdown', 'mousedown', 'touchstart', 'click'].forEach(ev => fab.addEventListener(ev, e => e.stopPropagation()));
  const bl = document.createElement('div'); bl.id = 'admBrushLayer'; document.body.appendChild(bl);
  const setB = e => { bscr = [e.clientX * zm(), e.clientY * zm()] };
  bl.addEventListener('pointermove', setB);
  bl.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); setB(e); wallAt(bscr[0] + camX, bscr[1] + camY, ADM.brush === 'del') });
  const bar = document.createElement('div'); bar.id = 'admBrushBar'; document.body.appendChild(bar);
  let barKey = '';
  const drawBar = () => { const k = ADM.brush + ADM.brushSize; if (k === barKey) return; barKey = k; bar.innerHTML = '<button data-a="add" class="' + (ADM.brush === 'add' ? 'on' : '') + '">🧱</button><button data-a="del" class="' + (ADM.brush === 'del' ? 'on' : '') + '">🧹</button><button data-a="-">−</button><span>' + ADM.brushSize + '</span><button data-a="+">+</button><button data-a="undo">↩️</button><button data-a="off">✖</button>' };
  bar.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button'); if (!b) return; const a = b.dataset.a;
    if (a === 'add' || a === 'del') ADM.brush = a; else if (a === '-' || a === '+') ADM.brushSize = Math.max(40, Math.min(400, ADM.brushSize + (a === '+' ? 40 : -40))); else if (a === 'undo') undoWall(); else if (a === 'off') ADM.brush = '';
    barKey = ''; drawBar(); refreshBox();
  });
  ['pointerdown', 'mousedown', 'touchstart'].forEach(ev => bar.addEventListener(ev, e => e.stopPropagation()));
  setInterval(() => { const adm = isAdm(); fab.style.display = adm ? 'flex' : 'none'; if (adm) place(); const b = !!(adm && ADM.brush && live()); bl.style.display = b ? 'block' : 'none'; bar.style.display = b ? 'flex' : 'none'; if (b) drawBar() }, 400);

  /* ================= F) HIỆU ỨNG / LỆNH CHO TẤT CẢ NGƯỜI CHƠI ĐANG KẾT NỐI MÁY CHỦ =================
     Admin gửi gói nhỏ qua kênh "thông báo toàn máy chủ" có sẵn của server; online.js chuyển gói cho TWE_FX.handle ở MỖI máy.
     Máy admin bỏ qua gói (admin dùng công cụ của mình). Người chơi P2P (không có máy chủ) không nhận được. */
  const FX_MARK = '[[FX]]', FXK = ['dark', 'darkNpc', 'night', 'rain', 'snow', 'storm', 'freezeAll', 'speed', 'dmg', 'rate', 'god', 'noclip', 'infAmmo', 'hitbox'];
  const FXDEF = { dark: false, darkNpc: true, night: false, rain: false, snow: false, storm: false, freezeAll: false, speed: 1, dmg: 1, rate: 1, god: false, noclip: false, infAmmo: false, hitbox: false };
  const FXN = { dark: 'bóng tối', night: 'ban đêm', rain: 'mưa', snow: 'tuyết (xe đi chậm hơn)', storm: 'bão (sét đánh trúng: mất 50% máu)', freezeAll: 'quái đứng yên', speed: 'tốc độ', dmg: 'sát thương', rate: 'tốc bắn', god: 'bất tử', noclip: 'xuyên tường', infAmmo: 'vô hạn đạn', hitbox: 'khung va chạm' };
  function fxClear() { FXK.forEach(k => { ADM[k] = FXDEF[k] }); FXON = false; fxUntil = 0; try { if (player && player.recalc) player.recalc() } catch (e) { } }
  setInterval(() => { if (FXON && fxUntil && Date.now() > fxUntil) fxClear(); if (fxWUntil && Date.now() > fxWUntil) { fxW = {}; fxWUntil = 0 } }, 500);
  const hostNow = () => !!(window.TWE_ONLINE && TWE_ONLINE.isHost && TWE_ONLINE.isHost());
  window.TWE_FX = {
    handle(m) { // null: không phải gói hiệu ứng · '': đã xử lý, không hiện gì · chuỗi: nội dung banner
      const s = String((m && m.m) || ''); if (s.slice(0, FX_MARK.length) !== FX_MARK) return null;
      let p; try { p = JSON.parse(s.slice(FX_MARK.length)) } catch (e) { return '' }
      if (!p) return '';
      if (isAdm()) { // admin bỏ qua hiệu ứng lên xe của mình, nhưng nếu là chủ phòng vẫn cần biết thời tiết để tính sét / làm chậm quái
        if (p.c) { fxW = {}; fxWUntil = 0 } else if (p.v) { ['snow', 'storm'].forEach(k => { if (k in p.v) fxW[k] = !!p.v[k] }); fxWUntil = p.s > 0 ? Date.now() + p.s * 1000 : 0 }
        return '';
      }
      try {
        if (p.c) { fxClear(); return 'Quản trị viên đã tắt mọi hiệu ứng' }
        if (p.h) { if (live()) player.hp = player.maxHp; return '💚 Bạn được hồi đầy máu' }
        if (p.x) { if (live()) { player.inv = 0; hurtPlayer(player.maxHp * 100, null) } return '☠️ Quản trị viên đã hạ gục mọi người' }
        if (p.n !== undefined || p.b || p.k) { if (hostNow() && live()) { if (p.k) killAll(); else if (p.b) summon(1, true); else summon(Math.max(1, Math.min(50, +p.n || 1)), false) } return '' }
        if (!p.v) return '';
        const on = [], off = [];
        Object.keys(p.v).forEach(k => {
          if (!FXK.includes(k)) return; const was = ADM[k];
          ADM[k] = typeof FXDEF[k] === 'number' ? Math.max(.1, Math.min(10, +p.v[k] || 1)) : !!p.v[k];
          if (k !== 'darkNpc' && ADM[k] !== was) (ADM[k] !== FXDEF[k] ? on : off).push(FXN[k] || k);
        });
        if (p.r) ADM.darkR = Math.max(60, Math.min(3000, +p.r || 260));
        fxUntil = p.s > 0 ? Date.now() + p.s * 1000 : 0; FXON = FXK.some(k => ADM[k] !== FXDEF[k]);
        if (!FXON) { try { player.recalc() } catch (e) { } }
        return (on.length || off.length) ? '🛠️ Quản trị viên' + (on.length ? ' bật: ' + on.join(', ') : '') + (off.length ? ' · tắt: ' + off.join(', ') : '') + (p.s > 0 ? ' (' + p.s + 's)' : '') : '';
      } catch (e) { return '' }
    }
  };
  const fxSend = (p, label) => asrv(async () => { await A('/api/admin/announce', { m: FX_MARK + JSON.stringify(p) }); log('📡 Đã gửi "' + label + '" tới mọi người đang kết nối máy chủ (không gồm admin; người chơi P2P không nhận)') });
  const FXC = ['dark', 'night', 'rain', 'snow', 'storm', 'god', 'speed', 'dmg', 'rate', 'noclip', 'fly', 'ammo', 'infammo', 'hitbox', 'npcfreeze', 'heal', 'kill', 'spawn', 'boss', 'killnpc'];
  function fxAll(c, rest) {
    const nums = rest.map(x => (x !== '' && !isNaN(+x)) ? +x : undefined), off = rest.includes('off'), sec = n => (n > 0 ? { s: Math.round(n) } : {});
    const BOOL = { night: 'night', rain: 'rain', snow: 'snow', storm: 'storm', god: 'god', noclip: 'noclip', fly: 'noclip', hitbox: 'hitbox', ammo: 'infAmmo', infammo: 'infAmmo', npcfreeze: 'freezeAll' };
    if (c === 'dark') { const r = nums[0] || ADM.darkR || 260; return fxSend(Object.assign({ v: { dark: !off, darkNpc: 1 }, r }, sec(nums[1])), off ? 'tắt bóng tối' : 'bóng tối tầm ' + r) }
    if (BOOL[c]) { const v = {}; v[BOOL[c]] = !off; return fxSend(Object.assign({ v }, sec(nums.find(n => n !== undefined))), (off ? 'tắt ' : 'bật ') + FXN[BOOL[c]]) }
    if (c === 'speed' || c === 'dmg' || c === 'rate') { const v = {}; v[c] = off || !nums[0] ? 1 : nums[0]; return fxSend(Object.assign({ v }, sec(nums[1])), FXN[c] + ' ×' + v[c]) }
    if (c === 'heal') return fxSend({ h: 1 }, 'hồi máu');
    if (c === 'kill') { if (!confirm('Hạ gục TẤT CẢ người chơi đang online?')) return log('Đã hủy'); return fxSend({ x: 1 }, 'hạ gục tất cả') }
    if (c === 'spawn') return fxSend({ n: Math.max(1, Math.min(50, nums[0] || 5)) }, 'thêm quái (chủ phòng thực hiện)');
    if (c === 'boss') return fxSend({ b: 1 }, 'triệu hồi boss (chủ phòng thực hiện)');
    if (c === 'killnpc') return fxSend({ k: 1 }, 'xóa quái (chủ phòng thực hiện)');
  }

  /* ================= G) THỜI TIẾT ẢNH HƯỞNG GAMEPLAY =================
     ❄️ Lạnh : mọi xe (người chơi, quái, bot) đi chậm COLD_SLOW; xe có nòng lửa 'f' chỉ bị chậm một phần (giảm FIRE_RESIST).
     ⛈️ Bão  : thỉnh thoảng sét đánh trúng một xe (báo trước ~0,8s bằng vòng vàng), xe trong vòng sét mất STORM_DMG máu tối đa.
     Online: chủ phòng chọn mục tiêu và gửi tia sét cho cả phòng (world 'bolt'); mỗi máy tự trừ máu xe của mình, chủ phòng trừ máu quái/bot. */
  const COLD_SLOW = .30, FIRE_RESIST = .5, STORM_DMG = .5, BOLT_R = 85, BOLT_WARN = 50, STORM_GAP = [540, 1080];
  const STORM_SRC = { team: '__storm' };
  const coldFor = e => (adx() && ADM.snow) || (isAdm() && fxW.snow && e !== player);
  const stormPlayerOn = () => adx() && ADM.storm, stormSchedOn = () => stormPlayerOn() || (isAdm() && !!fxW.storm);
  const hasFire = e => { const b = e && e.barrels; return !!(b && b.some && b.some(x => x.k === 'f')) };
  const coldMul = e => 1 - COLD_SLOW * (hasFire(e) ? 1 - FIRE_RESIST : 1);
  const coldWrap = proto => {
    if (!Object.prototype.hasOwnProperty.call(proto, 'update')) return; const o = proto.update;
    proto.update = function () {
      if (this.net || !coldFor(this)) return o.apply(this, arguments);
      const m = coldMul(this), s0 = this.speed, p0 = this.spd; if (typeof s0 === 'number') this.speed = s0 * m; if (typeof p0 === 'number') this.spd = p0 * m;
      try { return o.apply(this, arguments) } finally { if (typeof s0 === 'number' && this.speed === s0 * m) this.speed = s0; if (typeof p0 === 'number' && this.spd === p0 * m) this.spd = p0 }
    };
  };
  coldWrap(P.prototype); coldWrap(Enemy.prototype);

  function boltHit(x, y) {
    flash = 8;
    if (stormPlayerOn() && live() && !SIM && Math.hypot(player.x - x, player.y - y) < BOLT_R + (player.r || 22)) { try { hurtPlayer(player.maxHp * STORM_DMG, STORM_SRC); text(player.x, player.y - 40, '⚡ -' + Math.round(STORM_DMG * 100) + '% MÁU', '#fde047') } catch (e) { } }
    enemies.forEach(e => { if (e.dead || e.net) return; if (Math.hypot(e.x - x, e.y - y) < BOLT_R + (e.r || 22)) { try { hurtEnemy(e, e.maxHp * STORM_DMG, null) } catch (er) { } } });
  }
  function boltStrike(x, y) {
    let t = 0;
    fx.push({
      life: BOLT_WARN + 16,
      update() { t++; this.life--; if (t === BOLT_WARN) boltHit(x, y) },
      draw() {
        const sx = x - camX, sy = y - camY; ctx.save();
        if (t < BOLT_WARN) { ctx.globalAlpha = .45 + .3 * Math.sin(t * .5); ctx.strokeStyle = '#fde047'; ctx.fillStyle = 'rgba(250,204,21,.12)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, sy, BOLT_R, 0, 7); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(sx, sy, BOLT_R * t / BOLT_WARN, 0, 7); ctx.stroke() }
        else {
          ctx.globalAlpha = Math.max(0, 1 - (t - BOLT_WARN) / 16); ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.shadowColor = '#93c5fd'; ctx.shadowBlur = 24; ctx.beginPath(); ctx.moveTo(sx + 40, sy - 900);
          for (let i = 1; i <= 9; i++) { const f = i / 9; ctx.lineTo(sx + (1 - f) * 40 + (i < 9 ? Math.sin(i * 12.9 + x) * 36 : 0), sy - 900 * (1 - f)) } ctx.stroke();
          ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.arc(sx, sy, BOLT_R, 0, 7); ctx.fill();
        }
        ctx.restore();
      }
    });
  }
  window.TWE_FX.bolt = (x, y) => { if (live() && !SIM && !WATCH && stormPlayerOn()) boltStrike(x, y) };   // tia sét nhận từ chủ phòng (online)
  let nextBolt = 0;
  function stormTick() {
    if (!live() || SIM || WATCH || !stormSchedOn()) { nextBolt = 0; return }
    const on = !!(window.TWE_ONLINE && TWE_ONLINE.isOn && TWE_ONLINE.isOn());
    if (on && !TWE_ONLINE.isHost()) return;                 // máy khách chỉ nhận sét từ chủ phòng
    if (!nextBolt) nextBolt = frame + 300 + Math.random() * 300;
    if (frame < nextBolt) return;
    nextBolt = frame + STORM_GAP[0] + Math.random() * (STORM_GAP[1] - STORM_GAP[0]);
    const cand = [player].concat(enemies.filter(e => !e.dead && (on || Math.hypot(e.x - player.x, e.y - player.y) < 1400))).filter(e => !(T4 && inSafe(e)));
    const tg = cand[Math.floor(Math.random() * cand.length)]; if (!tg) return;
    if (on && TWE_ONLINE.bolt) TWE_ONLINE.bolt(tg.x, tg.y);
    if (stormPlayerOn()) boltStrike(tg.x, tg.y); else boltHit(tg.x, tg.y);   // chủ phòng là admin (bỏ qua hiệu ứng cho xe mình): chỉ tính cho quái/bot
  }

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
    possess() { possessEnemy(selEnemy()) },
    all_(c) { const k = val('adAk'); slash(c, c === 'give' ? ['all', k] : c === 'mute' ? ['all', '10'] : c === 'gems' ? ['all', val('adAg') || '0'] : ['all']) },
    announce() { const m = val('adAn'); if (!m) return log('Nhập nội dung thông báo'); slash('announce', [m]) },
    fx(c) { const s = val('adFxS') || '', r = val('adFxR') || String(ADM.darkR || 260), n = val('adFxN') || '2', a = c === 'dark' ? [r, s] : (c === 'speed' || c === 'dmg' || c === 'rate') ? [n, s] : c === 'spawn' ? [n] : (c === 'heal' || c === 'kill' || c === 'boss' || c === 'killnpc') ? [] : [s]; fxAll(c, a.filter(x => x !== '')) },
    fxOff() { fxSend({ c: 1 }, 'tắt mọi hiệu ứng') },
    darkR() { ADM.darkR = Math.max(60, +val('adDr') || 260); log('Tầm nhìn bóng tối = ' + ADM.darkR) },
    brush(m) { const s = Math.round((+val('adBs') || ADM.brushSize) / 40) * 40; ADM.brushSize = Math.max(40, s); ADM.brush = ADM.brush === m ? '' : m; log(ADM.brush ? (ADM.brush === 'add' ? '🧱 Chế độ VẼ tường: bấm lên bản đồ' : '🧹 Chế độ XÓA tường: bấm vào tường') : 'Đã tắt chế độ chỉnh bản đồ'); if (ADM.brush && typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches) toolsToggle(false); else refreshBox() },
    undo() { undoWall() }, resetMap() { resetWalls() },
    addGems() { const n = +val('adGm') || 0; D.gems = Math.max(0, (D.gems || 0) + n); save(); log('Gems = ' + D.gems) },
    giveT() { const k = val('adT'); if (!S[k]) return log('Không có xe ' + k); if (!D.owned.includes(k)) D.owned.push(k); save(); log('Đã cấp xe ' + k) },
    useT() { const k = val('adT'); if (!S[k]) return log('Không có xe ' + k); if (live()) { player.setT(k); log('Đã đổi sang xe ' + k) } else log('Cần đang trong trận') },
    takeT() { const k = val('adT'); if (!k) return; D.owned = D.owned.filter(x => x !== k); save(); log('Đã thu hồi xe ' + k) },
    inv() { log('🎒 Gems: ' + D.gems + ' | Xe (' + (D.owned || []).length + '): ' + (D.owned || []).join(', ') + ((D.dguns || []).length ? ' | Súng: ' + D.dguns.join(', ') : '')) },
    con(inp) {
      let line = inp.value.trim(); inp.value = ''; if (!line) return; log('> ' + line); line = line.replace(/^\/+/, ''); if (!line) return;
      const [c, ...a] = line.split(/\s+/), n = +a[0];
      try {
        if (/^(all|\*)$/i.test(a[0] || '') && ['gems', 'exp', 'level', 'max'].includes(c.toLowerCase())) { runAll(c.toLowerCase(), a.slice(1)); return }
        if (/^(all|\*)$/i.test(a[0] || '') && FXC.includes(c.toLowerCase())) { fxAll(c.toLowerCase(), a.slice(1)); return }
        switch (c.toLowerCase()) {
          case 'help': log('Công cụ: god noclip invis hitbox night rain snow storm freeze inf dark [R|off|npc] ammo | speed N | dmg N | rate N | gems N | exp N | level N | hp | max | spawn N | boss | killall | tank KEY | possess | brush add|del [cỡ] | undo | resetmap | inv | take KEY | deathwait [giây] | js CODE'); log('Lệnh /: /kick /ban /unban /mute /unmute /freeze [tên] · /slap /kill /spec /heal [tên] · /tp X Y · /tp [A] [B] · /goto /bring [tên] · /give [tên] KEY · /map small|big · /restart (/rr) · /bots N · /announce [nội dung]');
          log('Hiệu ứng cho TẤT CẢ online: /dark all [R] [giây] · /night|rain|snow|storm|god|noclip|ammo|hitbox|npcfreeze all [off] [giây] · /speed|dmg|rate all N [giây] · /heal all · /kill all · /spawn all N · /boss all · /killnpc all · /clearfx');
          log('Gửi tới TẤT CẢ online (qua server, thêm force để gửi mọi tài khoản): /kick|/freeze [giây]|/bring|/mute [phút]|/unmute|/ban [giờ]|/unban|/give KEY|/gems N|/exp N|/level N|/max  — thêm chữ all, vd: /kick all'); break;
          case 'god': U.tog('god'); break; case 'noclip': case 'fly': U.tog('noclip'); break; case 'invis': U.tog('invisible'); break; case 'hitbox': U.tog('hitbox'); break; case 'night': U.tog('night'); break; case 'rain': U.tog('rain'); break; case 'snow': U.tog('snow'); break; case 'storm': U.tog('storm'); break; case 'freeze': if (a.length) slash('freeze', a); else { U.tog('freezeAll'); log('Đóng băng quái: ' + (ADM.freezeAll ? 'BẬT' : 'TẮT')) } break;
          case 'dark': if (a[0] === 'npc') { ADM.darkNpc = !ADM.darkNpc; log('NPC cũng bị tối: ' + (ADM.darkNpc ? 'BẬT' : 'TẮT')); break } if (a[0] === 'off') ADM.dark = false; else { if (+a[0] >= 60) ADM.darkR = Math.round(+a[0]); ADM.dark = a[0] === undefined ? !ADM.dark : true } log('Bóng tối: ' + (ADM.dark ? 'BẬT (tầm nhìn ' + ADM.darkR + (ADM.darkNpc ? ', NPC cũng bị tối' : '') + ')' : 'TẮT')); break;
          case 'ammo': case 'infammo': U.tog('infAmmo'); log('Vô hạn đạn: ' + (ADM.infAmmo ? 'BẬT' : 'TẮT')); break;
          case 'deathwait': if (a[0] !== undefined && !isNaN(n)) deathWait = Math.max(0, Math.min(60, Math.round(n))); log('Thời gian chờ khi chết: ' + (deathWait > 0 ? deathWait + ' giây' : 'TẮT')); break;
          case 'clearfx': fxSend({ c: 1 }, 'tắt mọi hiệu ứng'); break;
          case 'announce': case 'say': case 'kick': case 'ban': case 'unban': case 'mute': case 'unmute': case 'slap': case 'kill': case 'spec': case 'heal': case 'equip': case 'goto': case 'bring': case 'map': case 'changemap': case 'restart': case 'rr': case 'gravity': case 'bots': slash(c.toLowerCase(), a); break; case 'inf': U.all(); break;
          case 'speed': ADM.speed = n || 1; break; case 'dmg': ADM.dmg = n || 1; break; case 'rate': ADM.rate = n || 1; break;
          case 'gems': D.gems = Math.max(0, n || 0); save(); log('Gems = ' + D.gems); break;
          case 'exp': if (live()) player.addExp(n || 0); else grantExp(n || 0); break;
          case 'level': if (live()) player.addLevels(n || 1); break;
          case 'hp': U.heal(); break; case 'max': U.maxst(); break;
          case 'tp': slash('tp', a); break;
          case 'spawn': log('Đã triệu hồi ' + summon(n || 1, false)); break; case 'boss': summon(1, true); break; case 'killall': log('Đã quét ' + killAll()); break;
          case 'tank': if (S[a[0]] && live()) { player.setT(a[0]); log('Đã đổi xe ' + a[0]) } else log('Không có xe ' + a[0]); break;
          case 'give': slash('give', a); break;
          case 'possess': if (live()) possessEnemy(nearestEnemy()); break;
          case 'brush': ADM.brush = (a[0] === 'add' || a[0] === 'del') ? a[0] : ''; if (+a[1] > 0) ADM.brushSize = Math.max(40, Math.round(+a[1] / 40) * 40); log('Brush: ' + (ADM.brush || 'tắt') + ' ' + ADM.brushSize); break;
          case 'undo': undoWall(); break; case 'resetmap': resetWalls(); break;
          case 'inv': U.inv(); break; case 'take': D.owned = D.owned.filter(x => x !== a[0]); save(); log('Đã thu hồi ' + a[0]); break;
          case 'js': { const r = new Function('return (' + line.slice(3) + ')')(); log(String(r)); break }
          default: log('Lệnh lạ. Gõ help.');
        }
      } catch (e) { log('Lỗi: ' + e.message) }
      refreshBox();
    }
  };

  /* ---- hook vào game ---- */
  const on = k => adx() && ADM[k];
  const _pushOut = pushOut; pushOut = function (o, r) { if (on('noclip') && o === player) return; return _pushOut.apply(this, arguments) };
  const _hurt = hurtPlayer; hurtPlayer = function () { if (on('god')) return; return _hurt.apply(this, arguments) };
  let flash = 0; const snow = Array.from({ length: 120 }, () => ({ x: Math.random(), y: Math.random(), v: .5 + Math.random() * 1.2, s: Math.random() * 6, r: 1 + Math.random() * 2.2 }));
  const rain = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random(), v: .6 + Math.random() * .8 }));
  const _dz = drawZones; drawZones = function () {
    _dz.apply(this, arguments); if (!adx() || typeof player === 'undefined' || !player) return;
    if (ADM.hitbox) {
      ctx.save(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#22d3ee'; ctx.beginPath(); ctx.arc(player.x - camX, player.y - camY, 24, 0, 7); ctx.stroke();
      ctx.strokeStyle = '#f87171'; enemies.forEach(e => { if (!e.dead && Math.abs(e.x - player.x) < 1200 && Math.abs(e.y - player.y) < 800) { ctx.beginPath(); ctx.arc(e.x - camX, e.y - camY, e.r || 24, 0, 7); ctx.stroke() } });
      ctx.strokeStyle = '#fbbf24'; let n = 0; for (const p of proj) { if (p.dead || ++n > 400) continue; ctx.beginPath(); ctx.arc(p.x - camX, p.y - camY, p.r || 6, 0, 7); ctx.stroke() }
      ctx.strokeStyle = '#a78bfa'; for (const t of traps) { ctx.beginPath(); ctx.arc(t.x - camX, t.y - camY, t.r || 12, 0, 7); ctx.stroke() }
      ctx.strokeStyle = '#34d399'; for (const q of OBS) { const X = q[0] - camX, Y = q[1] - camY; if (X > cv.width || Y > cv.height || X + (q[2] - q[0]) < 0 || Y + (q[3] - q[1]) < 0) continue; ctx.strokeRect(X, Y, q[2] - q[0], q[3] - q[1]) } ctx.restore();
    }
    if (ADM.night) { const x = player.x - camX, y = player.y - camY, g = ctx.createRadialGradient(x, y, 120, x, y, 720); g.addColorStop(0, 'rgba(2,6,23,0)'); g.addColorStop(1, 'rgba(2,6,23,.82)'); ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height); ctx.restore() }
    if (ADM.snow) { ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.85)'; snow.forEach(f => { f.y += f.v * .006; f.x += Math.sin(frame / 40 + f.s) * .0008; if (f.y > 1) { f.y = 0; f.x = Math.random() } if (f.x < 0) f.x += 1; if (f.x > 1) f.x -= 1; ctx.beginPath(); ctx.arc(f.x * cv.width, f.y * cv.height, f.r, 0, 7); ctx.fill() }); ctx.restore() }
    if (ADM.storm) {
      ctx.save(); ctx.fillStyle = 'rgba(2,6,23,.38)'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.strokeStyle = 'rgba(147,197,253,.7)'; ctx.lineWidth = 1.2; ctx.beginPath();
      rain.forEach(r => { r.y += r.v * .045; r.x -= .01 * r.v; if (r.y > 1) { r.y = 0; r.x = Math.random() * 1.3 } if (r.x < 0) r.x += 1; const X = r.x * cv.width, Y = r.y * cv.height; ctx.moveTo(X, Y); ctx.lineTo(X - 9, Y + 24) }); ctx.stroke();
      if (flash <= 0 && Math.random() < .004) flash = 8; if (flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (.45 * flash / 8) + ')'; ctx.fillRect(0, 0, cv.width, cv.height); flash-- } ctx.restore();
    }
    if (ADM.brush && bscr && live()) { const s = ADM.brushSize, wx = bscr[0] + camX, wy = bscr[1] + camY, gx = Math.floor(wx / 40) * 40, gy = Math.floor(wy / 40) * 40; ctx.save(); ctx.lineWidth = 2; ctx.strokeStyle = ADM.brush === 'add' ? '#22c55e' : '#ef4444'; if (ADM.brush === 'add') ctx.strokeRect(gx - camX, gy - camY, s, s); else { ctx.beginPath(); ctx.arc(bscr[0], bscr[1], 14, 0, 7); ctx.stroke() } ctx.restore() }
    if (ADM.rain) { ctx.save(); ctx.strokeStyle = 'rgba(147,197,253,.55)'; ctx.lineWidth = 1; ctx.beginPath(); rain.forEach(r => { r.y += r.v * .02; r.x -= .004 * r.v; if (r.y > 1) { r.y = 0; r.x = Math.random() * 1.2 } if (r.x < 0) r.x += 1; const X = r.x * cv.width, Y = r.y * cv.height; ctx.moveTo(X, Y); ctx.lineTo(X - 5, Y + 16) }); ctx.stroke(); ctx.restore() }
  };
  function tick() {
    requestAnimationFrame(tick);
    stormTick();
    if (!adx() || !live()) return;
    if (ADM.infGems && D.gems < 1e11) D.gems = 1e12;
    if (ADM.infExp && frame % 90 === 0) { try { player.addExp(1e8) } catch (e) { } }
    if (ADM.god) player.hp = player.maxHp;
    if (ADM.infAmmo) player.cd = 0;
    if (ADM.spec) { if (ADM.spec.dead) { ADM.spec = null; Object.assign(ADM, specPrev); log('Mục tiêu đã chết — thoát theo dõi') } else { player.x = ADM.spec.x; player.y = ADM.spec.y } }
    if (ADM.speed !== 1) player.speed = (player.base.speed + player.st.mv * SF.mv) * ADM.speed;
    if (ADM.dmg !== 1) player.dmg = (player.base.dmg + player.st.bd * SF.bd) * ADM.dmg;
    if (ADM.rate !== 1) player.rt = Math.max(2, player.base.reload * Math.pow(SF.rl, player.st.rl)) / ADM.rate;
    if (ADM.noclip && player.x !== undefined) { player.x = Math.max(40, Math.min(MAP - 40, player.x)); player.y = Math.max(40, Math.min(MAP - 40, player.y)) }
  }
  requestAnimationFrame(tick);
})();
