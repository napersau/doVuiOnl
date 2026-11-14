'use strict';
const store = require('./store');
const { normalizeText } = require('./util');
const { botName, answerText, CHATTER, rand, pick } = require('./bots');

const DEFAULTS = {
  questionTime: 15, // giây trả lời
  revealTime: 6, // giây hiện đáp án
  introTime: 5,
  sessionMinutes: 10,
  sessionEndTime: 14,
  autoNextSession: true,
  maxCrowd: 70,
  idleMinutes: 15,
  tiers: [1, 30, 100, 500], // mốc xu: Fan cứng / VIP vương miện / Đại gia áo choàng / Huyền thoại đôi cánh
  bots: { count: 0, accuracy: 55, answerRate: 70, chat: true, score: false },
  music: { url: '', volume: 15, playing: false },
  tts: { enabled: true, question: true, answers: false, reveal: true, gift: true, join: false, engine: 'auto', rate: 1.05, volume: 1 },
  categories: {},
  tiktokId: '',
  signApiKey: '',
  title: 'AI THÔNG MINH HƠN HỌC SINH LỚP 5',
};

function merge(base, over) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) out[k] = merge(base[k], v);
    else if (v !== undefined) out[k] = v;
  }
  return out;
}

// Nhận diện đáp án từ bình luận: "a", "B", "đáp án c", "chọn D nha", "1".."4", hoặc gõ đúng nội dung đáp án
function parseAnswer(text, answers) {
  const s = normalizeText(text);
  if (!s) return null;
  if (/^[1-4]$/.test(s)) return Number(s) - 1;
  const m = s.match(/^(?:dap an|da|chon|cau|la|toi chon|minh chon|em chon)?\s*[:\-]?\s*([abcd])(?=$|[\s.!,)?~:]|\d|[^a-z])/);
  if (m) return 'abcd'.indexOf(m[1]);
  if (answers) {
    const idx = answers.findIndex((a) => normalizeText(a) === s);
    if (idx >= 0) return idx;
  }
  return null;
}

class Game {
  constructor(io, qm) {
    this.io = io;
    this.qm = qm;
    this.adminNs = io.of('/admin');
    this.cfg = merge(DEFAULTS, store.load('config', {}));
    this.qm.setEnabled(this.cfg.categories || {});
    this.users = new Map();
    this.crowd = new Set();
    this.podium = [null, null, null, null, null];
    this.phase = 'idle';
    this.endsAt = 0;
    this.duration = 0;
    this.sessionNo = 0;
    this.sessionEndsAt = 0;
    this.qNo = 0;
    this.q = null;
    this.answers = new Map();
    this.lastReveal = null;
    this.winners = [];
    this.timer = null;
    this.botTimers = [];
    this.botSeq = 0;
    this.logs = [];
    this.endRequested = false;
    this.likeThrottle = new Map();
    this.totalLikes = 0;

    setInterval(() => this._sweep(), 30000);
    setInterval(() => this._botTick(), 2200);
    this.setBots(this.cfg.bots);
  }

  // ---------- Tiện ích ----------
  log(type, text) {
    const e = { t: Date.now(), type, text };
    this.logs.push(e);
    if (this.logs.length > 200) this.logs.shift();
    this.adminNs.emit('log', e);
  }

  saveCfg() {
    store.save('config', this.cfg);
  }

  tierOf(d) {
    const t = this.cfg.tiers;
    if (d >= t[3]) return 4;
    if (d >= t[2]) return 3;
    if (d >= t[1]) return 2;
    if (d >= t[0]) return 1;
    return 0;
  }

  pub(u) {
    return { id: u.id, nick: u.nick, avatar: u.avatar, bot: !!u.bot, diamonds: u.diamonds, tier: this.tierOf(u.diamonds) };
  }

  publicConfig() {
    const c = this.cfg;
    return { music: c.music, tts: c.tts, tiers: c.tiers, title: c.title, questionTime: c.questionTime };
  }

