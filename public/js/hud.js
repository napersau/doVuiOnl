import { avatarHTML, escapeHTML } from './characters.js';

const $ = (id) => document.getElementById(id);
const LETTERS = 'ABCD';
const RING_LEN = 2 * Math.PI * 22;
const fmtTime = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const fmtNum = (n) => Number(n || 0).toLocaleString('vi-VN');

export class HUD {
  constructor() {
    this.offset = 0;
    this.state = null;
    this.giftQueue = [];
    this.giftBusy = false;
    this.lastTickSec = -1;
    this.el = {
      session: $('sessionChip'), timer: $('timerChip'), logo: $('logoText'),
      donors: document.querySelector('#donorBoard .board-list'), scores: document.querySelector('#scoreBoard .board-list'),
      cat: $('qCat'), no: $('qNo'), text: $('qText'), answers: $('qAnswers'), foot: $('qFoot'),
      timerBox: $('qTimer'), ring: $('qTimerRing'), timerNum: $('qTimerNum'), overlay: $('qOverlay'),
      gift: $('giftStrip'), toasts: $('toasts'), marquee: $('marquee'),
    };
    this.ansEls = [...this.el.answers.querySelectorAll('.ans')];
    this.el.ring.style.strokeDasharray = RING_LEN;
    this.renderBoards({ donors: [], scores: [] });
  }

  setOffset(serverNow) { this.offset = serverNow - Date.now(); }
  now() { return Date.now() + this.offset; }
  setTitle(t) { if (t) this.el.logo.textContent = t; }

  setTicker(tiers = [1, 30, 100, 500]) {
    const parts = [
      '💬 Comment <b>A</b> / <b>B</b> / <b>C</b> / <b>D</b> để trả lời',
      '⚡ Trả lời càng nhanh càng nhiều điểm',
      '🔥 Đúng liên tiếp 3 câu nhận <b>COMBO</b>',
      `🎁 Tặng <b>${tiers[0]} xu</b>: Vòng sáng Fan Cứng 💖`,
      `<b>${tiers[1]} xu</b>: Vương miện VIP 👑`,
      `<b>${tiers[2]} xu</b>: Áo choàng Đại Gia 💎`,
      `<b>${tiers[3]} xu</b>: Đôi cánh Huyền Thoại 🐉`,
      '👑 Top 2 Donate đứng bục VIP trên sân khấu',
      '🏆 Top 3 điểm cao lên sân khấu mỗi phiên 10 phút',
      '❤️ Thả tim để cổ vũ nhé!',
    ];
    this.el.marquee.innerHTML = parts.join('&nbsp;&nbsp;&nbsp;•&nbsp;&nbsp;&nbsp;');
  }

  renderBoards({ donors, scores }) {
    const row = (u, i, val, extra = '') =>
      `<li data-id="${escapeHTML(u.id)}"><span class="rk">${['🥇', '🥈', '🥉'][i] || i + 1}</span>${avatarHTML(u)}<span class="nm">${escapeHTML(u.nick)}${extra}</span><span class="val">${val}</span></li>`;
    const dKey = JSON.stringify(donors.map((d) => [d.id, d.diamonds]));
    if (dKey !== this._dKey) {
      const prevTop = this._dTop;
      this._dKey = dKey;
      this.el.donors.innerHTML = donors.length
        ? donors.map((d, i) => row(d, i, `💎${fmtNum(d.diamonds)}`)).join('')
        : '<li class="empty">Hãy là người đầu tiên tặng quà! 🎁</li>';
      this._dTop = donors[0]?.id;
      if (prevTop !== undefined && this._dTop && prevTop !== this._dTop) this.el.donors.firstChild?.classList.add('flash');
    }
    const sKey = JSON.stringify(scores.map((d) => [d.id, d.score]));
    if (sKey !== this._sKey) {
      this._sKey = sKey;
      this.el.scores.innerHTML = scores.length
        ? scores.map((d, i) => row(d, i, fmtNum(d.score), d.streak >= 3 ? ` 🔥${d.streak}` : '')).join('')
        : '<li class="empty">Trả lời đúng để lên bảng! ✨</li>';
    }
  }

