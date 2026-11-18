/* Tank Warfare: Evolution - HUB PHÒNG/TRẬN (logic dùng chung)
   Chạy được ở 2 nơi:
   - Node.js (server.js)  : máy chủ riêng, kết nối WebSocket.
   - Trình duyệt (online.js, chế độ P2P): chủ phòng tự làm máy chủ, người khác nối vào qua PeerJS -> KHÔNG cần máy chủ.
   Hub không biết gì về mạng: mỗi kết nối chỉ cần một hàm tx(obj) để gửi tin cho người đó.

   Chế độ (cfg.mode):
     team : Chiến đấu theo TEAM 2-10 đội (căn cứ, vùng an toàn, cờ) - thắng khi đủ số hạ gục
     koth : VUA ĐỒI - đội đứng một mình trong vùng giữa bản đồ được 1 điểm/giây
     br   : SINH TỒN THU HẸP - mỗi người một đội, 1 mạng, vòng bo thu nhỏ, người cuối cùng thắng
     pve  : SINH TỒN PvE - cùng một thế giới NPC/shape như offline
   "Chủ phòng" (room.host) là máy điều khiển thế giới (bot, NPC, shape, cờ) và phát cho mọi người qua tin 'w'. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TWE_HUB = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const COUNTDOWN_MS = 5000, RESET_MS = 12000;
  const TEAMALL = ['b', 'g', 'r', 'y', 'c', 'p', 'o', 'm', 't', 'w']; // trùng với TEAMALL của game
  const MODE_DEF = {
    team: { teams: 2, kills: 50, time: 600, bots: 5 },
    koth: { teams: 2, kills: 100, time: 600, bots: 5 },
    br: { teams: 0, kills: 0, time: 600, bots: 0 },
    pve: { teams: 0, kills: 0, time: 1800, bots: 0 }
  };
  const clamp = (v, a, b, d) => { v = +v; return isFinite(v) ? Math.max(a, Math.min(b, Math.round(v))) : d; };
  const CODE_CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const cleanName = s => String(s || 'Player').replace(/[<>&"'\u0000-\u001f]/g, '').trim().slice(0, 16) || 'Player';

  function cleanCfg(o, base) {
    o = o || {}; const has = !!base; base = base || {};
    const mode = MODE_DEF[o.mode] ? o.mode : (MODE_DEF[base.mode] ? base.mode : 'team');
    const changed = has && o.mode && o.mode !== base.mode;
    const cur = Object.assign({ lv: 11, max: 10, pub: true, fair: false },
      has ? { lv: base.lv, max: base.max, pub: base.pub, fair: base.fair } : {},
      MODE_DEF[mode], (!changed && has) ? { teams: base.teams, kills: base.kills, time: base.time, bots: base.bots } : {});
    ['lv', 'teams', 'kills', 'time', 'bots', 'max', 'pub', 'fair'].forEach(k => { if (o[k] !== undefined) cur[k] = o[k]; });
    const team = mode === 'team' || mode === 'koth';
    return {
      mode,
      lv: clamp(cur.lv, 1, 11, 11),
      teams: team ? clamp(cur.teams, 2, 10, 2) : 0,
      kills: team ? clamp(cur.kills, 5, 600, MODE_DEF[mode].kills) : 0,
      time: (mode === 'pve' && +cur.time === 0) ? 0 : clamp(cur.time, 60, mode === 'pve' ? 7200 : 1800, MODE_DEF[mode].time),
      bots: team ? clamp(cur.bots, 0, 20, 5) : 0,
      max: clamp(cur.max, mode === 'pve' ? 1 : 2, 10, 10),
      pub: !!cur.pub, fair: !!cur.fair
    };
  }

  function createHub(opt) {
    opt = opt || {};
    const rooms = new Map(), conns = new Map();
    let nextId = 1;
    function send(c, obj) { try { c.tx(obj); } catch (e) { } }

    /** Thêm một kết nối mới. tx(obj) = cách gửi tin cho người này. Trả về đối tượng kết nối. */
    function addConn(tx) {
      const c = { tx, id: (nextId++).toString(36), name: 'Player', room: null, tokens: 0, win: Date.now(), team: 'b', ready: false, tk: 'basic', kills: 0, deaths: 0, lastDie: 0, alive: true, place: 0, inz: false };
      conns.set(c.id, c);
      send(c, { t: 'welcome', id: c.id });
      return c;
    }
    function drop(c) { if (!conns.has(c.id)) return; conns.delete(c.id); leaveRoom(c); }
    function closeAll() { rooms.forEach(r => { clearInterval(r.timer); clearTimeout(r.resetT); clearTimeout(r.cdT); }); rooms.clear(); conns.clear(); }

    /* ---------------- Phòng ---------------- */
    function newCode() { if (opt.fixedCode) { const f = opt.fixedCode; opt.fixedCode = null; return f; } for (; ;) { let s = ''; for (let i = 0; i < 4; i++) s += CODE_CH[Math.floor(Math.random() * CODE_CH.length)]; if (!rooms.has(s)) return s; } }
    const members = r => [...r.players.values()];
    const isTeamMode = r => r.cfg.mode === 'team' || r.cfg.mode === 'koth';
    const teamKeys = r => TEAMALL.slice(0, r.cfg.teams);
    const teamCount = (r, t) => members(r).filter(p => p.team === t).length;
    const teamCap = r => isTeamMode(r) ? Math.ceil(r.cfg.max / r.cfg.teams) : r.cfg.max;
    const needsAuth = r => r.cfg.mode === 'pve' || r.cfg.bots > 0;
    const humansAlive = r => members(r).filter(p => p.alive !== false);

    function assign(r, c) {
      const m = r.cfg.mode;
      if (m === 'br') c.team = 'f' + c.id;
      else if (m === 'pve') c.team = 'b';
      else { const ks = teamKeys(r); let best = ks[0]; ks.forEach(k => { if (teamCount(r, k) < teamCount(r, best)) best = k; }); c.team = best; }
    }
    function reassignAll(r) { members(r).forEach(p => { p.team = null; }); members(r).forEach(p => { assign(r, p); p.ready = false; }); }
    function freshScore(r) { const s = {}; if (isTeamMode(r)) teamKeys(r).forEach(k => { s[k] = 0; }); return s; }

    function bcast(r, obj, exceptId) { members(r).forEach(p => { if (p.id !== exceptId) send(p, obj); }); }
    function roomInfo(r) {
      return {
        t: 'room', code: r.code, host: r.host, state: r.state, cfg: r.cfg, score: r.score,
        players: members(r).map(p => ({ id: p.id, name: p.name, team: p.team, ready: p.ready, tk: p.tk, kills: p.kills, deaths: p.deaths, alive: p.alive !== false }))
      };
    }
    const pushRoom = r => bcast(r, roomInfo(r));

    function createRoom(host, cfg) {
      const r = { code: newCode(), host: host.id, players: new Map(), state: 'lobby', cfg: cleanCfg(cfg), score: {}, startAt: 0, endAt: 0, timer: null, resetT: null, cdT: null, hz: {} };
      rooms.set(r.code, r);
      joinRoom(host, r);
      return r;
    }
    function isFull(r) {
      if (r.players.size >= r.cfg.max) return true;
      return isTeamMode(r) && Math.min(...teamKeys(r).map(k => teamCount(r, k))) >= teamCap(r);
    }
    function joinRoom(c, r) {
      if (c.room) leaveRoom(c);
      c.room = r; assign(r, c);
      c.ready = false; c.kills = 0; c.deaths = 0; c.alive = true; c.place = 0;
      r.players.set(c.id, c);
      pushRoom(r);
      if (r.state === 'countdown' || r.state === 'playing') sendStart(c, r);
    }
    function leaveRoom(c) {
      const r = c.room; if (!r) return;
      r.players.delete(c.id); c.room = null;
      if (!r.players.size) { clearInterval(r.timer); clearTimeout(r.resetT); clearTimeout(r.cdT); rooms.delete(r.code); return; }
      const wasHost = r.host === c.id;
      if (wasHost) r.host = members(r)[0].id;
      bcast(r, { t: 'left', id: c.id });
      pushRoom(r);
      if (r.state === 'playing' || r.state === 'countdown') {
        if (wasHost && needsAuth(r)) return endMatch(r, 'draw', 'host');
        if (r.cfg.mode === 'br') { checkBR(r); return; }
        if (r.cfg.mode === 'team' && r.cfg.bots === 0) {
          const ne = teamKeys(r).filter(k => teamCount(r, k) > 0);
          if (ne.length < 2) endMatch(r, ne[0] || 'draw');
        }
      }
    }
    const slotOf = (r, p) => r.cfg.mode === 'br' ? members(r).findIndex(q => q.id === p.id) : members(r).filter(q => q.team === p.team).findIndex(q => q.id === p.id);
    function startPayload(r) { return members(r).map(p => ({ id: p.id, name: p.name, team: p.team, tk: p.tk, slot: slotOf(r, p), alive: p.alive !== false })); }
    function sendStart(c, r) {
      const now = Date.now();
      send(c, { t: 'start', cfg: r.cfg, you: c.id, host: r.host, players: startPayload(r), in: Math.max(0, r.startAt - now), left: r.cfg.time === 0 ? 0 : (r.state === 'playing' ? Math.max(0, r.endAt - now) : r.cfg.time * 1000), score: r.score, late: r.state === 'playing' });
    }
    function startMatch(r) {
      r.state = 'countdown'; r.score = freshScore(r); r.startAt = Date.now() + COUNTDOWN_MS; r.hz = {};
      members(r).forEach(p => { p.kills = 0; p.deaths = 0; p.lastDie = 0; p.ready = false; p.alive = true; p.place = 0; p.inz = false; });
      members(r).forEach(p => sendStart(p, r));
      clearInterval(r.timer); clearTimeout(r.cdT);
      r.cdT = setTimeout(() => {
        if (r.state !== 'countdown' || !rooms.has(r.code)) return;
        r.state = 'playing'; r.endAt = r.cfg.time ? Date.now() + r.cfg.time * 1000 : 0;
        r.timer = setInterval(() => {
          if (r.state !== 'playing') return;
          if (r.cfg.mode === 'koth') kothTick(r);
          if (r.state !== 'playing') return;
          const left = r.endAt ? r.endAt - Date.now() : 0;
          if (r.endAt && left <= 0) return timeEnd(r);
          bcast(r, { t: 'tick', left, score: r.score, alive: humansAlive(r).length });
        }, 1000);
      }, COUNTDOWN_MS);
    }
    function kothTick(r) {
      const pres = {};
      members(r).forEach(p => { if (p.inz && p.alive !== false) pres[p.team] = (pres[p.team] || 0) + 1; });
      Object.keys(r.hz || {}).forEach(t => { if (r.hz[t] > 0) pres[t] = (pres[t] || 0) + r.hz[t]; });
      const ts = Object.keys(pres).filter(t => pres[t] > 0);
      if (ts.length === 1 && r.score[ts[0]] !== undefined) { r.score[ts[0]]++; checkWin(r); }
    }
    function checkWin(r) {
      if (!isTeamMode(r)) return;
      const k = Object.keys(r.score).find(t => r.score[t] >= r.cfg.kills);
      if (k) endMatch(r, k);
    }
    function checkBR(r) {
      if (r.cfg.mode !== 'br' || (r.state !== 'playing' && r.state !== 'countdown')) return;
      const al = humansAlive(r);
      if (al.length <= 1) endMatch(r, al[0] ? al[0].id : 'draw');
    }
    function timeEnd(r) {
      const md = r.cfg.mode;
      if (md === 'pve') return endMatch(r, 'done', 'time');
      if (md === 'br') {
        const al = humansAlive(r).sort((a, b) => b.kills - a.kills);
        return endMatch(r, al.length > 1 && al[0].kills === al[1].kills ? 'draw' : (al[0] ? al[0].id : 'draw'), 'time');
      }
      const top = Object.keys(r.score).sort((a, b) => r.score[b] - r.score[a]);
      endMatch(r, top.length > 1 && r.score[top[0]] === r.score[top[1]] ? 'draw' : top[0], 'time');
    }
    function endMatch(r, winner, reason) {
      if (r.state === 'ended' || r.state === 'lobby') return;
      r.state = 'ended'; clearInterval(r.timer); clearTimeout(r.cdT);
      if (r.cfg.mode === 'br') members(r).forEach(p => { if (p.alive !== false) p.place = p.id === winner ? 1 : (p.place || 2); });
      bcast(r, { t: 'end', mode: r.cfg.mode, winner, reason: reason || '', score: r.score, board: members(r).map(p => ({ id: p.id, name: p.name, team: p.team, tk: p.tk, kills: p.kills, deaths: p.deaths, place: p.place })) });
      clearTimeout(r.resetT);
      r.resetT = setTimeout(() => {
        if (!rooms.has(r.code)) return;
        r.state = 'lobby'; r.score = {}; r.hz = {};
        members(r).forEach(p => { p.ready = false; p.alive = true; });
        pushRoom(r);
      }, RESET_MS);
    }

    function findQuick() {
      let best = null;
      for (const r of rooms.values()) {
        if (!r.cfg.pub || r.state === 'ended' || isFull(r) || (r.cfg.mode === 'br' && r.state !== 'lobby')) continue;
        if (!best || r.players.size > best.players.size) best = r;
      }
      return best;
    }

    /* ---------------- Xử lý tin nhắn ---------------- */
    function handle(c, m) {
      const now = Date.now();
      if (now - c.win > 1000) { c.win = now; c.tokens = 0; }
      if (++c.tokens > 600) return; // chống spam
      if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
      const r = c.room, isHost = !!r && r.host === c.id;
      switch (m.t) {
        case 'hello': c.name = cleanName(m.name); send(c, { t: 'welcome', id: c.id }); if (r) pushRoom(r); break; // gửi lại welcome phòng khi tin đầu bị lỡ
        case 'ping': send(c, { t: 'pong', ts: m.ts }); break;
        case 'rooms': send(c, { t: 'rooms', list: [...rooms.values()].filter(x => x.cfg.pub && x.state !== 'ended').map(x => ({ code: x.code, host: (x.players.get(x.host) || {}).name, n: x.players.size, max: x.cfg.max, state: x.state, lv: x.cfg.lv, kills: x.cfg.kills, mode: x.cfg.mode })).slice(0, 30) }); break;
        case 'create': c.name = cleanName(m.name || c.name); if (m.tk) c.tk = String(m.tk).slice(0, 40); createRoom(c, m.cfg); break;
        case 'join': {
          c.name = cleanName(m.name || c.name); if (m.tk) c.tk = String(m.tk).slice(0, 40);
          const t = rooms.get(String(m.code || '').toUpperCase().trim());
          if (!t) return send(c, { t: 'err', m: 'Không tìm thấy phòng ' + (m.code || '') });
          if (isFull(t)) return send(c, { t: 'err', m: 'Phòng đã đầy' });
          if (t.state === 'ended') return send(c, { t: 'err', m: 'Phòng đang tổng kết, thử lại sau vài giây' });
          if (t.cfg.mode === 'br' && t.state !== 'lobby') return send(c, { t: 'err', m: 'Trận sinh tồn đã bắt đầu, không vào muộn được' });
          joinRoom(c, t); break;
        }
        case 'quick': {
          c.name = cleanName(m.name || c.name); if (m.tk) c.tk = String(m.tk).slice(0, 40);
          const t = findQuick();
          if (t) joinRoom(c, t); else createRoom(c, { pub: true });
          break;
        }
        case 'leave': leaveRoom(c); send(c, { t: 'left', id: c.id, self: true }); break;
        case 'ready': if (r && r.state === 'lobby') { c.ready = !!m.v; pushRoom(r); } break;
        case 'pick': if (r && r.state === 'lobby') { c.tk = String(m.tk || 'basic').slice(0, 40); pushRoom(r); } break;
        case 'team': {
          if (!r || r.state !== 'lobby' || !isTeamMode(r)) break;
          const t = String(m.team);
          if (teamKeys(r).includes(t) && t !== c.team && teamCount(r, t) < teamCap(r)) { c.team = t; c.ready = false; pushRoom(r); }
          break;
        }
        case 'cfg': if (isHost && r.state === 'lobby') {
          const old = r.cfg; r.cfg = cleanCfg(m.cfg, old);
          if (r.cfg.mode !== old.mode || r.cfg.teams !== old.teams) reassignAll(r);
          pushRoom(r);
        } break;
        case 'kick': if (isHost && r.state === 'lobby') { const v = r.players.get(String(m.id)); if (v && v !== c) { send(v, { t: 'kicked' }); leaveRoom(v); } } break;
        case 'start': {
          if (!isHost || r.state !== 'lobby') break;
          const md = r.cfg.mode, n = r.players.size;
          if (md === 'br' && n < 2) return send(c, { t: 'err', m: 'Sinh tồn thu hẹp cần ít nhất 2 người chơi' });
          if (isTeamMode(r) && r.cfg.bots === 0) {
            if (n < 2) return send(c, { t: 'err', m: 'Cần ít nhất 2 người chơi (hoặc thêm bot cho mỗi đội)' });
            if (teamKeys(r).filter(k => teamCount(r, k) > 0).length < 2) return send(c, { t: 'err', m: 'Cần ít nhất 2 đội có người' });
          }
          if (members(r).some(p => p.id !== r.host && !p.ready)) return send(c, { t: 'err', m: 'Còn người chưa sẵn sàng' });
          startMatch(r); break;
        }
        case 'rejoin': if (r && (r.state === 'playing' || r.state === 'countdown') && r.cfg.mode !== 'br') sendStart(c, r); break;
        case 'endgame': if (isHost && r.state === 'playing') endMatch(r, 'done', 'host'); break;
        case 'st': { // trạng thái xe: chuyển tiếp cho người khác trong phòng
          if (!r || r.state !== 'playing') break;
          m.id = c.id; if (m.tk) c.tk = String(m.tk).slice(0, 40); c.inz = !!m.z;
          bcast(r, m, c.id); break;
        }
        case 'fire': {
          if (!r || r.state !== 'playing') break;
          m.id = c.id; bcast(r, m, c.id); break;
        }
        case 'w': { // chủ phòng phát trạng thái thế giới (NPC, bot, shape, cờ...)
          if (!isHost || r.state !== 'playing') break;
          const d = m.d || {};
          if (d.k === 'hz') { r.hz = d.z || {}; break; }
          if (d.k === 'join') members(r).forEach(p => { if (p.team === d.f) p.team = d.to; });
          m.id = c.id; bcast(r, m, c.id); break;
        }
        case 'h': { // người chơi báo sát thương lên NPC/bot/shape -> chuyển cho chủ phòng
          if (!r || r.state !== 'playing' || isHost) break;
          const host = r.players.get(r.host); if (host) send(host, { t: 'h', from: c.id, d: m.d }); break;
        }
        case 'to': { // chủ phòng gửi riêng cho một người (phần thưởng...)
          if (!isHost) break;
          const v = r.players.get(String(m.id)); if (v) send(v, { t: 'to', d: m.d }); break;
        }
        case 'sc': { // chủ phòng báo bot/NPC bị hạ -> tính điểm đội
          if (!isHost || r.state !== 'playing' || r.cfg.mode !== 'team') break;
          if (r.score[m.team] === undefined) break;
          const k = m.by ? r.players.get(String(m.by)) : null;
          if (k) k.kills++;
          r.score[m.team]++;
          bcast(r, { t: 'kill', v: null, vn: String(m.vn || 'Bot').slice(0, 20), by: k ? k.id : null, bt: m.team, score: r.score });
          checkWin(r); break;
        }
        case 'die': {
          if (!r || r.state !== 'playing' || c.alive === false || now - c.lastDie < 1200) break;
          c.lastDie = now; c.deaths++;
          const md = r.cfg.mode, k = m.by ? r.players.get(String(m.by)) : null, foe = !!k && k.id !== c.id && k.team !== c.team;
          let by = null;
          if (foe) { k.kills++; by = k.id; }
          if (md === 'team') {
            if (foe) r.score[k.team]++;
            else if (!k && m.bt && m.bt !== c.team && r.score[m.bt] !== undefined) r.score[m.bt]++;
          }
          if (md === 'br') {
            c.alive = false; c.place = humansAlive(r).length + 1;
            bcast(r, { t: 'kill', v: c.id, by, score: r.score, alive: humansAlive(r).length, place: c.place });
            checkBR(r); break;
          }
          bcast(r, { t: 'kill', v: c.id, by, bt: m.bt || null, score: r.score });
          checkWin(r);
          break;
        }
        case 'chat': if (r) bcast(r, { t: 'chat', id: c.id, name: c.name, team: c.team, m: String(m.m || '').slice(0, 120) }); break;
      }
    }

    return { rooms, conns, addConn, handle, drop, closeAll };
  }
  return { createHub, cleanCfg, TEAMALL, MODE_DEF };
});