  // ---------- Người dùng & khán đài ----------
  getUser({ id, nick, avatar }, bot = false) {
    let u = this.users.get(id);
    if (!u) {
      u = { id, nick: nick || id, avatar: avatar || '', bot, score: 0, total: 0, correct: 0, streak: 0, diamonds: 0, lastActive: Date.now() };
      this.users.set(id, u);
    } else {
      if (nick) u.nick = nick;
      if (avatar) u.avatar = avatar;
    }
    u.lastActive = Date.now();
    if (!this.crowd.has(id)) this._addToCrowd(u);
    return u;
  }

  _addToCrowd(u) {
    if (this.crowd.size >= this.cfg.maxCrowd) {
      if (u.bot) return false;
      const onPodium = new Set(this.podium);
      const members = [...this.crowd].map((id) => this.users.get(id)).filter((x) => x && !onPodium.has(x.id));
      let victim = members.find((x) => x.bot);
      if (!victim) {
        const plain = members.filter((x) => !x.diamonds).sort((a, b) => a.lastActive - b.lastActive);
        victim = plain[0] || members.sort((a, b) => a.lastActive - b.lastActive)[0];
      }
      if (!victim) return false;
      this._removeFromCrowd(victim.id);
    }
    this.crowd.add(u.id);
    this.io.emit('crowd:add', this.pub(u));
    return true;
  }

  _removeFromCrowd(id) {
    if (!this.crowd.delete(id)) return;
    this.io.emit('crowd:remove', id);
  }

  _sweep() {
    const now = Date.now();
    const onPodium = new Set(this.podium);
    for (const id of [...this.crowd]) {
      const u = this.users.get(id);
      if (!u || u.bot || onPodium.has(id)) continue;
      const limit = (u.diamonds > 0 ? 45 : this.cfg.idleMinutes) * 60000;
      if (now - u.lastActive > limit) this._removeFromCrowd(id);
    }
    if (this.users.size > 4000) {
      for (const [id, u] of this.users) {
        if (!this.crowd.has(id) && !u.score && !u.diamonds && now - u.lastActive > 3600000) this.users.delete(id);
      }
    }
    this.emitAdmin();
  }

  // ---------- Sự kiện từ TikTok / bot / test ----------
  onComment(data, bot = false) {
    if (!data.id) return;
    const u = this.getUser(data, bot);
    let choice = null;
    if (this.phase === 'question' && this.q && !this.answers.has(u.id)) {
      choice = parseAnswer(data.text, this.q.answers);
      if (choice != null) {
        this.answers.set(u.id, { choice, t: Date.now() });
        this.emitState();
      }
    }
    this.io.emit('chat', { id: u.id, text: String(data.text).slice(0, 70), choice });
    if (!bot) this.log('chat', `${u.nick}: ${data.text}`);
  }

  onGift(data) {
    if (!data.id) return;
    const u = this.getUser(data);
    const before = this.tierOf(u.diamonds);
    u.diamonds += Math.max(0, Number(data.diamonds) || 0);
    const after = this.tierOf(u.diamonds);
    this.io.emit('crowd:update', this.pub(u));
    this.io.emit('gift', {
      id: u.id, nick: u.nick, avatar: u.avatar, giftName: data.giftName, giftPic: data.giftPic,
      count: data.count, diamonds: data.diamonds, total: u.diamonds, tier: after, tierUp: after > before,
    });
    this.log('gift', `🎁 ${u.nick} tặng ${data.giftName} x${data.count} (${data.diamonds} xu) — tổng ${u.diamonds}`);
    this._updatePodium();
    this.emitState();
  }

  onJoin(data, bot = false) {
    if (!data.id) return;
    const isNew = !this.crowd.has(data.id);
    const u = this.getUser(data, bot);
    if (isNew) this.io.emit('join', { id: u.id, nick: u.nick, bot });
  }