  fitText() {
    const el = this.el.text;
    let size = 32;
    el.style.fontSize = size + 'px';
    while (size > 17 && el.scrollHeight > el.clientHeight + 1) {
      size -= 1;
      el.style.fontSize = size + 'px';
    }
  }

  showQuestion(s) {
    const q = s.question;
    this.hideOverlay();
    this.el.answers.classList.remove('reveal');
    this.el.cat.textContent = q.category || '❓ Câu hỏi';
    this.el.no.textContent = `Câu ${s.qNo}`;
    this.el.text.textContent = q.text;
    this.el.text.classList.remove('enter');
    void this.el.text.offsetWidth;
    this.el.text.classList.add('enter');
    this.fitText();
    this.ansEls.forEach((a, i) => {
      a.classList.remove('correct', 'enter');
      void a.offsetWidth;
      a.classList.add('enter');
      const txt = q.answers[i] || '';
      const t = a.querySelector('.txt');
      t.textContent = txt;
      t.style.fontSize = txt.length > 34 ? '15px' : txt.length > 22 ? '17px' : '19px';
      a.querySelector('.pct').textContent = '';
      a.querySelector('.bar').style.width = '0';
    });
    this.updateAnswered(s.answered || 0);
  }

  updateAnswered(n) {
    this.el.foot.innerHTML = `💬 Comment <b>A</b><b>B</b><b>C</b><b>D</b> để trả lời &nbsp;•&nbsp; 👥 ${fmtNum(n)} đã trả lời`;
  }

  showReveal(s) {
    if (!s.question) return;
    if (this.el.text.textContent !== s.question.text) this.showQuestion(s);
    this.el.answers.classList.add('reveal');
    const r = s.reveal || { counts: [0, 0, 0, 0], total: 0, correctCount: 0 };
    this.ansEls.forEach((a, i) => {
      const pct = r.total ? Math.round((r.counts[i] / r.total) * 100) : 0;
      a.classList.toggle('correct', i === s.correct);
      a.querySelector('.pct').textContent = pct + '%';
      a.querySelector('.bar').style.width = pct + '%';
    });
    this.el.foot.innerHTML = `<span class="ok">✅ Đáp án ${LETTERS[s.correct]} • ${fmtNum(r.correctCount)} người đúng</span>` +
      (r.fastest ? ` &nbsp;•&nbsp; <span class="fast">⚡ Nhanh nhất: ${escapeHTML(r.fastest.nick)}</span>` : '');
  }

  showOverlay(html) {
    this.el.overlay.innerHTML = html;
    this.el.overlay.classList.add('show');
  }
  hideOverlay() { this.el.overlay.classList.remove('show'); }

  overlayIdle() {
    this.showOverlay(`
      <div class="ov-kicker">GAME SHOW TRÍ TUỆ</div>
      <div class="ov-big">SẮP BẮT ĐẦU!</div>
      <div class="ov-sub">💬 Comment bất kỳ để <b>vào khán đài</b></div>
      <div class="ov-sub">🎁 Tặng quà để đứng <b>bục VIP</b> trên sân khấu</div>`);
  }
  overlayIntro(s) {
    this.showOverlay(`
      <div class="ov-kicker">PHIÊN MỚI • 10 PHÚT</div>
      <div class="ov-big">PHIÊN #${s.sessionNo}</div>
      <div class="ov-count" id="ovCount">${Math.ceil((s.endsAt - this.now()) / 1000)}</div>
      <div class="ov-sub">Comment <b>A, B, C, D</b> để trả lời • Top 3 lên sân khấu!</div>`);
  }
  overlaySessionEnd(s) {
    const w = s.winners || [];
    const medals = ['🥇', '🥈', '🥉'];
    const cards = w.length
      ? w.map((u, i) => `<div class="win w${i + 1}"><div class="medal">${medals[i]}</div>${avatarHTML(u)}<div class="wn">${escapeHTML(u.nick)}</div><div class="ws">${fmtNum(u.score)} điểm</div></div>`).join('')
      : '<div class="ov-sub">Phiên này chưa có ai ghi điểm 😢</div>';
    this.showOverlay(`
      <div class="ov-kicker">🏆 KẾT THÚC PHIÊN #${s.sessionNo}</div>
      <div class="ov-big">VINH DANH</div>
      <div class="winners">${cards}</div>
      <div class="ov-sub" id="ovNext"></div>`);
  }

