/* eslint-disable */
/* Tank Warfare: Evolution — CHẾ ĐỘ ONLINE (4 chế độ)
   Nạp SAU các script của game nên dùng chung D, S, player, enemies, proj, traps, shapes...

   CHẾ ĐỘ (giống offline + 2 chế độ mới):
     🌍 pve  : Sinh tồn PvE co-op - cùng thế giới NPC/shape như offline, lưu tiến trình thật.
     🛡️ team : Chiến đấu theo Team 2-10 đội - căn cứ, vùng an toàn, cờ sáp nhập, bot lấp chỗ.
     👑 koth : (MỚI) Vua đồi - chiếm vùng giữa bản đồ, 1 điểm/giây.
     💀 br   : (MỚI) Sinh tồn thu hẹp - 1 mạng, vòng bo co dần, người cuối cùng thắng.

   CÁCH HOẠT ĐỘNG:
   - Mỗi người mô phỏng xe CỦA MÌNH; người khác hiện là "xe ảo" (Enemy có cờ net) bám theo trạng thái nhận được.
   - Đạn/laser/bẫy của bạn được gửi đi; máy người bị bắn tự tính sát thương lên xe họ, chết thì báo về hub.
   - CHỦ PHÒNG điều khiển "thế giới": chạy NPC, bot, shape, cờ y như offline rồi phát cho mọi người.
     Người khác bắn trúng NPC/bot/shape thì báo cho chủ phòng; chủ phòng tính sát thương và gửi phần thưởng (EXP, gems). */