  onLike(data, bot = false) {
    if (!data.id) return;
    const u = this.getUser(data, bot);
    this.totalLikes += data.count || 1;
    const last = this.likeThrottle.get(u.id) || 0;
    if (Date.now() - last < 900) return;
    this.likeThrottle.set(u.id, Date.now());
    if (this.likeThrottle.size > 3000) this.likeThrottle.clear();
    this.io.emit('like', { id: u.id, count: data.count || 1 });
  }

  onFollow(data) {
    if (!data.id) return;
    const u = this.getUser(data);
    this.io.emit('follow', { id: u.id, nick: u.nick });
    this.log('follow', `➕ ${u.nick} đã follow`);
  }

  // ---------- Bot ----------
  setBots(b) {
    this.cfg.bots = merge(this.cfg.bots, b || {});
    const want = Math.max(0, Math.min(150, Number(this.cfg.bots.count) || 0));
    const bots = [...this.users.values()].filter((u) => u.bot);
    if (bots.length < want) {
      for (let i = bots.length; i < want; i++) {
        const id = 'bot_' + ++this.botSeq;
        this.getUser({ id, nick: botName(), avatar: '' }, true);
      }
    } else if (bots.length > want) {
      bots.slice(want).forEach((u) => {
        this._removeFromCrowd(u.id);
        this.users.delete(u.id);
      });
    }
    if (!this.cfg.bots.score) {
      // bot không tính điểm -> xóa điểm cũ
      for (const u of this.users.values()) if (u.bot) { u.score = 0; u.streak = 0; }
    }
    this._updatePodium();
    this.emitState();
  }

  _scheduleBotAnswers() {
    this.botTimers.forEach(clearTimeout);
    this.botTimers = [];
    const { accuracy, answerRate } = this.cfg.bots;
    const qt = this.cfg.questionTime * 1000;
    for (const u of this.users.values()) {
      if (!u.bot || !this.crowd.has(u.id)) continue;
      if (Math.random() * 100 > answerRate) continue;
      const delay = rand(1500, Math.max(2000, qt - 1200));
      this.botTimers.push(setTimeout(() => {
        if (this.phase !== 'question' || !this.q) return;
        if (this.users.get(u.id) !== u) return; // bot đã bị xóa
        const right = Math.random() * 100 < accuracy;
        let idx = this.q.correct;
        if (!right) { const others = [0, 1, 2, 3].filter((i) => i !== this.q.correct); idx = pick(others); }
        this.onComment({ id: u.id, nick: u.nick, text: answerText(idx) }, true);
      }, delay));
    }
  }

  _botTick() {
    if (!this.cfg.bots.chat) return;
    const bots = [...this.crowd].map((id) => this.users.get(id)).filter((u) => u && u.bot);
    if (!bots.length) return;
    const p = this.phase === 'question' ? 0.15 : 0.55;
    if (Math.random() < p) {
      const u = pick(bots);
      this.io.emit('chat', { id: u.id, text: pick(CHATTER), choice: null });
    }
    if (Math.random() < 0.35) {
      const u = pick(bots);
      this.io.emit('like', { id: u.id, count: rand(1, 5) });
    }
  }

  // ---------- Vòng chơi ----------
  _clear() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  _phase(name, seconds, next) {
    this._clear();
    this.phase = name;
    this.duration = seconds * 1000;
    this.endsAt = Date.now() + this.duration;
    if (next) this.timer = setTimeout(next, this.duration);
    this.emitState(true);
  }

  start() {
    if (this.phase !== 'idle') return;
    this.startSession();
  }

  stop() {
    this._clear();
    this.botTimers.forEach(clearTimeout);
    this.phase = 'idle';
    this.q = null;
    this.log('game', '⏸ Đã dừng game');
    this.emitState(true);
  }

  startSession() {
    this.sessionNo++;
    this.qNo = 0;
    this.endRequested = false;
    for (const u of this.users.values()) { u.score = 0; u.streak = 0; }
    this.winners = [];
    this.sessionEndsAt = Date.now() + this.cfg.sessionMinutes * 60000 + this.cfg.introTime * 1000;
    this._updatePodium();
    this.log('game', `▶ Bắt đầu phiên #${this.sessionNo}`);
    this._phase('intro', this.cfg.introTime, () => this.nextQuestion());
  }