  // Gọi mỗi khung hình
  tick() {
    const s = this.state;
    if (!s) return null;
    const now = this.now();
    const left = s.endsAt - now;
    // đồng hồ phiên
    if (s.phase === 'sessionEnd') this.el.timer.textContent = '🏆 00:00';
    else if (s.phase !== 'idle' && s.sessionEndsAt) this.el.timer.textContent = '⏱ ' + fmtTime(s.sessionEndsAt - now);
    else this.el.timer.textContent = '⏱ --:--';
    this.el.session.textContent = `Phiên #${s.sessionNo || 0}`;
    let tickSec = null;
    if (s.phase === 'question') {
      const frac = Math.max(0, Math.min(1, left / s.duration));
      this.el.ring.style.strokeDashoffset = String(RING_LEN * (1 - frac));
      const sec = Math.max(0, Math.ceil(left / 1000));
      this.el.timerNum.textContent = sec;
      this.el.timerBox.classList.toggle('hurry', sec <= 5);
      if (sec !== this.lastTickSec) { this.lastTickSec = sec; if (sec <= 5 && sec > 0) tickSec = sec; }
    } else {
      this.el.timerBox.classList.remove('hurry');
      if (s.phase === 'reveal') { this.el.ring.style.strokeDashoffset = String(RING_LEN); this.el.timerNum.textContent = '✓'; }
      if (s.phase === 'intro') { const c = document.getElementById('ovCount'); if (c) c.textContent = Math.max(1, Math.ceil(left / 1000)); }
      if (s.phase === 'sessionEnd') { const n = document.getElementById('ovNext'); if (n) n.innerHTML = `Phiên mới bắt đầu sau <b>${Math.max(0, Math.ceil(left / 1000))}s</b>`; }
    }
    return tickSec;
  }

  // ---------- Dải cảm ơn quà ----------
  gift(g) {
    this.giftQueue.push({ type: 'gift', ...g });
    if (this.giftQueue.length > 12) this.giftQueue.splice(0, this.giftQueue.length - 12);
    this._pump();
  }
  announce(text) {
    this.giftQueue.unshift({ type: 'announce', text });
    this._pump();
  }
  _pump() {
    if (this.giftBusy) return;
    const g = this.giftQueue.shift();
    if (!g) return;
    this.giftBusy = true;
    const el = document.createElement('div');
    let dur = 3800;
    if (g.type === 'announce') {
      el.className = 'gift-banner announce';
      el.innerHTML = `<div class="gtext" style="text-align:center"><div class="gl1">📢 ${escapeHTML(g.text)}</div></div>`;
      dur = 5000;
    } else {
      const big = g.diamonds >= 100;
      el.className = 'gift-banner' + (big ? ' big' : '');
      const tierNames = ['', 'Fan Cứng 💖', 'VIP 👑', 'Đại Gia 💎', 'Huyền Thoại 🐉'];
      const line2 = g.tierUp ? `🎉 Lên cấp ${tierNames[g.tier]} • Tổng 💎${fmtNum(g.total)}` : `Cảm ơn bạn rất nhiều! 💖 Tổng 💎${fmtNum(g.total)}`;
      const pic = g.giftPic ? `<img class="gpic" src="${escapeHTML(g.giftPic)}" referrerpolicy="no-referrer" onerror="this.outerHTML='<span class=gemoji>🎁</span>'">` : '<span class="gemoji">🎁</span>';
      el.innerHTML = `${avatarHTML(g)}<div class="gtext"><div class="gl1">${escapeHTML(g.nick)} tặng ${escapeHTML(g.giftName)} x${g.count}</div><div class="gl2">${line2}</div></div>${pic}`;
      dur = big || g.tierUp ? 5200 : this.giftQueue.length > 3 ? 2200 : 3600;
    }
    this.el.gift.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => { el.remove(); this.giftBusy = false; this._pump(); }, 420);
    }, dur);
  }

  toast(html, cls = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + cls;
    el.innerHTML = html;
    this.el.toasts.appendChild(el);
    while (this.el.toasts.children.length > 3) this.el.toasts.firstChild.remove();
    setTimeout(() => el.remove(), 3600);
  }
}