(function () {
  const LS = 'twe_online';
  const ls = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}') } catch (e) { return {} } };
  const lsSet = o => { try { localStorage.setItem(LS, JSON.stringify(Object.assign(ls(), o))) } catch (e) { } };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
  const FFA = ['#22d3ee', '#f472b6', '#facc15', '#4ade80', '#c084fc', '#fb923c', '#38bdf8', '#f87171', '#a3e635', '#e879f9'];
  const tcol = t => TC[t] || FFA[(parseInt(String(t).slice(1), 36) || 0) % FFA.length];
  const tname = t => TN[t] || (names[String(t).slice(1)] || 'Người chơi');

  const MODES = {
    pve: { ico: '🌍', name: 'Sinh tồn PvE (co-op)', desc: 'Cùng bản đồ lớn với NPC và shape như offline: lên cấp, tiến hóa, nhận gems (lưu tiến trình thật). NPC đánh trả khi bạn bắn. Chết mất 75% cấp như offline, rồi vào lại được.' },
    team: { ico: '🛡️', name: 'Chiến đấu theo Team', desc: '2–10 đội, mỗi đội một căn cứ có vùng an toàn. Phá cờ đội địch để sáp nhập đội đó vào đội bạn. Bot lấp chỗ trống như offline. Đủ số hạ gục là thắng.' },
    koth: { ico: '👑', name: 'Vua đồi (MỚI)', desc: 'Một vùng tròn ở giữa bản đồ. Đội nào đứng MỘT MÌNH trong vùng thì ghi 1 điểm/giây (có người đội khác bước vào là tranh chấp, không ai được điểm). Đủ điểm trước là thắng.' },
    br: { ico: '💀', name: 'Sinh tồn thu hẹp (MỚI)', desc: 'Mỗi người một đội, chỉ có MỘT mạng. Vòng bo thu nhỏ dần, ở ngoài vòng sẽ mất máu. Người cuối cùng sống sót thắng.' }
  };

  let ws = null, myId = null, room = null, view = 'home', status = '', rooms = [], ping = 0, chatLog = [];
  let ON = false, ready = false, MODE = 'team', cfgM = null, hostId = null, AUTH = false, myTeam = 'b', mySlot = 0, teamSize = {}, nPlayers = 1;
  let scoreT = {}, endAt = 0, aliveN = 0, lastAtk = null, stats = {}, names = {}, startTimer = null, endInfo = null, elimPlace = 0, lastSt = 0;
  const ghosts = new Map(), npcs = new Map(), shapeG = new Map(), reg = new Map(), shapeReg = new Map(), hitE = new Map(), hitS = new Map(), outL = [];
  let nidC = 0, sidC = 0, allowNew = false, allowRemote = false, elimPending = false;

  const prefs = () => {
    const o = Object.assign({ name: 'Xe' + Math.floor(Math.random() * 900 + 100), url: '', tk: '', mode: '' }, ls());
    const a = window.TWE_ACCOUNT && window.TWE_ACCOUNT.user; if (a) o.name = a.username; // đã đăng nhập: dùng tên tài khoản
    return o;
  };
  let autoWs = false, peer = null, hub = null, p2pHost = false;
  const curMode = () => prefs().mode || (autoWs ? 'ws' : 'p2p'); // p2p = không cần máy chủ · ws = máy chủ riêng
  function defUrl() {
    const p = prefs(); if (p.url) return p.url;
    if (/^https?:$/.test(location.protocol) && !/github\.io$/.test(location.hostname)) return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
    return 'ws://localhost:8080';
  }
  const fairKey = k => { const t = S[k].tier; return t !== 'ADMIN' && t !== 'MYTHIC' && !/^S{2,}$/.test(t) };
  const allowed = (k, fair) => !!S[k] && (!fair || (fairKey(k) && !S[k].rot)); // mặc định: MỌI xe (kể cả ADMIN/Mythic/xe cụm xoay)
  function myTank() {
    const md = room ? room.cfg.mode : 'team', fair = room ? room.cfg.fair : false, p = prefs();
    if (md === 'pve') return S[D.type] ? D.type : 'basic'; // PvE: dùng xe theo tiến trình của bạn
    for (const k of [p.tk, D.type, 'basic']) if (k && allowed(k, fair)) return k;
    return 'basic';
  }
  const tkName = k => (S[k] ? S[k].name : k);

  /* ============ Kết nối ============ */
  function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)) }
  /* Gắn các hàm xử lý vào một "ổ cắm" (WebSocket thật hoặc ổ cắm P2P giả lập cùng giao diện) */
  function attach(w, label) {
    ws = w; let opened = false;
    w.onopen = () => { opened = true; status = ''; send({ t: 'hello', name: prefs().name }); w._res && w._res() };
    w.onerror = () => { if (!opened) { status = '❌ Không kết nối được ' + label; render(); w._rej && w._rej(new Error('conn')) } };
    w.onclose = () => {
      if (ws !== w) return; ws = null; myId = null; const was = room; room = null; p2pClose();
      if (ON) { stopMatch(); status = '⚠️ Mất kết nối' + (curMode() === 'p2p' ? ' (chủ phòng đã thoát?)' : ' máy chủ'); view = 'home'; show() }
      else if (was) { status = '⚠️ Mất kết nối' + (curMode() === 'p2p' ? ' (chủ phòng đã thoát?)' : ' máy chủ'); view = 'home'; render() }
    };
    w.onmessage = e => { let m; try { m = JSON.parse(e.data) } catch (x) { return } onMsg(m) };
  }
  function connect() { // chế độ máy chủ riêng (WebSocket)
    return new Promise((res, rej) => {
      if (ws && ws.readyState === 1) return res();
      const url = defUrl(); status = 'Đang kết nối ' + url + ' ...'; render();
      let w; try { w = new WebSocket(url) } catch (e) { status = 'Địa chỉ máy chủ không hợp lệ'; render(); return rej(e) }
      w._res = res; w._rej = rej;
      attach(w, 'máy chủ (' + url + '). Hãy chạy "node server.js" hoặc nhập đúng địa chỉ');
    });
  }

  /* ---------- Chế độ P2P: không cần máy chủ ---------- */
  const PEER_URLS = ['peerjs.min.js', 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js', 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.4/peerjs.min.js'];
  function loadPeer() {
    return new Promise((res, rej) => {
      let i = 0;
      (function next() {
        if (window.Peer) return res();
        if (i >= PEER_URLS.length) return rej(new Error('Không tải được thư viện PeerJS (kiểm tra Internet)'));
        const sc = document.createElement('script'); sc.src = PEER_URLS[i++];
        sc.onload = () => window.Peer ? res() : next(); sc.onerror = () => { sc.remove(); next() }; document.head.appendChild(sc);
      })();
    });
  }
  const CODE_CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const newCode = () => Array.from({ length: 4 }, () => CODE_CH[Math.floor(Math.random() * CODE_CH.length)]).join('');
  function p2pClose() { try { peer && peer.destroy() } catch (e) { } peer = null; if (hub) { try { hub.closeAll() } catch (e) { } } hub = null; p2pHost = false }
  function p2pSock(sendFn, closeFn) { return { readyState: 1, send: sendFn, close() { this.readyState = 3; closeFn && closeFn() } } }

  /* Chủ phòng: tạo hub ngay trong trình duyệt + mở cổng PeerJS với mã phòng */
  async function p2pStartHost() {
    if (!window.TWE_HUB) throw new Error('Thiếu file hub.js (cần để làm chủ phòng không máy chủ)');
    status = 'Đang tạo phòng P2P...'; render();
    await loadPeer(); p2pClose();
    let code, tries = 0;
    for (; ;) {
      code = newCode();
      try {
        await new Promise((res, rej) => {
          const p = new Peer('twe-' + code, { debug: 0 });
          const to = setTimeout(() => { try { p.destroy() } catch (e) { } rej(new Error('timeout')) }, 12000);
          p.on('open', () => { clearTimeout(to); peer = p; res() });
          p.on('error', e => { clearTimeout(to); try { p.destroy() } catch (x) { } rej(e) });
        });
        break;
      } catch (e) { if (e && e.type === 'unavailable-id' && ++tries < 6) continue; throw new Error('Không kết nối được dịch vụ ghép nối PeerJS' + (e && e.type ? ' (' + e.type + ')' : '')) }
    }
    hub = TWE_HUB.createHub({ fixedCode: code }); p2pHost = true;
    peer.on('error', e => { if (ON) feed('⚠️ P2P: ' + esc(e.type || e.message || 'lỗi')) });
    peer.on('connection', conn => {
      let c = null;
      const open = () => {
        c = hub && hub.addConn(o => { try { conn.send(JSON.stringify(o)) } catch (e) { } });
        conn.on('data', d => { try { hub && c && hub.handle(c, JSON.parse(typeof d === 'string' ? d : JSON.stringify(d))) } catch (e) { } });
      };
      conn.on('open', open);
      conn.on('close', () => { c && hub && hub.drop(c) });
      conn.on('error', () => { c && hub && hub.drop(c) });
    });
    // kết nối nội bộ của chính chủ phòng (không qua mạng)
    const w = p2pSock(str => { setTimeout(() => { try { hub && hub.handle(lc, JSON.parse(str)) } catch (e) { } }, 0) }, () => { });
    let lc = null;
    attach(w, 'phòng P2P');
    lc = hub.addConn(o => { const d = JSON.stringify(o); setTimeout(() => { w.onmessage && w.onmessage({ data: d }) }, 0) });
    w.onopen();
    return code;
  }

  /* Người vào phòng: nối thẳng tới chủ phòng bằng mã */
  async function p2pJoinRoom(code) {
    status = 'Đang tìm phòng ' + code + ' ...'; render();
    await loadPeer(); p2pClose();
    await new Promise((res, rej) => {
      const p = new Peer({ debug: 0 }); let done = false;
      const fail = m => { if (done) return; done = true; clearTimeout(to); try { p.destroy() } catch (e) { } rej(new Error(m)) };
      const to = setTimeout(() => fail('Không kết nối được tới phòng ' + code + ' (chủ phòng offline hoặc mạng chặn P2P)'), 15000);
      p.on('error', e => fail(e && e.type === 'peer-unavailable' ? 'Không tìm thấy phòng ' + code : 'Lỗi P2P: ' + ((e && e.type) || e)));
      p.on('open', () => {
        const conn = p.connect('twe-' + code, { reliable: true, serialization: 'json' });
        conn.on('error', () => fail('Không kết nối được tới phòng ' + code));
        conn.on('open', () => {
          if (done) return; done = true; clearTimeout(to); peer = p;
          const w = p2pSock(str => { try { conn.send(str) } catch (e) { } }, () => { try { conn.close() } catch (e) { } });
          conn.on('data', d => { w.onmessage && w.onmessage({ data: typeof d === 'string' ? d : JSON.stringify(d) }) });
          conn.on('close', () => { w.readyState = 3; w.onclose && w.onclose() });
          attach(w, 'phòng P2P'); w.onopen(); res();
        });
      });
    });
  }
  const failMsg = e => { status = '❌ ' + ((e && e.message) || 'Lỗi kết nối'); render() };

  setInterval(() => { if (ws && ws.readyState === 1) send({ t: 'ping', ts: performance.now() }) }, 3000);

  /* ============ Nhận tin từ hub ============ */
  function onMsg(m) {
    switch (m.t) {
      case 'welcome': myId = m.id; break;
      case 'pong': ping = Math.round(performance.now() - m.ts); break;
      case 'rooms': rooms = m.list || []; if (view === 'home') render(); break;
      case 'err': status = '⚠️ ' + m.m; render(); break;
      case 'room': room = m; if (!ON && !startTimer && view !== 'end' && view !== 'elim') view = 'room'; if (!$('ol').classList.contains('hidden')) render(); break;
      case 'left': if (m.self) { room = null; view = 'home'; render() } else { dropGhost(m.id); if (ON) feed('<b>' + esc(names[m.id] || 'Người chơi') + '</b> đã rời trận') } break;
      case 'kicked': room = null; view = 'home'; status = 'Bạn bị chủ phòng mời ra'; render(); break;
      case 'chat': chatLog.push(m); if (chatLog.length > 40) chatLog.shift(); if (ON) feed('<span style="color:' + tcol(m.team) + '">' + esc(m.name) + '</span>: ' + esc(m.m)); else if (view === 'room') renderChat(); break;
      case 'start': onStart(m); break;
      case 'tick': if (ON) { endAt = m.left ? performance.now() + m.left : 0; scoreT = m.score || {}; aliveN = m.alive || 0; Object.keys(scoreT).forEach(t => { if (tscore[t] !== undefined) tscore[t] = scoreT[t] }) } break;
      case 'st': onState(m); break;
      case 'fire': onFire(m); break;
      case 'kill': onKill(m); break;
      case 'end': onEnd(m); break;
      case 'w': onWorld(m.d || {}); break;
      case 'h': onHitMsg(m); break;
      case 'to': onTo(m.d || {}); break;
    }
  }

  /* ============ Bắt đầu / kết thúc trận ============ */
  function onStart(m) {
    if (ON || startTimer) return;
    room = room || { code: '----', cfg: m.cfg, players: [], host: m.host };
    cfgM = m.cfg; MODE = m.cfg.mode; hostId = m.host; AUTH = m.host === myId;
    const me = m.players.find(p => p.id === m.you) || { team: 'b', slot: 0 };
    myTeam = me.team; mySlot = me.slot; nPlayers = m.players.length;
    teamSize = {}; m.players.forEach(p => { teamSize[p.team] = (teamSize[p.team] || 0) + 1 });
    names = {}; stats = {}; m.players.forEach(p => { names[p.id] = p.name; stats[p.id] = { k: 0, d: 0, team: p.team } });
    scoreT = m.score || {}; endInfo = null; elimPlace = 0; aliveN = m.players.length;
    const t0 = performance.now(), wait = m.in || 0;
    endAt = cfgM.time ? t0 + wait + m.left : 0;
    if (wait > 0) {
      view = 'cd'; show();
      startTimer = setInterval(() => {
        const left = t0 + wait - performance.now();
        const el = $('olCdN'); if (el) el.textContent = Math.max(1, Math.ceil(left / 1000));
        if (left <= 0) { clearInterval(startTimer); startTimer = null; beginMatch(m) }
      }, 100);
    } else beginMatch(m);
  }

  const C0 = () => MAP / 2, HILL_R = 300;
  function teamSpawn(team, slot) {
    const z = ZN[team] || ZN[TEAMS[0]]; let x, y, n = 0;
    if (slot < 0) { const a = rnd(0, 6.28), r = rnd(0, z.r * .7); x = z.x + Math.cos(a) * r; y = z.y + Math.sin(a) * r }
    else { const g2 = Math.min(90, z.r * .34); x = z.x + (Math.floor(slot / 4) - 2) * g2; y = z.y + ((slot % 4) - 1.5) * g2 }
    while (hitWall(x, y, 40) && n++ < 60) { const a = rnd(0, 6.28), r = rnd(0, z.r * .8); x = z.x + Math.cos(a) * r; y = z.y + Math.sin(a) * r }
    return { x, y };
  }
  function brSpawn(slot, n) {
    const a = (slot / Math.max(1, n)) * Math.PI * 2, C = C0(); let x = C + Math.cos(a) * 1700, y = C + Math.sin(a) * 1700, k = 0;
    while (hitWall(x, y, 50) && k++ < 60) { x += (C - x) * .05; y += (C - y) * .05 }
    return { x, y };
  }
  const spawnFor = (team, slot, rand) => MODE === 'br' ? brSpawn(slot, nPlayers) : (MODE === 'pve' ? { x: rnd(400, MAP - 400), y: rnd(400, MAP - 400) } : teamSpawn(team, rand ? -1 : slot));
  const brR = () => { const tot = cfgM.time * 1000, el = tot - (endAt - performance.now()), f = Math.max(0, Math.min(1, el / (tot * .85))); return 2900 + (160 - 2900) * f };

  function clearMaps() { ghosts.clear(); npcs.clear(); shapeG.clear(); reg.clear(); shapeReg.clear(); hitE.clear(); hitS.clear(); outL.length = 0; nidC = 0; sidC = 0 }
  const HUDS = ['stats', 'sideL', 'sideR', 'xpbar', 'tbtns', 'lb', 'lbfull', 'simhelp'];

  function beginMatch(m) {
    hideOL(); ready = false; ON = true; buildKeys();
    const old = mkBot; mkBot = function () { };
    try {
      if (MODE === 'team' || MODE === 'koth') { T4N = cfgM.teams; T4LV = cfgM.lv; begin('team') }
      else if (MODE === 'br') begin('pvp');
      else begin('pve');
    } finally { mkBot = old }
    enemies = []; proj = []; traps = []; minions = []; fx = []; shapes = []; clearMaps();
    player.team = myTeam;
    if (MODE !== 'pve') {
      player.pvp = true; player.setT(myTank());
      const L = cfgM.lv; player.st = { bd: L, bh: L, bs: L, rl: L, maxHp: L, rg: L, mv: L, body: L, rng: 0 }; player.cap = { ...player.cap }; player.pts = 0;
      player.recalc(); player.hp = player.maxHp; player.color = tcol(myTeam);
      if (cfgM.fair) player.drones = [];
      evoQ = [];
      const q = spawnFor(myTeam, mySlot, false); player.x = q.x; player.y = q.y; player.inv = 180;
      HUDS.forEach(i => { const e = $(i); e && e.classList.add('hidden') });
    } else { const t = $('tbtns'); t && t.classList.add('hidden') }
    if (MODE === 'koth') FLAGS = {};
    if (MODE === 'team' || MODE === 'koth') TEAMS.forEach(t => { tscore[t] = scoreT[t] || 0 });
    frame = 0; lastAtk = null;
    m.players.forEach(p => { if (p.id !== myId && p.alive !== false) twGhost(p) });
    $('olFeed').innerHTML = ''; $('olHud').classList.remove('hidden'); ready = true; lastSt = 0;
    text(player.x, player.y - 60, MODES[MODE].ico + ' ' + MODES[MODE].name.replace(' (MỚI)', ''), '#fbbf24');
  }
  function cleanup() {
    ON = false; ready = false; running = false; if (startTimer) { clearInterval(startTimer); startTimer = null }
    clearMaps(); enemies = []; proj = []; traps = []; shapes = [];
    ['olHud', 'olSb', 'olChat'].forEach(i => $(i).classList.add('hidden'));
    const nb = $('hud2').firstElementChild; if (nb && nb.tagName !== 'CANVAS') nb.classList.remove('hidden');
  }
  function stopMatch() { cleanup(); _toMenu() }
  function elimMe() { elimPending = false; if (!ON) return; cleanup(); _toMenu(); view = 'elim'; show() }
  function onEnd(m) {
    const was = ON || startTimer; endInfo = m; scoreT = m.score || {};
    if (was) stopMatch();
    view = 'end'; show();
  }
  function leave(toHome) {
    send({ t: 'leave' }); room = null; if (ON || startTimer) stopMatch(); view = 'home';
    if (curMode() === 'p2p') { const w = ws; ws = null; setTimeout(() => { try { w && w.close() } catch (e) { } p2pClose() }, 150) }
    if (toHome) show(); else render();
  }

  /* ============ Xe ảo: người chơi khác, NPC/bot, shape ============ */
  function netEnemy(sp) {
    allowNew = true; let e; try { e = new Enemy() } finally { allowNew = false }
    e.net = true; e.barrels = sp.bar; e.ram = sp.ram; e.mode = sp.mode; e.shape = sp.shape; e.bc = sp.bc; e.ring = sp.color; e.nm = sp.name;
    e.maxHp = e.hp = sp.hp; e.r = 26; e.aggro = 0; e.af = false; e.regen = 0; e.dead = false; e.bd = 10; e.rmul = 1; e.bhm = 1; e.frz = 0; e.dmg = 10; e.bodyD = 10; e.ang = e.ta = 0;
    e.gainExp = e.gainLevels = function () { };
    e.draw = function () { const b = this.barrels; if (b && b.rots) this.barrels = liveBars(this); try { Enemy.prototype.draw.call(this) } finally { this.barrels = b } };
    e.update = function () {
      this.x += (this.tx - this.x) * .4; this.y += (this.ty - this.y) * .4;
      let d = this.ta - this.ang; d = ((d + Math.PI * 3) % (Math.PI * 2)) - Math.PI; this.ang += d * .5;
    };
    return e;
  }
  function twGhost(p) {
    const sp = S[p.tk] || S.basic, e = netEnemy(sp);
    e.netId = p.id; e.team = p.team; e.tk = p.tk; e.label = p.name + ' [' + sp.tier + ']'; e.color = tcol(p.team);
    const q = spawnFor(p.team, p.slot || 0, false); e.x = e.tx = q.x; e.y = e.ty = q.y;
    ghosts.set(p.id, e); names[p.id] = p.name; if (!stats[p.id]) stats[p.id] = { k: 0, d: 0, team: p.team };
    enemies.push(e); return e;
  }
  function dropGhost(id) { const g = ghosts.get(id); if (g) { g.dead = true; ghosts.delete(id) } }
  function ghostOf(id) {
    if (!id || id === myId) return null;
    const g = ghosts.get(id); if (g && !g.dead) return g;
    const info = room && room.players && room.players.find(p => p.id === id);
    if (!info || info.alive === false) return null;
    return twGhost({ id, name: info.name, team: info.team, tk: info.tk, slot: 0 });
  }
  const spec = d => S[d.k] || S.basic;
  function npcSpawn(d) {
    let g = npcs.get(d.i); const sp = spec(d);
    if (!g) { g = netEnemy(sp); g.npc = true; g.nid = d.i; g.x = g.tx = d.x; g.y = g.ty = d.y; npcs.set(d.i, g); enemies.push(g) }
    g.team = d.tm; g.barrels = sp.bar; g.ram = sp.ram; g.mode = sp.mode; g.shape = sp.shape; g.bc = sp.bc; g.nm = sp.name;
    g.level = d.lv; g.r = d.r; g.color = d.c || sp.color; g.ring = d.ri || sp.color; g.label = d.n; g.maxHp = d.h; g.bodyD = d.bd; g.dmg = d.dm;
    if (d.hp !== undefined) g.hp = d.hp; else if (g.hp > g.maxHp) g.hp = g.maxHp;
  }
  function addShape(q) {
    if (shapeG.has(q[0])) return;
    allowNew = true; let s; try { s = new Shape() } finally { allowNew = false }
    const a = SH[q[1]]; if (!a) return;
    s.type = q[1]; s.size = a[0]; s.hp = s.maxHp = a[1]; s.color = a[2]; s.exp = a[3]; s.gems = a[4]; s.n = a[5]; s.x = q[2]; s.y = q[3]; s.a = q[4]; s.rs = rnd(-.01, .01); s.dead = false; s.net = true; s.sid = q[0];
    shapes.push(s); shapeG.set(q[0], s);
  }

  /* Trạng thái xe người khác */
  function onState(m) {
    if (!ON || !ready) return;
    const g = ghostOf(m.id); if (!g) return;
    if (Math.hypot(m.x - g.tx, m.y - g.ty) > 350) { g.x = m.x; g.y = m.y }
    g.tx = m.x; g.ty = m.y; g.ta = m.a; g.hp = m.hp; g.maxHp = m.mh || g.maxHp; g.bd = m.bd || g.bd; if (m.dm) g.dmg = m.dm;
    if (m.tk && m.tk !== g.tk && S[m.tk]) { const sp = S[m.tk]; g.tk = m.tk; g.barrels = sp.bar; g.shape = sp.shape; g.ram = sp.ram; g.bc = sp.bc; g.ring = sp.color; g.mode = sp.mode }
  }

  /* Đạn / laser / bẫy do người khác (hoặc bot/NPC của chủ phòng) bắn */
  function onFire(m) {
    if (!ON || !ready) return;
    (m.g || []).forEach(grp => {
      const g = grp.n ? npcs.get(grp.n) : ghostOf(m.id); if (!g) return;
      const coop = MODE === 'pve' && !grp.n; // đồng đội trong PvE: chỉ để nhìn, không gây sát thương/hiệu ứng
      (grp.p || []).forEach(q => {
        const p = { own: g, x: q.x, y: q.y, vx: q.vx, vy: q.vy, hp: q.h, dmg: coop ? 0 : q.d, r: q.r, col: q.c, spc: coop ? null : (q.s || null), life: q.l, dead: false, _ns: true };
        if (!coop && (q.k === 'e' || q.k === 'a')) { p.nk = q.k; p.d0 = 0; p.fg = 0 }
        if (q.o) p.orb = { cx: q.o[0], cy: q.o[1], ang: q.o[2], rad: q.o[3], g: q.o[4], w: q.o[5] };
        if (q.sp) p.spin = q.sp;
        if (q.bm) { p.vx = p.vy = 0; p.bm = { sc: q.bm[0], ox: q.bm[1], oy: q.bm[2], a: q.bm[3], sd: q.bm[4], s: 0, ph: 0, ds: q.bm[5], rv: q.bm[6], own: g, hs: {} } }
        proj.push(p);
      });
      (grp.l || []).forEach(l => { fireL(g, l[0], l[1], l[2], coop ? 0 : l[3], l[4]) });
      (grp.tr || []).forEach(q => {
        const t = { own: g, x: q.x, y: q.y, vx: q.vx, vy: q.vy, r: q.r, rot: q.rot, col: q.c, hp: q.h, maxHp: q.h, dmg: coop ? 0 : q.d, life: 600, exp: performance.now() + q.e, dead: false, _ns: true };
        if (q.doom && !coop) t.doom = 1; traps.push(t);
      });
    });
  }

  /* Tin thế giới do chủ phòng phát (chỉ máy khách xử lý) */
  function onWorld(d) {
    if (!ON || !ready || AUTH) return;
    switch (d.k) {
      case 'ns': d.a.forEach(npcSpawn); if (d.all) { const keep = new Set(d.a.map(x => x.i)); npcs.forEach((g, id) => { if (!keep.has(id)) { g.dead = true; npcs.delete(id) } }) } break;
      case 'np': d.a.forEach(q => { const g = npcs.get(q[0]); if (!g) return; if (Math.hypot(q[1] - g.tx, q[2] - g.ty) > 400) { g.x = q[1]; g.y = q[2] } g.tx = q[1]; g.ty = q[2]; g.ta = q[3]; g.hp = q[4] }); break;
      case 'ng': d.a.forEach(id => { const g = npcs.get(id); if (g) { g.dead = true; boom(g.x, g.y); npcs.delete(id) } }); break;
      case 'sa': d.a.forEach(addShape); break;
      case 'sr': d.a.forEach(id => { const s = shapeG.get(id); if (s) { s.dead = true; shapeG.delete(id) } }); break;
      case 'sf': { d.a.forEach(addShape); const keep = new Set(d.a.map(x => x[0])); shapeG.forEach((s, id) => { if (!keep.has(id)) { s.dead = true; shapeG.delete(id) } }); break }
      case 'fl': d.a.forEach(q => { const f = FLAGS[q[0]]; if (!f) return; f.hp = q[1]; if (q[2] && !f.dead) flagsJoin(f, q[3]) }); myTeam = player.team; break;
      case 'join': { const f = FLAGS[d.f]; if (f && !f.dead) flagsJoin(f, d.to); Object.values(stats).forEach(s => { if (s.team === d.f) s.team = d.to }); myTeam = player.team; break }
    }
  }
  /* Chủ phòng nhận báo cáo sát thương lên NPC/bot/shape */
  function onHitMsg(m) {
    if (!ON || !AUTH) return;
    const g = ghosts.get(m.from), d = m.d || {};
    (d.e || []).forEach(q => {
      const e = reg.get(q[0]); if (!e || e.dead) return;
      allowRemote = true; try { hurtEnemy(e, q[1], g, q[2] || undefined) } finally { allowRemote = false }
      if (e.dead && MODE === 'pve') send({ t: 'to', id: m.from, d: { k: 'rw', exp: Math.floor(e.exp * .95), lv: Math.ceil(e.level * .75), g: e.gems } });
    });
    (d.s || []).forEach(q => {
      const s = shapeReg.get(q[0]); if (!s || s.dead) return;
      allowRemote = true; try { hurtShape(s, q[1], g) } finally { allowRemote = false }
      if (s.dead && MODE === 'pve') send({ t: 'to', id: m.from, d: { k: 'rw', exp: s.exp, g: s.gems, sh: 1 } });
    });
  }
  function onTo(d) {
    if (!ON || !player || d.k !== 'rw') return;
    if (d.exp) player.addExp(d.exp);
    if (d.lv) player.addLevels(d.lv);
    if (d.g) { D.gems += d.g; try { qStat('gems', d.g) } catch (e) { } }
    try { qStat(d.sh ? 'shapes' : 'kills', 1) } catch (e) { }
    text(player.x, player.y - 40, '+' + (d.exp || 0) + ' EXP' + (d.g ? '  💎' + d.g : ''), d.sh ? '#38bdf8' : '#fbbf24');
  }

  function onKill(m) {
    scoreT = m.score || scoreT; Object.keys(scoreT).forEach(t => { if (tscore[t] !== undefined) tscore[t] = scoreT[t] });
    const v = m.v ? (names[m.v] || 'Người chơi') : (m.vn || 'Bot'), k = m.by ? names[m.by] : null;
    if (m.v && stats[m.v]) stats[m.v].d++; if (m.by && stats[m.by]) stats[m.by].k++;
    const tv = m.v ? (stats[m.v] || {}).team : null, tk = m.by ? (stats[m.by] || {}).team : (m.bt || null);
    if (ON) {
      const kn = k || (tk ? tname(tk) + ' (bot)' : null);
      feed(kn ? '<b style="color:' + tcol(tk) + '">' + esc(kn) + '</b> ⚔ <b style="color:' + (tv ? tcol(tv) : '#94a3b8') + '">' + esc(v) + '</b>' : '<b style="color:' + (tv ? tcol(tv) : '#94a3b8') + '">' + esc(v) + '</b> bị hạ' + (m.place ? ' · hạng #' + m.place : ''));
      if (m.alive !== undefined) aliveN = m.alive;
    }
    if (m.v) { const g = ghosts.get(m.v); if (g) { boom(g.x, g.y); if (MODE === 'br') dropGhost(m.v); else g.hp = g.maxHp } }
    if (m.by === myId && ON) text(player.x, player.y - 50, '+1 HẠ GỤC', '#fbbf24');
    if (m.v === myId && MODE === 'br') { elimPlace = m.place || 0; if (view === 'elim') render() }
  }

  /* ============ Hook vào game ============ */
  const _toMenu = toMenu;
  const _hurtEnemy = hurtEnemy; hurtEnemy = function (e, a, s, c) {
    if (ON && e) {
      if (e.net) { if (e.npc && s === player && a > 0) { const h = hitE.get(e.nid) || { a: 0, s: null }; h.a += a; if (c) h.s = c; hitE.set(e.nid, h) } return }
      if (AUTH && s && s.net && !s.npc && !allowRemote) return; // bản sao đạn của người khác: bỏ qua, dùng tin báo 'h'
    }
    return _hurtEnemy.apply(this, arguments);
  };
  const _hurtShape = hurtShape; hurtShape = function (s, a, src) {
    if (ON && s) {
      if (s.net) { if (src === player && a > 0) { hitS.set(s.sid, (hitS.get(s.sid) || 0) + a); s.hp = Math.max(1, s.hp - a) } return }
      if (AUTH && src && src.net && !allowRemote) return;
    }
    return _hurtShape.apply(this, arguments);
  };
  const _hurtPlayer = hurtPlayer; hurtPlayer = function (a, s) {
    if (ON && s) {
      if (s.net && !s.npc) { if (MODE === 'pve') return; if (s.team !== myTeam) lastAtk = { id: s.netId, t: performance.now() } } // PvE co-op: đồng đội KHÔNG gây sát thương
      else if (s.team && s.team !== myTeam) lastAtk = { bt: s.team, t: performance.now() };
    }
    return _hurtPlayer.apply(this, arguments);
  };
  const _scoreKill = scoreKill; scoreKill = function (v, s) {
    if (!ON) return _scoreKill(v, s);
    if (v === player) {
      let by = null, bt = null;
      if (s) { if (s.net && !s.npc && s.netId) by = s.netId; else if (s.team) bt = s.team }
      if (!by && !bt && lastAtk && performance.now() - lastAtk.t < 8000) { by = lastAtk.id || null; bt = lastAtk.bt || null }
      lastAtk = null; if (MODE !== 'pve') send({ t: 'die', by, bt }); return;
    }
    if (AUTH && MODE === 'team' && v && !v.net && s && s.team && s.team !== v.team && tscore[s.team] !== undefined)
      send({ t: 'sc', team: s.team, by: s === player ? myId : (s.net && !s.npc ? s.netId : null), vn: v.nm || 'Bot' });
  };
  const _respawn = respawn; respawn = function () {
    if (!ON) return _respawn();
    if (MODE === 'br') { if (!elimPending) { elimPending = true; ready = false; setTimeout(elimMe, 0) } return } // dọn dẹp sau khung hình hiện tại
    player.hp = player.maxHp; const q = spawnFor(player.team, 0, true); player.x = q.x; player.y = q.y; player.inv = 180; player.frz = 0; player.stun = 0;
    boom(player.x, player.y); text(player.x, player.y - 40, 'HỒI SINH', '#22c55e'); lastSt = 0;
  };
  const _gameOver = gameOver; gameOver = function () { if (ON && MODE === 'pve') send({ t: 'die', by: null, bt: null }); return _gameOver.apply(this, arguments) };
  const ownerOf = o => o === player ? 0 : ((AUTH && o && o.nid && !o.net) ? o.nid : -1); // 0 = bản thân, >0 = bot/NPC của chủ phòng, -1 = bỏ qua
  const _fireL = fireL; fireL = function (o, x, y, a, dm, c) {
    if (ON && ready) { const ow = ownerOf(o); if (ow >= 0) outL.push({ n: ow, l: [r1(x), r1(y), r2(a), Math.round(dm * (GB && GB.km || 1)), c] }) }
    return _fireL.apply(this, arguments);
  };
  const _pvpTick = pvpTick; pvpTick = function () { if (!ON) return _pvpTick(); if (ready) netTick() };
  const _hud = hud; hud = function () { _hud(); if (ON && ready) onlineHud() };
  const _exitGame = exitGame; exitGame = function () { if (!ON) return _exitGame(); if (!confirm('Rời trận online?')) return; if (MODE === 'pve') { try { save() } catch (e) { } } leave(true) };
  toMenu = function () { // nút "VỀ HANGAR" sau khi chết (PvE) -> về phòng chờ, vào lại được
    if (!ON) return _toMenu();
    cleanup(); const r = _toMenu(); view = 'room'; if (room) show(); return r;
  };
  /* Trong trận online, Enemy/Shape do game tự sinh chỉ được phép chạy ở máy chủ phòng; máy khác nhận từ chủ phòng */
  const DEADE = { dead: true, update() { }, draw() { }, x: -1e5, y: -1e5, r: 0, team: 'x' };
  const _Enemy = Enemy; Enemy = class Enemy extends _Enemy { constructor() { if (ON && !AUTH && !allowNew) return DEADE; super() } };
  const _Shape = Shape; Shape = class Shape extends _Shape { constructor() { if (ON && (!AUTH || MODE !== 'pve') && !allowNew) return DEADE; super() } };

  /* Chặn phím mở cửa hàng/nâng cấp/tiến hóa trong các chế độ đấu đội; PvE giữ nguyên như offline */
  let blockRe = /^$/; const buildKeys = () => { blockRe = MODE === 'pve' ? /^$/ : /^(KeyG|KeyQ|KeyU|KeyE|KeyB|Digit[0-9]|Numpad[0-9])$/ };
  addEventListener('keydown', e => {
    if (!ON) return;
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.code === 'Tab') { e.preventDefault(); $('olSb').classList.remove('hidden'); renderSb(); return }
    if (e.code === 'Enter') { e.preventDefault(); $('olChat').classList.remove('hidden'); $('olChatI').focus(); return }
    if (blockRe.test(e.code)) { e.stopImmediatePropagation(); e.stopPropagation() }
  }, true);
  addEventListener('keyup', e => { if (e.code === 'Tab' && ON) $('olSb').classList.add('hidden') }, true);

  /* ============ Vòng đồng bộ mỗi khung hình ============ */
  const serP = p => {
    const o = { x: r1(p.x), y: r1(p.y), vx: r2(p.vx), vy: r2(p.vy), d: r1(p.dmg), h: r1(p.hp), r: r1(p.r), c: p.col, s: p.spc || 0, l: Math.round(p.life * ((p.own && p.own.rmul) || 1)) };
    if (p.nk) o.k = p.nk;
    if ((p.nk === 'x' || p.nk === 'v') && p.splitAt) { const sp = Math.hypot(p.vx, p.vy) || 1; o.l = Math.max(1, Math.ceil((p.splitAt - (p.d0 || 0)) / sp)) }
    if (p.orb) o.o = [r1(p.orb.cx), r1(p.orb.cy), r2(p.orb.ang), r2(p.orb.rad), r2(p.orb.g), p.orb.w];
    if (p.spin) o.sp = p.spin;
    if (p.bm) { const b = p.bm; o.bm = [b.sc, r1(b.ox), r1(b.oy), r2(b.a), b.sd, b.ds, b.rv] }
    return o;
  };
  function netTick() {
    if (!player) return;
    // 1) Đạn / bẫy / laser mới (của mình, và của bot/NPC nếu là chủ phòng)
    const groups = new Map(), grp = n => { let g = groups.get(n); if (!g) { g = { n, p: [], l: [], tr: [] }; groups.set(n, g) } return g };
    for (let i = proj.length - 1; i >= 0; i--) {
      const p = proj[i]; if (p._ns) break; p._ns = true;
      if (p.dead) continue; const ow = ownerOf(p.own); if (ow < 0) continue;
      const g = grp(ow); if (g.p.length < 80) g.p.push(serP(p));
    }
    for (let i = traps.length - 1; i >= 0; i--) {
      const t = traps[i]; if (t._ns) break; t._ns = true;
      if (t.dead) continue; const ow = ownerOf(t.own); if (ow < 0) continue;
      grp(ow).tr.push({ x: r1(t.x), y: r1(t.y), vx: r2(t.vx), vy: r2(t.vy), r: r1(t.r), rot: r2(t.rot), c: t.col, h: r1(t.hp), d: r1(t.dmg), e: Math.max(0, Math.round(t.exp - performance.now())), doom: t.doom ? 1 : 0 });
    }
    outL.splice(0, 60).forEach(x => { grp(x.n).l.push(x.l) });
    if (groups.size) send({ t: 'fire', g: [...groups.values()].map(g => ({ n: g.n || undefined, p: g.p, l: g.l, tr: g.tr })) });
    // 2) Trạng thái xe ~20 lần/giây
    if (frame - lastSt >= 3) {
      lastSt = frame;
      const st = { t: 'st', x: r1(player.x), y: r1(player.y), a: r2(player.ang), hp: Math.max(0, Math.round(player.hp)), mh: Math.round(player.maxHp), tk: player.typeKey, bd: r1(player.body), dm: Math.round(player.dmg || 10) };
      if (MODE === 'koth') st.z = Math.hypot(player.x - C0(), player.y - C0()) < HILL_R ? 1 : 0;
      send(st);
    }
    // 3) Báo sát thương lên NPC/bot/shape cho chủ phòng
    if (hitE.size || hitS.size) {
      send({ t: 'h', d: { e: [...hitE].map(([id, h]) => [id, Math.round(h.a), h.s || 0]), s: [...hitS].map(([id, a]) => [id, Math.round(a)]) } });
      hitE.clear(); hitS.clear();
    }
    // 4) Đâm trực diện xe địch
    if (MODE !== 'pve' && player.inv <= 0) ghosts.forEach(g => { if (!g.dead && g.team !== player.team && Math.hypot(player.x - g.x, player.y - g.y) < g.r + 24) hurtPlayer(g.bd * .25, g) });
    // 5) Luật riêng từng chế độ
    if (MODE === 'br' && frame > 120) { const R = brR(); if (Math.hypot(player.x - C0(), player.y - C0()) > R) hurtPlayer(player.maxHp * .0012, ZSRC) }
    if (AUTH) worldTick();
  }
  const ZSRC = { team: 'zone', net: false };

  /* Chủ phòng: điều khiển thế giới như offline rồi phát cho mọi người */
  let SKEY = null, NKEY = null;
  function skeyOf(e) {
    if (!SKEY) { SKEY = new Map(); NKEY = new Map(); Object.keys(S).forEach(k => { SKEY.set(S[k], k); if (!NKEY.has(S[k].name)) NKEY.set(S[k].name, k) }) }
    return (e.sp && SKEY.get(e.sp)) || NKEY.get(e.nm) || 'basic';
  }
  const spawnOf = e => ({ i: e.nid, k: skeyOf(e), tm: e.team, lv: e.level | 0, r: Math.round(e.r), c: e.color, ri: e.ring, n: (e.nm || 'NPC') + (e.team === 'e' ? ' Lv' + (e.level | 0) : ''), h: Math.round(e.maxHp), bd: Math.round(e.bodyD || 10), dm: Math.round(e.dmg || 10), x: e.x | 0, y: e.y | 0, hp: Math.round(e.hp) });
  const world = d => send({ t: 'w', d });
  function botTop() {
    if ((MODE !== 'team' && MODE !== 'koth') || !cfgM.bots || frame % 40) return;
    const cnt = {}; enemies.forEach(e => { if (!e.dead && !e.npc) cnt[e.team] = (cnt[e.team] || 0) + 1 }); cnt[player.team] = (cnt[player.team] || 0) + 1;
    TEAMS.forEach(t => {
      if (FLAGS[t] && FLAGS[t].dead) return;
      if ((cnt[t] || 0) < cfgM.bots) { mkBot(t); const b = enemies[enemies.length - 1]; if (MODE === 'koth' && b && !b.net) b.home = { x: C0() + rnd(-160, 160), y: C0() + rnd(-160, 160) } }
    });
  }
  function worldTick() {
    botTop();
    const full = frame % 240 === 1, adds = [];
    enemies.forEach(e => {
      if (e.net || e.dead || e === DEADE) return;
      if (!e.nid) { e.nid = ++nidC; reg.set(e.nid, e) }
      const k = skeyOf(e), lv = e.level | 0;
      if (e._k !== k || e._lv !== lv || e._mh !== Math.round(e.maxHp)) { e._k = k; e._lv = lv; e._mh = Math.round(e.maxHp); adds.push(spawnOf(e)) } else if (full) adds.push(spawnOf(e));
    });
    if (adds.length) world({ k: 'ns', a: adds, all: full ? 1 : 0 });
    const gone = []; reg.forEach((e, id) => { if (e.dead) { gone.push(id); reg.delete(id) } });
    if (gone.length) world({ k: 'ng', a: gone });
    if (frame % 6 === 0 && reg.size) world({ k: 'np', a: [...reg.values()].map(e => [e.nid, e.x | 0, e.y | 0, r2(e.ang), Math.round(e.hp)]) });
    if (MODE === 'pve' && frame % 6 === 0) {
      const sa = [], sr = [];
      shapes.forEach(s => { if (!s.dead && !s.net && s !== DEADE && !s.sid && s.type) { s.sid = ++sidC; shapeReg.set(s.sid, s); sa.push([s.sid, s.type, s.x | 0, s.y | 0, r2(s.a)]) } });
      shapeReg.forEach((s, id) => { if (s.dead) { sr.push(id); shapeReg.delete(id) } });
      if (sa.length) world({ k: 'sa', a: sa }); if (sr.length) world({ k: 'sr', a: sr });
      if (full || frame % 240 === 7) world({ k: 'sf', a: [...shapeReg.values()].map(s => [s.sid, s.type, s.x | 0, s.y | 0, r2(s.a)]) });
    }
    if (T4 && MODE === 'team') {
      Object.values(FLAGS).forEach(f => { if (f.dead && f.joined && !f._sj) { f._sj = 1; world({ k: 'join', f: f.team, to: f.joined }); myTeam = player.team; Object.values(stats).forEach(s => { if (s.team === f.team) s.team = f.joined }) } });
      if (frame % 30 === 0) world({ k: 'fl', a: Object.values(FLAGS).map(f => [f.team, Math.round(f.hp), f.dead ? 1 : 0, f.joined || '']) });
    }
    if (MODE === 'koth' && frame % 60 === 0) {
      const z = {}; enemies.forEach(e => { if (!e.dead && !e.net && Math.hypot(e.x - C0(), e.y - C0()) < HILL_R) z[e.team] = (z[e.team] || 0) + 1 });
      world({ k: 'hz', z });
    }
  }

  /* ============ HUD trong trận ============ */
  const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') };
  const humansIn = t => enemies.filter(e => !e.dead && e.team === t).length + (player.team === t ? 1 : 0);
  function hillOwner() {
    const ts = new Set(), C = C0(), inn = o => Math.hypot(o.x - C, o.y - C) < HILL_R;
    if (inn(player)) ts.add(player.team); enemies.forEach(e => { if (!e.dead && inn(e)) ts.add(e.team) });
    return ts.size === 1 ? [...ts][0] : (ts.size > 1 ? '!' : '');
  }
  function onlineHud() {
    if (MODE !== 'pve') { const nb = $('hud2').firstElementChild; if (nb && nb.tagName !== 'CANVAS') nb.classList.add('hidden') }
    ['sideL', 'sideR', 'xpbar', 'stats', 'lb', 'lbfull'].forEach(i => { if (MODE !== 'pve' || i === 'lb' || i === 'lbfull') $(i).classList.add('hidden') });
    const tb = $('tbtns'); tb && tb.classList.add('hidden');
    const p = $('pvp'); p.classList.remove('hidden'); const tm = endAt ? fmt(endAt - performance.now()) : '∞';
    let h = '';
    if (MODE === 'team' || MODE === 'koth') {
      h = TEAMS.map(t => { const f = FLAGS[t]; return '<span style="color:' + tcol(t) + '">' + (f && f.dead ? '<s style="opacity:.5">' + TN[t] + '</s>' : TN[t] + ' ' + (tscore[t] || 0) + '<span class="mu" style="font-size:11px">(' + humansIn(t) + ' xe' + (f ? ' ⚑' + Math.max(0, Math.ceil(f.hp)) : '') + ')</span>') + '</span>' }).join(' · ') +
        ' <span class="mu" style="font-size:12px">· ' + (MODE === 'koth' ? '👑 điểm, tới ' : 'hạ gục, tới ') + cfgM.kills + ' · ⏱ ' + tm + '</span>';
      if (MODE === 'koth') { const o = hillOwner(); h += ' <span style="font-size:12px">· Vùng: ' + (o === '!' ? '<b style="color:#e2e8f0">TRANH CHẤP</b>' : o ? '<b style="color:' + tcol(o) + '">' + TN[o] + '</b>' : '<span class="mu">trống</span>') + '</span>' }
    } else if (MODE === 'br') h = '💀 Còn sống: <b style="color:#fbbf24">' + aliveN + '</b> <span class="mu" style="font-size:12px">· bo ' + Math.round(brR()) + 'm · ⏱ ' + tm + '</span>';
    else h = '🌍 Người chơi: <b>' + (ghosts.size + 1) + '</b> <span class="mu" style="font-size:12px">· ⏱ ' + tm + '</span>';
    p.innerHTML = h;
    $('olPing').textContent = ping ? ping + ' ms' : '';
    $('olTeam').innerHTML = (MODE === 'br' || MODE === 'pve' ? '' : 'Bạn: <b style="color:' + tcol(player.team) + '">ĐỘI ' + tname(player.team) + '</b> · ') + 'Tab: bảng điểm · Enter: chat · Esc: rời';
  }
  const _drawZones = drawZones; drawZones = function () {
    _drawZones(); if (!ON || !ready) return;
    if (MODE === 'koth') {
      const o = hillOwner(), col = o === '!' ? '#e2e8f0' : o ? tcol(o) : '#94a3b8', x = C0() - camX, y = C0() - camY;
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, HILL_R, 0, 7); ctx.fillStyle = col + '2a'; ctx.fill(); ctx.lineWidth = 5; ctx.setLineDash([22, 12]); ctx.strokeStyle = col; ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = col; ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('👑 VÙNG CHIẾM', x, y + 10); ctx.restore();
    }
    if (MODE === 'br') {
      const R = brR(), x = C0() - camX, y = C0() - camY;
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, cv.width, cv.height); ctx.arc(x, y, R, 0, 7); ctx.fillStyle = 'rgba(239,68,68,.17)'; ctx.fill('evenodd');
      ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.lineWidth = 6; ctx.strokeStyle = '#ef4444'; ctx.stroke(); ctx.restore();
    }
  };
  function feed(html) {
    const f = $('olFeed'), d = document.createElement('div'); d.innerHTML = html; d.style.cssText = 'background:rgba(15,23,42,.8);padding:3px 8px;border-radius:6px;margin-bottom:3px;font-size:12px';
    f.appendChild(d); while (f.children.length > 6) f.removeChild(f.firstChild); setTimeout(() => d.remove(), 7000);
  }
  function renderSb() {
    const rows = Object.keys(stats).map(id => ({ id, n: names[id] || id, ...stats[id] })).sort((a, b) => b.k - a.k || a.d - b.d);
    const line = r => '<div class="row" style="' + (r.id === myId ? 'color:#fcd34d' : '') + '"><span>' + esc(r.n) + '</span><span>' + r.k + ' / ' + r.d + '</span></div>';
    let h;
    if (MODE === 'team' || MODE === 'koth') {
      const ts = [...new Set(rows.map(r => r.team))];
      h = '<div style="display:flex;gap:24px;flex-wrap:wrap;min-width:360px">' + ts.map(t => '<div style="flex:1;min-width:150px"><div style="color:' + tcol(t) + ';font-weight:700;margin-bottom:4px">' + tname(t) + ' · ' + (scoreT[t] || 0) + '</div>' + rows.filter(r => r.team === t).map(line).join('') + '</div>').join('') + '</div>';
    } else h = '<div style="min-width:260px">' + rows.map(line).join('') + '</div>';
    $('olSb').innerHTML = h + '<div class="mu" style="margin-top:6px;font-size:11px">Hạ gục / Bị hạ</div>';
  }

  /* ============ Giao diện ============ */
  const css = document.createElement('style');
  css.textContent = '#ol{z-index:25;background:#020617;overflow:auto}#ol .pn{max-width:780px;width:100%;box-sizing:border-box}#ol select,#ol input{font-size:14px}' +
    '.olp{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:8px;background:#0f172a;border:1px solid #334155;margin:4px 0;text-align:left}' +
    '.olt{flex:1;min-width:200px}.olH{font-weight:700;margin-bottom:4px}' +
    '.olm{display:flex;flex-direction:column;gap:2px;padding:10px 12px;border-radius:12px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;cursor:pointer;text-align:left;font-weight:400;min-width:200px;flex:1}' +
    '.olm b{font-size:15px}.olm span{font-size:11px;color:#94a3b8}.olm:hover{border-color:#a78bfa;background:#1e1b4b}' +
    '#olHud .pn{padding:4px 10px;font-size:12px}';
  document.head.appendChild(css);
  const root = document.createElement('div');
  root.innerHTML = '<div id="ol" class="ov hidden"></div>' +
    '<div id="olHud" class="hidden"><div id="olFeed" class="hud" style="top:calc(env(safe-area-inset-top,0px) + 112px);left:8px;max-width:300px"></div>' +
    '<div class="hud pn" style="bottom:calc(env(safe-area-inset-bottom,0px) + 8px);right:8px;text-align:right;font-size:11px" id="olInfo"><span id="olTeam"></span> · <b id="olPing" style="color:#34d399"></b></div>' +
    '<div id="olSb" class="hud pn hidden" style="top:50%;left:50%;transform:translate(-50%,-50%);z-index:16"></div>' +
    '<div id="olChat" class="hud pn hidden" style="bottom:70px;left:50%;transform:translateX(-50%);z-index:16"><input id="olChatI" maxlength="120" placeholder="Chat, Enter để gửi · Esc đóng" style="width:min(420px,80vw)"></div></div>';
  document.body.appendChild(root);
  const ci = $('olChatI');
  ci.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.code === 'Enter') { const v = ci.value.trim(); if (v) send({ t: 'chat', m: v }); ci.value = ''; $('olChat').classList.add('hidden'); ci.blur() }
    else if (e.code === 'Escape') { ci.value = ''; $('olChat').classList.add('hidden'); ci.blur() }
  });
  ci.addEventListener('keyup', e => e.stopPropagation());

  function show() { $('ol').classList.remove('hidden'); render() }
  function hideOL() { $('ol').classList.add('hidden') }
  function tankSel(id) {
    const md = room ? room.cfg.mode : 'team';
    if (md === 'pve') return '<span class="mu">' + esc(tkName(myTank())) + ' (theo tiến trình của bạn)</span>';
    const fair = room ? room.cfg.fair : false, cur = myTank();
    const ks = Object.keys(S).filter(k => allowed(k, fair)).sort((a, b) => S[a].name.localeCompare(S[b].name));
    return '<select id="' + id + '" onchange="TWE_ONLINE.pick(this.value)">' + ks.map(k => '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + esc(S[k].name) + ' [' + S[k].tier + ']</option>').join('') + '</select>';
  }
  const modeLabel = m => (MODES[m] ? MODES[m].ico + ' ' + MODES[m].name : m);

  function render() {
    const el = $('ol'); if (el.classList.contains('hidden')) return;
    const p = prefs();
    if (view === 'cd') {
      const mm = MODES[MODE] || MODES.team;
      el.innerHTML = '<div class="mu">' + modeLabel(MODE) + ' · SẮP BẮT ĐẦU</div><h1 id="olCdN" style="font-size:96px">5</h1><div class="pn" style="max-width:480px">' +
        (MODE === 'br' ? 'Mỗi người một đội · <b>chỉ 1 mạng</b> · ' + nPlayers + ' người chơi' : (MODE === 'pve' ? 'Co-op · ' + nPlayers + ' người chơi' : 'Bạn thuộc <b style="color:' + tcol(myTeam) + '">ĐỘI ' + tname(myTeam) + '</b> · ' + cfgM.teams + ' đội' + (cfgM.bots ? ' · bot ' + cfgM.bots + '/đội' : ''))) +
        '<br><span class="mu">' + mm.desc + '</span></div>';
      return;
    }
    if (view === 'elim') {
      el.innerHTML = '<h1 style="-webkit-text-fill-color:#ef4444">💀 BẠN BỊ LOẠI</h1><div class="pn"><div style="font-size:26px;font-weight:700">Hạng <span style="color:#fbbf24">#' + (elimPlace || '?') + '</span></div><div class="mu">Chờ trận kết thúc để xem kết quả...</div></div><button class="red" onclick="TWE_ONLINE.leave()">RỜI PHÒNG</button>';
      return;
    }
    if (view === 'end' && endInfo) return renderEnd();
    if (view === 'room' && room) return renderRoom();
    // Trang chủ online
    el.innerHTML = '<h1 style="font-size:clamp(24px,5vw,42px)">🌐 CHƠI ONLINE</h1>' +
      '<div class="mu" style="max-width:600px">Cùng chế độ như offline và 2 chế độ mới. Tạo phòng rồi gửi mã cho bạn bè, hoặc nhập mã để vào.</div>' +
      (status ? '<div class="pn" style="color:#fcd34d">' + esc(status) + '</div>' : '') +
      '<div class="pn" style="display:flex;flex-direction:column;gap:8px"><div class="row"><span>Tên hiển thị' + (window.TWE_ACCOUNT && TWE_ACCOUNT.user ? ' <span class="mu" style="font-size:11px">(tài khoản #' + TWE_ACCOUNT.user.id + ')</span>' : '') + '</span><input id="olName" maxlength="16" value="' + esc(p.name) + '" ' + (window.TWE_ACCOUNT && TWE_ACCOUNT.user ? 'readonly' : '') + ' onchange="TWE_ONLINE.setName(this.value)" style="width:180px"></div>' +
      '<div class="row"><span>Kiểu kết nối</span><select onchange="TWE_ONLINE.setMode(this.value)"><option value="p2p"' + (curMode() === 'p2p' ? ' selected' : '') + '>Không cần máy chủ (P2P)</option><option value="ws"' + (curMode() === 'ws' ? ' selected' : '') + '>Máy chủ riêng (WebSocket)</option></select></div>' +
      (curMode() === 'ws' ? '<div class="row"><span>Máy chủ</span><input id="olUrl" value="' + esc(defUrl()) + '" onchange="TWE_ONLINE.setUrl(this.value)" style="width:260px"></div>' : '<div class="mu" style="font-size:11px;text-align:left">P2P: người tạo phòng làm “máy chủ” ngay trên trình duyệt của họ (giữ tab mở). Người khác vào bằng mã phòng. Chạy được trên GitHub Pages.</div>') +
      '<div class="row"><span>Xe tăng</span>' + tankSel('olTk') + '</div></div>' +
      '<div class="olH" style="margin-top:4px">➕ Tạo phòng — chọn chế độ</div>' +
      '<div class="pn" style="display:flex;gap:8px;flex-wrap:wrap">' + Object.keys(MODES).map(k => '<button class="olm" onclick="TWE_ONLINE.create(\'' + k + '\')"><b>' + MODES[k].ico + ' ' + MODES[k].name + '</b><span>' + MODES[k].desc.slice(0, 92) + '…</span></button>').join('') + '</div>' +
      '<div class="pn" style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">' + (curMode() === 'ws' ? '<button style="background:#7c3aed" onclick="TWE_ONLINE.quick()">⚡ GHÉP TRẬN NHANH</button>' : '') + '<input id="olCode" maxlength="4" placeholder="MÃ PHÒNG" style="width:120px;text-transform:uppercase;text-align:center"><button onclick="TWE_ONLINE.join($(\'olCode\').value)">VÀO PHÒNG</button>' + (curMode() === 'ws' ? '<button style="background:#334155" onclick="TWE_ONLINE.list()">🔄 Danh sách</button>' : '') + '</div>' +
      (rooms.length ? '<div class="pn"><div class="olH">Phòng công khai</div>' + rooms.map(r => '<div class="olp"><b style="width:56px">' + r.code + '</b><span style="flex:1">' + (MODES[r.mode] ? MODES[r.mode].ico : '') + ' ' + esc(r.host || '?') + ' · ' + r.n + '/' + r.max + ' ' + (r.state === 'lobby' ? '' : '· <span style="color:#fbbf24">đang đấu</span>') + '</span><button onclick="TWE_ONLINE.join(\'' + r.code + '\')">VÀO</button></div>').join('') + '</div>' : '') +
      '<button class="red" onclick="TWE_ONLINE.close()">✕ ĐÓNG</button>';
  }

  function renderRoom() {
    const el = $('ol'), r = room, isHost = r.host === myId, me = r.players.find(p => p.id === myId) || {}, md = r.cfg.mode, teamMode = md === 'team' || md === 'koth';
    const keys = teamMode ? TEAMALL.slice(0, r.cfg.teams) : [];
    const pl = p => '<div class="olp"' + (p.id === myId ? ' style="border-color:#fcd34d"' : '') + '><span style="flex:1">' + (p.id === r.host ? '👑 ' : '') + esc(p.name) + '<br><span class="mu" style="font-size:11px">' + esc(md === 'pve' ? 'xe theo tiến trình' : tkName(p.tk)) + '</span></span>' + (p.id === r.host ? '' : (p.ready ? '<b style="color:#22c55e">SẴN SÀNG</b>' : '<span class="mu">chờ</span>')) + (isHost && p.id !== myId ? '<button class="red" style="padding:2px 7px" onclick="TWE_ONLINE.kick(\'' + p.id + '\')">✕</button>' : '') + '</div>';
    const cap = teamMode ? Math.ceil(r.cfg.max / r.cfg.teams) : r.cfg.max;
    const col = t => '<div class="olt"><div class="olH" style="color:' + tcol(t) + '">ĐỘI ' + TN[t] + ' (' + r.players.filter(p => p.team === t).length + '/' + cap + ')' + (r.cfg.bots ? ' <span class="mu" style="font-size:11px">+ bot</span>' : '') + '</div>' +
      r.players.filter(p => p.team === t).map(pl).join('') +
      (me.team !== t ? '<button style="margin-top:4px;background:#334155;padding:4px 8px" onclick="TWE_ONLINE.team(\'' + t + '\')">↪ Vào đội này</button>' : '') + '</div>';
    const sel = (k, opts, v) => '<select ' + (isHost ? '' : 'disabled') + ' onchange="TWE_ONLINE.cfg(\'' + k + '\',this.value)">' + opts.map(o => '<option value="' + o[0] + '"' + (String(o[0]) === String(v) ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>';
    const rg = (a, b, f) => { const o = []; for (let i = a; i <= b; i++) o.push([i, f ? f(i) : i]); return o };
    const row = (l, h) => '<div class="row"><span>' + l + '</span>' + h + '</div>';
    const timeOpts = md === 'pve' ? [[0, 'Không giới hạn'], [600, '10 phút'], [1800, '30 phút'], [3600, '1 giờ'], [7200, '2 giờ']] : [[180, '3 phút'], [300, '5 phút'], [600, '10 phút'], [900, '15 phút'], [1200, '20 phút'], [1800, '30 phút']];
    let cfgRows = row('Chế độ', isHost ? '<select onchange="TWE_ONLINE.cfg(\'mode\',this.value)">' + Object.keys(MODES).map(k => '<option value="' + k + '"' + (k === md ? ' selected' : '') + '>' + MODES[k].ico + ' ' + MODES[k].name + '</option>').join('') + '</select>' : '<b>' + modeLabel(md) + '</b>');
    if (teamMode) cfgRows += row('Số đội', sel('teams', rg(2, 10), r.cfg.teams));
    if (md !== 'pve') cfgRows += row('Chỉ số mọi xe', sel('lv', rg(1, 11), r.cfg.lv));
    if (md === 'team') cfgRows += row('Hạ gục để thắng', sel('kills', [10, 25, 50, 100, 200, 400, 600].map(v => [v, v]), r.cfg.kills));
    if (md === 'koth') cfgRows += row('Điểm để thắng (1 điểm/giây)', sel('kills', [50, 100, 150, 200, 300].map(v => [v, v]), r.cfg.kills));
    if (teamMode) cfgRows += row('Bot mỗi đội (như offline)', sel('bots', rg(0, 20), r.cfg.bots));
    cfgRows += row('Thời gian trận', sel('time', timeOpts, r.cfg.time)) + row('Số người tối đa', sel('max', rg(md === 'pve' ? 1 : 2, 10), r.cfg.max)) + row('Công khai', sel('pub', [[1, 'Có'], [0, 'Chỉ bằng mã']], r.cfg.pub ? 1 : 0));
    if (md !== 'pve') cfgRows += row('Cân bằng (cấm xe ADMIN/Mythic/SS+/cụm xoay, tắt drone)', sel('fair', [[1, 'Bật'], [0, 'Tắt']], r.cfg.fair ? 1 : 0));
    const playing = r.state === 'playing' || r.state === 'countdown';
    el.innerHTML = '<div class="mu">PHÒNG · ' + modeLabel(md) + '</div><h1 style="font-size:clamp(34px,8vw,64px);letter-spacing:6px">' + r.code + '</h1>' +
      '<button style="background:#334155" onclick="TWE_ONLINE.copy()">📋 Sao chép mã mời</button>' +
      '<div class="mu" style="max-width:640px;font-size:12px">' + MODES[md].desc + '</div>' +
      (status ? '<div class="pn" style="color:#fcd34d">' + esc(status) + '</div>' : '') +
      '<div class="pn" style="display:flex;gap:14px;flex-wrap:wrap">' + (teamMode ? keys.map(col).join('') : '<div class="olt"><div class="olH">Người chơi (' + r.players.length + '/' + r.cfg.max + ')</div>' + r.players.map(pl).join('') + '</div>') + '</div>' +
      '<div class="pn">' + row('Xe của bạn', tankSel('olTk')) + cfgRows + '</div>' +
      '<div id="olChatBox" class="pn" style="text-align:left;max-height:110px;overflow:auto;font-size:12px"></div>' +
      '<div style="display:flex;gap:6px"><input id="olLobbyChat" maxlength="120" placeholder="Chat trong phòng" style="width:240px" onkeydown="event.stopPropagation();if(event.key===\'Enter\'){TWE_ONLINE.chat(this.value);this.value=\'\'}"></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">' +
      (playing ? ((md !== 'br' ? '<button style="padding:12px 22px;font-size:16px;background:#16a34a" onclick="TWE_ONLINE.rejoin()">▶ VÀO LẠI TRẬN</button>' : '<span class="mu">Trận sinh tồn đang diễn ra...</span>') + (isHost ? '<button style="background:#b45309" onclick="TWE_ONLINE.endgame()">⏹ KẾT THÚC TRẬN</button>' : '')) :
        (r.state === 'ended' ? '<span class="mu">Phòng đang tổng kết...</span>' :
          (isHost ? '<button style="padding:12px 22px;font-size:16px;background:#16a34a" onclick="TWE_ONLINE.start()">▶ BẮT ĐẦU TRẬN</button>' :
            '<button style="padding:12px 22px;font-size:16px;background:' + (me.ready ? '#b45309' : '#16a34a') + '" onclick="TWE_ONLINE.ready(' + (me.ready ? 'false' : 'true') + ')">' + (me.ready ? '⏸ HỦY SẴN SÀNG' : '✔ SẴN SÀNG') + '</button>'))) +
      '<button class="red" onclick="TWE_ONLINE.leave()">RỜI PHÒNG</button></div>';
    renderChat();
  }
  function renderEnd() {
    const el = $('ol'), m = endInfo, w = m.winner, md = m.mode, board = m.board.slice();
    let title, color, sub = '', rows = '';
    const line = r => '<div class="olp" style="' + (r.id === myId ? 'border-color:#fcd34d' : '') + '"><b style="color:' + tcol(r.team) + ';width:' + (md === 'br' ? '34' : '56') + 'px">' + (md === 'br' ? '#' + (r.place || '?') : tname(r.team)) + '</b><span style="flex:1">' + esc(r.name) + ' <span class="mu">' + esc(md === 'pve' ? '' : tkName(r.tk)) + '</span></span><span>' + r.kills + ' / ' + r.deaths + '</span></div>';
    if (md === 'br') {
      board.sort((a, b) => (a.place || 99) - (b.place || 99) || b.kills - a.kills);
      const win = w === myId; title = w === 'draw' ? 'HÒA' : win ? '🏆 CHIẾN THẮNG!' : 'KẾT THÚC'; color = w === 'draw' ? '#fcd34d' : win ? '#22c55e' : '#ef4444';
      sub = w !== 'draw' && names[w] ? '<div class="mu">Người sống sót cuối cùng: <b style="color:#fcd34d">' + esc(names[w]) + '</b></div>' : '';
    } else if (md === 'pve') {
      board.sort((a, b) => b.kills - a.kills); title = 'KẾT THÚC TRẬN'; color = '#38bdf8';
      sub = m.reason === 'host' ? '<div class="mu">Chủ phòng đã thoát hoặc kết thúc trận.</div>' : '';
    } else {
      board.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      const mine = w === myTeam; title = w === 'draw' ? 'HÒA' : (m.reason === 'host' ? 'TRẬN BỊ HỦY' : mine ? 'CHIẾN THẮNG!' : 'THẤT BẠI'); color = w === 'draw' || m.reason === 'host' ? '#fcd34d' : mine ? '#22c55e' : '#ef4444';
      const ts = Object.keys(m.score).sort((a, b) => m.score[b] - m.score[a]);
      sub = '<div style="font-size:20px;font-weight:700">' + ts.map(t => '<span style="color:' + tcol(t) + '">' + TN[t] + ' ' + m.score[t] + '</span>').join(' · ') + '</div>' + (w && w !== 'draw' && TN[w] ? '<div class="mu">Đội thắng: <b style="color:' + tcol(w) + '">' + TN[w] + '</b></div>' : '');
    }
    const mvp = board.slice().sort((a, b) => b.kills - a.kills)[0];
    rows = board.map(line).join('');
    el.innerHTML = '<h1 style="-webkit-text-fill-color:' + color + '">' + title + '</h1><div class="pn">' + sub +
      (mvp && mvp.kills ? '<div class="mu">⭐ MVP: <b style="color:#fcd34d">' + esc(mvp.name) + '</b> (' + mvp.kills + ' hạ gục)</div>' : '') + '<div style="margin-top:8px">' + rows + '</div></div>' +
      '<div style="display:flex;gap:8px"><button onclick="TWE_ONLINE.back()">↩ VỀ PHÒNG CHỜ</button><button class="red" onclick="TWE_ONLINE.leave()">RỜI PHÒNG</button></div>';
  }
  function renderChat() {
    const b = $('olChatBox'); if (!b) return;
    b.innerHTML = chatLog.length ? chatLog.map(c => '<div><b style="color:' + tcol(c.team) + '">' + esc(c.name) + '</b>: ' + esc(c.m) + '</div>').join('') : '<span class="mu">Chưa có tin nhắn</span>';
    b.scrollTop = 1e6;
  }

  /* ============ API cho nút bấm ============ */
  window.TWE_ONLINE = {
    open() {
      view = room ? 'room' : 'home'; status = ''; show();
      if (!prefs().mode && !autoWs && /^https?:$/.test(location.protocol)) fetch('/health').then(r => r.json()).then(j => { if (j && j.ok && j.rooms !== undefined) { autoWs = true; if (view === 'home') render() } }).catch(() => { });
    },
    close() { hideOL() },
    setName(v) { if (window.TWE_ACCOUNT && TWE_ACCOUNT.user) return; v = String(v).trim().slice(0, 16) || 'Xe'; lsSet({ name: v }); send({ t: 'hello', name: v }) },
    setUrl(v) { lsSet({ url: String(v).trim() }); if (ws) { try { ws.close() } catch (e) { } ws = null } },
    pick(k) { lsSet({ tk: k }); send({ t: 'pick', tk: k }) },
    setMode(v) { lsSet({ mode: v }); if (ws) { try { ws.close() } catch (e) { } ws = null } p2pClose(); status = ''; render() },
    async quick() { if (curMode() === 'p2p') { status = 'Chế độ P2P chơi bằng mã phòng: hãy tạo phòng rồi gửi mã, hoặc nhập mã bạn bè.'; return render() } try { await connect(); send({ t: 'quick', name: prefs().name, tk: myTank() }) } catch (e) { } },
    async create(mode) {
      const cfg = { mode: MODES[mode] ? mode : 'team' };
      try {
        if (curMode() === 'p2p') { await p2pStartHost(); cfg.pub = false } else await connect();
        send({ t: 'create', name: prefs().name, tk: (cfg.mode === 'pve' ? (S[D.type] ? D.type : 'basic') : myTankFor()), cfg });
      } catch (e) { failMsg(e) }
    },
    async join(c) {
      c = String(c || '').trim().toUpperCase(); if (!c) { status = 'Nhập mã phòng'; return render() }
      try {
        if (curMode() === 'p2p') await p2pJoinRoom(c); else await connect();
        send({ t: 'join', code: c, name: prefs().name, tk: myTankFor() });
      } catch (e) { failMsg(e) }
    },
    async list() { try { await connect(); send({ t: 'rooms' }) } catch (e) { } },
    ready(v) { send({ t: 'ready', v }) },
    team(t) { send({ t: 'team', team: t }) },
    kick(id) { send({ t: 'kick', id }) },
    cfg(k, v) { const o = {}; o[k] = (k === 'pub' || k === 'fair') ? v === '1' : (k === 'mode' ? v : +v); send({ t: 'cfg', cfg: o }) },
    start() { status = ''; send({ t: 'start' }) },
    rejoin() { send({ t: 'rejoin' }) },
    endgame() { send({ t: 'endgame' }) },
    chat(v) { v = String(v).trim(); if (v) send({ t: 'chat', m: v }) },
    copy() { try { navigator.clipboard.writeText(room.code); status = 'Đã sao chép mã ' + room.code } catch (e) { status = 'Mã phòng: ' + room.code } render() },
    leave() { leave(true) },
    back() { view = room ? 'room' : 'home'; render() }
  };
  function myTankFor() { const p = prefs(); for (const k of [p.tk, D.type, 'basic']) if (k && S[k]) return k; return 'basic' }
})();