  nextQuestion() {
    if (this.endRequested || Date.now() >= this.sessionEndsAt - 3000) return this.endSession();
    this.q = this.qm.next();
    this.qNo++;
    this.answers.clear();
    this.lastReveal = null;
    this._phase('question', this.cfg.questionTime, () => this.reveal());
    this._scheduleBotAnswers();
    this.emitAdmin();
  }

  reveal() {
    if (!this.q) return;
    const q = this.q;
    const counts = [0, 0, 0, 0];
    const correctUsers = [];
    const qt = this.cfg.questionTime * 1000;
    const qEnds = this.endsAt;
    for (const [id, a] of this.answers) {
      counts[a.choice]++;
      const u = this.users.get(id);
      if (!u) continue;
      if (u.bot && !this.cfg.bots.score) continue;
      if (a.choice === q.correct) {
        const remain = Math.max(0, qEnds - a.t) / qt;
        let pts = 100 + Math.round(50 * remain);
        u.streak++;
        if (u.streak >= 3) pts += Math.min(100, 20 * (u.streak - 2));
        u.score += pts;
        u.total += pts;
        u.correct++;
        correctUsers.push({ id, nick: u.nick, t: a.t, pts, streak: u.streak });
      } else {
        u.streak = 0;
      }
    }
    correctUsers.sort((a, b) => a.t - b.t);
    const totalAns = counts.reduce((s, x) => s + x, 0);
    this.lastReveal = {
      counts,
      total: totalAns,
      correctCount: counts[q.correct],
      fastest: correctUsers[0] ? { id: correctUsers[0].id, nick: correctUsers[0].nick } : null,
      correctIds: correctUsers.slice(0, 40).map((c) => c.id),
      combos: correctUsers.filter((c) => c.streak >= 3).slice(0, 5).map((c) => ({ id: c.id, nick: c.nick, streak: c.streak })),
    };
    this._updatePodium();
    this._phase('reveal', this.cfg.revealTime, () => this.nextQuestion());
  }

  endSession() {
    this.endRequested = false;
    const ranked = [...this.users.values()].filter((u) => u.score > 0 && (this.cfg.bots.score || !u.bot)).sort((a, b) => b.score - a.score);
    this.winners = ranked.slice(0, 3).map((u) => ({ id: u.id, nick: u.nick, avatar: u.avatar, score: u.score }));
    this.q = null;
    this.log('game', `🏆 Kết thúc phiên #${this.sessionNo}: ${this.winners.map((w) => w.nick + ' ' + w.score).join(', ') || 'chưa có ai ghi điểm'}`);
    this._phase('sessionEnd', this.cfg.sessionEndTime, () => {
      if (this.cfg.autoNextSession) this.startSession();
      else { this.phase = 'idle'; this.emitState(true); }
    });
  }

  skip() {
    if (this.phase === 'question') this.reveal();
    else if (this.phase === 'reveal' || this.phase === 'intro') this.nextQuestion();
    else if (this.phase === 'sessionEnd') this.startSession();
  }

  requestEndSession() {
    if (this.phase === 'question' || this.phase === 'reveal' || this.phase === 'intro') {
      this.endRequested = true;
      if (this.phase !== 'question') this.endSession();
    }
  }

  resetScores() {
    for (const u of this.users.values()) { u.score = 0; u.streak = 0; }
    this._updatePodium();
    this.emitState();
  }

  resetDonors() {
    for (const u of this.users.values()) {
      if (u.diamonds) { u.diamonds = 0; if (this.crowd.has(u.id)) this.io.emit('crowd:update', this.pub(u)); }
    }
    this._updatePodium();
    this.emitState();
  }

