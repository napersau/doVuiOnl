'use strict';
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { QuestionManager } = require('./src/questions');
const { Game, merge } = require('./src/game');
const { TikTokBridge } = require('./src/tiktok');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const DEMO = process.argv.includes('--demo') || process.env.DEMO === '1';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, pingInterval: 20000, pingTimeout: 30000 });

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: '1h' }));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/health', (_req, res) => res.json({ ok: true, t: Date.now() }));

// Đọc tiếng Việt qua Google Translate TTS (dự phòng khi máy không có giọng Việt)
const ttsCache = new Map();
app.get('/tts', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 200);
  if (!q) return res.status(400).end();
  try {
    let buf = ttsCache.get(q);
    if (!buf) {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(q)}`;
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://translate.google.com/' } });
      if (!r.ok) return res.status(502).end();
      buf = Buffer.from(await r.arrayBuffer());
      ttsCache.set(q, buf);
      if (ttsCache.size > 300) ttsCache.delete(ttsCache.keys().next().value);
    }
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  } catch (e) {
    res.status(502).end();
  }
});

const qm = new QuestionManager();
const game = new Game(io, qm);
const tiktok = new TikTokBridge();
game.getTikTokInfo = () => tiktok.info();

// ---- TikTok -> Game ----
tiktok.on('comment', (d) => game.onComment(d));
tiktok.on('gift', (d) => game.onGift(d));
tiktok.on('join', (d) => game.onJoin(d));
tiktok.on('like', (d) => game.onLike(d));
tiktok.on('follow', (d) => game.onFollow(d));
tiktok.on('viewers', () => game.adminNs.emit('tiktok', tiktok.info()));
tiktok.on('status', (info) => {
  game.log('tiktok', info.message || info.status);
  game.adminNs.emit('tiktok', info);
  game.emitAdmin();
});

// ---- Trang người xem ----
io.on('connection', (socket) => {
  socket.emit('init', game.initPayload());
  game.emitAdmin();
  socket.on('disconnect', () => game.emitAdmin());
});

// ---- Trang admin (có mật khẩu) ----
const admin = io.of('/admin');
admin.use((socket, next) => {
  if (socket.handshake.auth && socket.handshake.auth.password === ADMIN_PASSWORD) return next();
  next(new Error('Sai mật khẩu admin'));
});

let testSeq = 0;
admin.on('connection', (socket) => {
  socket.emit('admin:state', game.adminState(tiktok.info()));
  socket.emit('logs', game.logs);

  const on = (ev, fn) => socket.on(ev, (...args) => {
    try { fn(...args); } catch (e) { console.error('[admin]', ev, e); socket.emit('toast', 'Lỗi: ' + e.message); }
    game.emitAdmin();
  });

  on('tiktok:connect', ({ id, apiKey } = {}) => {
    game.cfg.tiktokId = String(id || '').trim().replace(/^@/, '');
    if (apiKey !== undefined) game.cfg.signApiKey = String(apiKey || '').trim();
    game.saveCfg();
    tiktok.connect(game.cfg.tiktokId, game.cfg.signApiKey);
  });
  on('tiktok:disconnect', () => tiktok.disconnect());

  on('game:start', () => game.start());
  on('game:stop', () => game.stop());
  on('game:skip', () => game.skip());
  on('game:endSession', () => game.requestEndSession());
  on('game:newSession', () => { game.stop(); game.startSession(); });
  on('game:resetScores', () => game.resetScores());
  on('game:resetDonors', () => game.resetDonors());

  on('config:set', (patch = {}) => {
    const allowed = ['questionTime', 'revealTime', 'sessionMinutes', 'autoNextSession', 'maxCrowd', 'tiers', 'music', 'tts', 'title', 'idleMinutes'];
    const clean = {};
    for (const k of allowed) if (patch[k] !== undefined) clean[k] = patch[k];
    if (clean.questionTime) clean.questionTime = Math.max(5, Math.min(60, Number(clean.questionTime)));
    if (clean.revealTime) clean.revealTime = Math.max(3, Math.min(20, Number(clean.revealTime)));
    if (clean.sessionMinutes) clean.sessionMinutes = Math.max(1, Math.min(120, Number(clean.sessionMinutes)));
    if (clean.maxCrowd) clean.maxCrowd = Math.max(10, Math.min(150, Number(clean.maxCrowd)));
    if (clean.tiers) clean.tiers = clean.tiers.map((x) => Math.max(1, Number(x) || 1)).slice(0, 4);
    game.cfg = merge(game.cfg, clean);
    game.saveCfg();
    io.emit('config', game.publicConfig());
    if (clean.tiers) {
      for (const id of game.crowd) { const u = game.users.get(id); if (u && u.diamonds) io.emit('crowd:update', game.pub(u)); }
      game.emitState();
    }
  });

  on('categories:set', (map = {}) => {
    game.cfg.categories = { ...game.cfg.categories, ...map };
    qm.setEnabled(game.cfg.categories);
    game.saveCfg();
  });

  on('bots:set', (b = {}) => {
    game.setBots({
      count: Number(b.count) || 0,
      accuracy: Math.max(0, Math.min(100, Number(b.accuracy ?? game.cfg.bots.accuracy))),
      answerRate: Math.max(0, Math.min(100, Number(b.answerRate ?? game.cfg.bots.answerRate))),
      chat: b.chat !== undefined ? !!b.chat : game.cfg.bots.chat,
      score: b.score !== undefined ? !!b.score : game.cfg.bots.score,
    });
    game.saveCfg();
  });

  on('tts:test', (text) => io.emit('tts:say', String(text || 'Xin chào các bạn, chào mừng đến với Ai thông minh hơn học sinh lớp 5').slice(0, 300)));
  on('announce', (text) => io.emit('announce', String(text || '').slice(0, 160)));

  // ---- Kiểm thử (giả lập sự kiện TikTok) ----
  const testUser = (nick) => {
    const n = String(nick || '').trim() || 'Khách test ' + ++testSeq;
    return { id: 'test_' + n.toLowerCase().replace(/\s+/g, '_'), nick: n, avatar: '' };
  };
  on('test:comment', ({ nick, text } = {}) => game.onComment({ ...testUser(nick), text: String(text || 'A') }));
  on('test:join', ({ nick } = {}) => game.onJoin(testUser(nick)));
  on('test:like', ({ nick } = {}) => game.onLike({ ...testUser(nick), count: 10 }));
  on('test:gift', ({ nick, giftName, diamonds, count } = {}) => {
    const c = Math.max(1, Number(count) || 1);
    const per = Math.max(1, Number(diamonds) || 1);
    game.onGift({ ...testUser(nick), giftName: giftName || 'Hoa hồng', giftPic: '', count: c, diamonds: per * c });
  });

  on('questions:addCustom', (text) => {
    const r = qm.addCustom(text);
    socket.emit('toast', `Đã thêm ${r.added} câu hỏi` + (r.errors.length ? ` — lỗi ở dòng: ${r.errors.join(', ')}` : ''));
  });
  on('questions:clearCustom', () => { qm.clearCustom(); socket.emit('toast', 'Đã xóa câu hỏi riêng'); });
  on('questions:resetHistory', () => { qm.resetHistory(); socket.emit('toast', 'Đã làm mới lịch sử câu hỏi'); });
});

// ---- Giữ server Render free không ngủ khi đang live ----
const SELF_URL = process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL;
if (SELF_URL) {
  setInterval(() => {
    const busy = tiktok.status === 'connected' || io.of('/').sockets.size > 0 || game.phase !== 'idle';
    if (busy) fetch(SELF_URL.replace(/\/$/, '') + '/health').catch(() => {});
  }, 10 * 60 * 1000);
}

server.listen(PORT, () => {
  console.log(`\n🎮 Game đang chạy:`);
  console.log(`   Trang người xem : http://localhost:${PORT}/`);
  console.log(`   Trang admin     : http://localhost:${PORT}/admin   (mật khẩu: ${ADMIN_PASSWORD === 'admin123' ? 'admin123 — hãy đổi bằng biến ADMIN_PASSWORD' : 'đã đặt qua ADMIN_PASSWORD'})\n`);
  if (game.cfg.tiktokId && process.env.AUTO_CONNECT === '1') tiktok.connect(game.cfg.tiktokId, game.cfg.signApiKey);
  if (DEMO) {
    game.setBots({ count: 35, chat: true, score: true });
    setTimeout(() => game.start(), 1500);
    // Giả lập vài món quà để xem hiệu ứng VIP
    const demoGifts = [['Lan Anh', 'Hoa hồng', 1, 5], ['Minh Tuấn', 'Kem', 1, 40], ['Bảo Ngọc', 'Bánh donut', 30, 4], ['Gia Huy', 'Thiên hà', 1000, 1]];
    demoGifts.forEach(([nick, giftName, diamonds, count], i) =>
      setTimeout(() => game.onGift({ id: 'demo_' + i, nick, avatar: '', giftName, giftPic: '', count, diamonds: diamonds * count }), 4000 + i * 6000));
  }
});
