import * as THREE from 'three';
import { createWorld, slotPosition, SLOT_INFO, W, H } from './scene.js';
import { Character } from './characters.js';
import { HUD } from './hud.js';
import { Sfx, TTS, Music } from './audio.js';

const params = new URLSearchParams(location.search);
const quality = params.get('q') === 'low' ? 'low' : 'high';
const app = document.getElementById('app');
const labelsEl = document.getElementById('labels');
const fxEl = document.getElementById('fx');

const world = createWorld(document.getElementById('scene'), quality);
const hud = new HUD();
const sfx = new Sfx();
const music = new Music('yt');
const tts = new TTS(music);
let cfg = { tts: {}, music: {}, tiers: [1, 30, 100, 500] };

// ---------- Co giãn khung 720x1280 vừa cửa sổ ----------
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  app.style.transform = `translate(-50%, -50%) scale(${s})`;
  const pr = Math.min(2, Math.max(1, s * devicePixelRatio)) * (quality === 'low' ? 0.7 : 1);
  world.setPixelRatio(pr);
}
addEventListener('resize', fit);
fit();

// ---------- Bật âm thanh (trình duyệt yêu cầu 1 lần bấm) ----------
const gate = document.getElementById('audioGate');
let unlocked = false;
function unlock() {
  if (unlocked) return;
  unlocked = true;
  gate.classList.add('hide');
  sfx.unlock();
  tts.unlock();
  music.unlock();
}
addEventListener('pointerdown', unlock);
addEventListener('keydown', unlock);
if (params.get('autoplay') === '1') unlock();

// ---------- Nhân vật ----------
const chars = new Map();
const dying = [];
const ctx = { scene: world.scene, labelsEl, particles: world.particles, camera: world.camera };
const RANK_LABEL = ['👑 VIP 1', '🥈 TOP 2', '🥇 TOP 1', '🥉 TOP 3', '👑 VIP 2'];
const RANK_NUM = [null, 2, 1, 3, null];
let lastState = null;

function addChar(u) {
  let c = chars.get(u.id);
  if (c) { c.setUser(u); return c; }
  c = new Character(u, ctx);
  chars.set(u.id, c);
  if (lastState && lastState.podium.includes(u.id)) applyPodium(lastState.podium);
  return c;
}
function removeChar(id) {
  const c = chars.get(id);
  if (!c) return;
  chars.delete(id);
  c.remove();
  dying.push(c);
}

function applyPodium(ids) {
  const on = new Set();
  ids.forEach((id, i) => {
    world.podiums[i].setOccupied(!!id && chars.has(id));
    if (!id) return;
    const c = chars.get(id);
    if (!c) return;
    on.add(id);
    if (c.mode !== 'podium' || c.slot !== i) {
      c.goPodium(i, slotPosition(i), RANK_LABEL[i], SLOT_INFO[i].kind === 'vip' ? 'vip' : 'top');
      sfx.pop();
    }
    c.setRank(RANK_NUM[i]);
  });
  for (const c of chars.values()) if (c.mode === 'podium' && !on.has(c.id)) c.leavePodium();
}