  _updatePodium() {
    const all = [...this.users.values()];
    const donors = all.filter((u) => u.diamonds > 0).sort((a, b) => b.diamonds - a.diamonds).slice(0, 2);
    const donorIds = new Set(donors.map((u) => u.id));
    const scorers = all
      .filter((u) => u.score > 0 && !donorIds.has(u.id) && (this.cfg.bots.score || !u.bot))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    // Thứ tự trên sân khấu (trái -> phải): VIP1, TOP2, TOP1, TOP3, VIP2
    const next = [donors[0]?.id || null, scorers[1]?.id || null, scorers[0]?.id || null, scorers[2]?.id || null, donors[1]?.id || null];
    next.forEach((id) => {
      if (id && !this.crowd.has(id)) {
        const u = this.users.get(id);
        if (u) { this.crowd.add(id); this.io.emit('crowd:add', this.pub(u)); }
      }
    });
    this.podium = next;
  }

  boards() {
    const all = [...this.users.values()];
    const donors = all
      .filter((u) => u.diamonds > 0)
      .sort((a, b) => b.diamonds - a.diamonds)
      .slice(0, 5)
      .map((u) => ({ id: u.id, nick: u.nick, avatar: u.avatar, diamonds: u.diamonds, tier: this.tierOf(u.diamonds) }));
    const scores = all
      .filter((u) => u.score > 0 && (this.cfg.bots.score || !u.bot))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((u) => ({ id: u.id, nick: u.nick, avatar: u.avatar, score: u.score, streak: u.streak }));
    return { donors, scores };
  }

  snapshot() {
    const q = this.q;
    return {
      now: Date.now(),
      phase: this.phase,
      endsAt: this.endsAt,
      duration: this.duration,
      sessionNo: this.sessionNo,
      sessionEndsAt: this.sessionEndsAt,
      qNo: this.qNo,
      question: q ? { id: q.id, text: q.text, answers: q.answers, category: q.categoryLabel } : null,
      correct: this.phase === 'reveal' && q ? q.correct : null,
      answered: this.answers.size,
      reveal: this.phase === 'reveal' ? this.lastReveal : null,
      winners: this.phase === 'sessionEnd' ? this.winners : null,
      boards: this.boards(),
      podium: this.podium,
      crowdCount: this.crowd.size,
    };
  }

  emitState(immediate) {
    if (immediate) {
      clearTimeout(this._stateT);
      this._stateT = null;
      this.io.emit('state', this.snapshot());
      this.emitAdmin();
      return;
    }
    if (this._stateT) return;
    this._stateT = setTimeout(() => {
      this._stateT = null;
      this.io.emit('state', this.snapshot());
    }, 250);
  }

  adminState(tiktokInfo) {
    return {
      cfg: this.cfg,
      phase: this.phase,
      sessionNo: this.sessionNo,
      qNo: this.qNo,
      endsAt: this.endsAt,
      sessionEndsAt: this.sessionEndsAt,
      now: Date.now(),
      question: this.q ? { text: this.q.text, answers: this.q.answers, correct: this.q.correct, category: this.q.categoryLabel } : null,
      crowd: this.crowd.size,
      users: this.users.size,
      bots: [...this.users.values()].filter((u) => u.bot).length,
      viewerPages: this.io.of('/').sockets.size,
      totalLikes: this.totalLikes,
      questions: this.qm.stats(),
      categories: this.qm.categoriesInfo(),
      boards: this.boards(),
      tiktok: tiktokInfo || (this.getTikTokInfo ? this.getTikTokInfo() : null),
    };
  }

  emitAdmin() {
    if (this._adminT) return;
    this._adminT = setTimeout(() => {
      this._adminT = null;
      this.adminNs.emit('admin:state', this.adminState());
    }, 400);
  }

  initPayload() {
    return {
      users: [...this.crowd].map((id) => this.users.get(id)).filter(Boolean).map((u) => this.pub(u)),
      state: this.snapshot(),
      config: this.publicConfig(),
    };
  }
}

module.exports = { Game, parseAnswer, DEFAULTS, merge };