// ---------- Hiệu ứng DOM ----------
const tmp = { x: 0, y: 0, z: 0 };
let heartCount = 0;
function hearts(c, n = 3) {
  if (heartCount > 45) return;
  c.headScreen(tmp);
  if (tmp.z > 1) return;
  const em = ['❤️', '💖', '💗', '💕', '💘'];
  for (let i = 0; i < n; i++) {
    const h = document.createElement('div');
    h.className = 'heart';
    h.textContent = em[(Math.random() * em.length) | 0];
    h.style.left = tmp.x - 11 + (Math.random() - 0.5) * 30 + 'px';
    h.style.top = tmp.y - 10 + 'px';
    h.style.setProperty('--dx', (Math.random() - 0.5) * 80 + 'px');
    h.style.animationDelay = i * 0.12 + 's';
    fxEl.appendChild(h);
    heartCount++;
    setTimeout(() => { h.remove(); heartCount--; }, 1900);
  }
}
function floatText(c, text) {
  c.headScreen(tmp);
  if (tmp.z > 1) return;
  const el = document.createElement('div');
  el.className = 'plus';
  el.textContent = text;
  el.style.left = tmp.x - 14 + 'px';
  el.style.top = tmp.y - 34 + 'px';
  fxEl.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

// ---------- Xử lý trạng thái game ----------
function readQuestion(s) {
  const t = cfg.tts || {};
  if (!t.question) return;
  let text = `Câu ${s.qNo}. ${s.question.text}`;
  if (t.answers) text += ' ' + s.question.answers.map((a, i) => `${'ABCD'[i]}: ${a}.`).join(' ');
  tts.say(text, 'question');
}

function handleState(s) {
  hud.setOffset(s.now);
  const prev = lastState;
  lastState = s;
  hud.state = s;
  hud.renderBoards(s.boards);
  applyPodium(s.podium);

  const t = cfg.tts || {};
  const entered = (ph) => s.phase === ph && (!prev || prev.phase !== ph);

  if (s.phase === 'question') {
    const isNew = !prev || prev.phase !== 'question' || prev.qNo !== s.qNo || prev.sessionNo !== s.sessionNo;
    if (isNew) {
      hud.showQuestion(s);
      if (prev) { sfx.whoosh(); readQuestion(s); }
    } else hud.updateAnswered(s.answered);
  }

  if (entered('reveal')) {
    hud.showReveal(s);
    if (prev) {
      sfx.correct();
      // ai trả lời đúng thì nhảy lên
      for (const c of chars.values()) {
        if (c.lastQ === `${s.sessionNo}:${s.qNo}` && c.lastChoice === s.correct) {
          setTimeout(() => { c.jump(); floatText(c, '✔'); }, Math.random() * 500);
        }
      }
      const combos = s.reveal?.combos || [];
      combos.forEach((cb) => { const c = chars.get(cb.id); if (c) setTimeout(() => floatText(c, `🔥x${cb.streak}`), 700); });
      if (t.reveal) {
        const L = 'ABCD'[s.correct];
        let text = `Đáp án đúng là ${L}. ${s.question.answers[s.correct]}.`;
        if (s.reveal?.fastest) text += ` Nhanh nhất là ${s.reveal.fastest.nick}.`;
        tts.say(text, 'reveal');
      }
    }
  } else if (s.phase === 'reveal' && !prev) hud.showReveal(s);

  if (entered('intro')) {
    hud.overlayIntro(s);
    if (prev) {
      sfx.fanfare();
      tts.say(`Phiên số ${s.sessionNo} bắt đầu! Hãy comment A, B, C hoặc D để trả lời nhé!`, 'session');
    }
  }
  if (entered('sessionEnd')) {
    hud.overlaySessionEnd(s);
    if (prev) {
      sfx.fanfare();
      world.confetti.burst();
      fireworks(6);
      const w = s.winners || [];
      if (w[0]) tts.say(`Chúc mừng ${w[0].nick} đã vô địch phiên ${s.sessionNo} với ${w[0].score} điểm!`, 'session');
      w.forEach((u) => { const c = chars.get(u.id); if (c) c.celebrate(90); });
    }
  }
  if (s.phase === 'idle') hud.overlayIdle();
}

function fireworks(n) {
  const colorsSet = [[0xff3fa4, 0xffc83d], [0x2ee6ff, 0xffffff], [0x8b5cff, 0xff3fa4], [0x1fe07a, 0xffc83d]];
  for (let i = 0; i < n; i++) {
    setTimeout(() => {
      const p = new THREE.Vector3((Math.random() - 0.5) * 9, 3 + Math.random() * 3, -4 + Math.random() * 5);
      world.particles.firework(p, colorsSet[i % colorsSet.length]);
      sfx.tone(180 + Math.random() * 120, 0.4, 'sawtooth', 0.12, 0, -100);
    }, i * 350);
  }
}

function applyConfig(c) {
  cfg = { ...cfg, ...c };
  hud.setTitle(cfg.title);
  hud.setTicker(cfg.tiers);
  tts.setConfig(cfg.tts || {});
  music.set(cfg.music || {});
}

// ---------- Socket ----------
const socket = io({ transports: ['websocket', 'polling'] });
socket.on('init', ({ users, state, config }) => {
  for (const c of chars.values()) c.dispose();
  chars.clear();
  applyConfig(config);
  users.forEach(addChar);
  lastState = null;
  handleState(state);
});
socket.on('config', applyConfig);
socket.on('state', handleState);
socket.on('crowd:add', addChar);
socket.on('crowd:remove', removeChar);
socket.on('crowd:update', (u) => { const c = chars.get(u.id); if (c) c.setUser(u); else addChar(u); });
socket.on('chat', ({ id, text, choice }) => {
  const c = chars.get(id);
  if (!c) return;
  c.say(text, choice);
  if (choice != null && lastState) { c.lastChoice = choice; c.lastQ = `${lastState.sessionNo}:${lastState.qNo}`; }
});
socket.on('like', ({ id, count }) => { const c = chars.get(id); if (c) hearts(c, Math.min(4, 1 + Math.floor((count || 1) / 5))); });
socket.on('join', ({ id, nick, bot }) => {
  if (bot) return;
  hud.toast(`👋 <b>${escape(nick)}</b> vừa vào khán đài`);
  if (cfg.tts?.join) tts.say(`Chào mừng ${nick}`, 'info');
});
socket.on('follow', ({ nick }) => hud.toast(`➕ <b>${escape(nick)}</b> đã follow kênh`, 'follow'));
socket.on('gift', (g) => {
  hud.gift(g);
  sfx.gift();
  const c = chars.get(g.id);
  if (c) {
    c.celebrate(Math.min(200, 40 + g.diamonds));
    hearts(c, 4);
  }
  if (g.tierUp) setTimeout(() => sfx.levelUp(), 400);
  if (g.diamonds >= 100) { fireworks(Math.min(8, 2 + Math.floor(g.diamonds / 200))); world.confetti.burst(); }
  if (cfg.tts?.gift) {
    const tierNames = ['', 'Fan Cứng', 'VIP', 'Đại Gia', 'Huyền Thoại'];
    let text = `Cảm ơn ${g.nick} đã tặng ${g.count > 1 ? g.count + ' ' : ''}${g.giftName}!`;
    if (g.tierUp) text += ` Chúc mừng bạn đã lên cấp ${tierNames[g.tier]}!`;
    tts.say(text, 'gift');
  }
});
socket.on('tts:say', (text) => tts.say(text, 'info'));
socket.on('announce', (text) => { hud.announce(text); tts.say(text, 'info'); });
socket.on('disconnect', () => hud.toast('⚠️ Mất kết nối server, đang kết nối lại…'));

function escape(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------- Vòng lặp khung hình ----------
let last = performance.now();
const pos = { x: 0, y: 0, z: 0 };
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  world.update(t, dt);
  const list = [...chars.values()];
  for (const c of list) c.update(dt, t, list);
  for (let i = dying.length - 1; i >= 0; i--) {
    dying[i].update(dt, t, list);
    if (dying[i].dead) dying.splice(i, 1);
  }
  world.render();

  // đặt nhãn tên theo vị trí đầu nhân vật
  for (const c of list) {
    c.headScreen(pos);
    const visible = pos.z < 1 && pos.x > -60 && pos.x < W + 60 && pos.y > 0 && pos.y < H + 40;
    if (!visible) { c.label.style.display = 'none'; continue; }
    c.label.style.display = '';
    const sc = c.mode === 'podium' ? 1 : Math.max(0.8, Math.min(1.15, 0.55 + (pos.y / H) * 0.6));
    c.label.style.transform = `translate(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px) translate(-50%, -100%) scale(${sc.toFixed(3)})`;
    c.label.style.zIndex = c.mode === 'podium' ? 2000 : String(Math.round(pos.y));
  }
  const tick = hud.tick();
  if (tick) sfx.tick(tick <= 3);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Giữ server Render không ngủ khi đang mở trang
setInterval(() => fetch('/health').catch(() => {}), 5 * 60 * 1000);
