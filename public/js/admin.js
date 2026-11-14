(function () {
  const $ = (id) => document.getElementById(id);
  const PHASE = { idle: 'Đang dừng', intro: 'Mở đầu phiên', question: 'Đang hỏi', reveal: 'Hiện đáp án', sessionEnd: 'Vinh danh' };
  const TT = { connected: 'ok', connecting: 'warn', error: 'err', disconnected: '' };
  let socket = null;
  let state = null;
  let formLoaded = false;

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), 2600);
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Đăng nhập ----------
  function login(pw) {
    if (socket) socket.disconnect();
    socket = io('/admin', { auth: { password: pw }, transports: ['websocket', 'polling'] });
    socket.on('connect_error', (e) => {
      $('loginErr').textContent = e.message || 'Không kết nối được';
      $('login').classList.remove('hidden');
      $('main').classList.add('hidden');
    });
    socket.on('connect', () => {
      try { localStorage.setItem('adminPw', pw); } catch (_) {}
      $('login').classList.add('hidden');
      $('main').classList.remove('hidden');
      $('loginErr').textContent = '';
    });
    socket.on('admin:state', render);
    socket.on('tiktok', renderTikTok);
    socket.on('toast', toast);
    socket.on('logs', (list) => { $('log').innerHTML = ''; list.forEach(addLog); });
    socket.on('log', addLog);
  }
  $('loginForm').addEventListener('submit', (e) => { e.preventDefault(); login($('pw').value); });
  try { const saved = localStorage.getItem('adminPw'); if (saved) { $('pw').value = saved; login(saved); } } catch (_) {}

  const emit = (ev, data) => socket && socket.emit(ev, data);

  // ---------- Hiển thị ----------
  function addLog(e) {
    const div = document.createElement('div');
    div.className = e.type;
    div.textContent = `[${new Date(e.t).toLocaleTimeString('vi-VN')}] ${e.text}`;
    const log = $('log');
    log.prepend(div);
    while (log.children.length > 300) log.lastChild.remove();
  }

  function renderTikTok(t) {
    if (!t) return;
    const el = $('stTiktok');
    el.className = 'pill ' + (TT[t.status] || '');
    el.textContent = 'TikTok: ' + ({ connected: 'Đã kết nối', connecting: 'Đang kết nối', error: 'Lỗi', disconnected: 'Chưa kết nối' }[t.status] || t.status) + (t.viewers ? ` • 👀 ${t.viewers}` : '');
    $('ttMsg').textContent = t.message || '';
    if (!t.available) $('ttMsg').textContent = 'Chưa cài thư viện tiktok-live-connector (chạy npm install).';
  }

  function render(s) {
    state = s;
    const c = s.cfg;
    renderTikTok(s.tiktok);
    $('stPhase').textContent = `Game: ${PHASE[s.phase] || s.phase}` + (s.sessionNo ? ` • Phiên #${s.sessionNo} • Câu ${s.qNo}` : '');
    $('stPhase').className = 'pill ' + (s.phase === 'idle' ? '' : 'ok');
    $('stPages').textContent = `Trang xem: ${s.viewerPages}`;
    $('stPages').className = 'pill ' + (s.viewerPages ? 'ok' : 'warn');
    $('stCrowd').textContent = `Khán đài: ${s.crowd} (${s.bots} bot)`;

    // câu hỏi hiện tại (admin thấy đáp án)
    if (s.question) {
      $('curQ').innerHTML = `<div class="muted small">${esc(s.question.category)}</div><div class="q">${esc(s.question.text)}</div><div class="answers">` +
        s.question.answers.map((a, i) => `<div class="a ${i === s.question.correct ? 'ok' : ''}">${'ABCD'[i]}. ${esc(a)}</div>`).join('') + '</div>';
    } else $('curQ').innerHTML = `<span class="muted">${s.phase === 'idle' ? 'Game đang dừng — bấm ▶ Bắt đầu.' : 'Đang chuyển câu…'}</span>`;

    // bảng xếp hạng
    $('admDonors').innerHTML = s.boards.donors.map((d) => `<li>${esc(d.nick)} — 💎${d.diamonds}</li>`).join('') || '<li class="muted">Chưa có</li>';
    $('admScores').innerHTML = s.boards.scores.map((d) => `<li>${esc(d.nick)} — ${d.score}</li>`).join('') || '<li class="muted">Chưa có</li>';

    // kho câu hỏi
    const q = s.questions;
    $('qStats').textContent = `Câu viết sẵn: ${q.staticTotal} (đã dùng ${q.used}) • Đã ra ${q.served} câu từ lúc chạy • Câu hỏi riêng: ${q.custom} • Toán, Thủ đô, Tiếng Anh, Hóa học, Từ trái nghĩa có bộ sinh tự động (gần như vô hạn).`;
    if (!formLoaded || !$('cats').children.length) {
      $('cats').innerHTML = s.categories.map((k) => `<label class="check"><input type="checkbox" data-cat="${k.key}" ${k.enabled ? 'checked' : ''}/> ${esc(k.label)} <span class="muted small">(${k.key === 'custom' ? k.total : k.total + (k.generator ? '+∞' : '')})</span></label>`).join('');
    }

    if (!formLoaded) {
      formLoaded = true;
      $('ttId').value = c.tiktokId || '';
      $('ttKey').value = c.signApiKey || '';
      $('cfgQT').value = c.questionTime;
      $('cfgRT').value = c.revealTime;
      $('cfgSM').value = c.sessionMinutes;
      $('cfgMC').value = c.maxCrowd;
      $('cfgAuto').checked = !!c.autoNextSession;
      $('cfgTitle').value = c.title || '';
      $('musicUrl').value = c.music.url || '';
      $('musicVol').value = c.music.volume;
      $('musicVolVal').textContent = c.music.volume;
      $('ttsEnabled').checked = !!c.tts.enabled;
      $('ttsQuestion').checked = !!c.tts.question;
      $('ttsAnswers').checked = !!c.tts.answers;
      $('ttsReveal').checked = !!c.tts.reveal;
      $('ttsGift').checked = !!c.tts.gift;
      $('ttsJoin').checked = !!c.tts.join;
      $('ttsEngine').value = c.tts.engine || 'auto';
      $('ttsRate').value = c.tts.rate || 1;
      $('botCount').value = c.bots.count; $('botCountVal').textContent = c.bots.count;
      $('botAcc').value = c.bots.accuracy; $('botAccVal').textContent = c.bots.accuracy;
      $('botRate').value = c.bots.answerRate; $('botRateVal').textContent = c.bots.answerRate;
      $('botChat').checked = !!c.bots.chat;
      $('botScore').checked = !!c.bots.score;
      c.tiers.forEach((v, i) => ($('tier' + i).value = v));
    }
  }

  // ---------- Nút bấm ----------
  const on = (id, fn) => $(id).addEventListener('click', fn);
  on('btnConnect', () => {
    const id = $('ttId').value.trim();
    if (!id) return toast('Nhập TikTok ID trước nhé');
    emit('tiktok:connect', { id, apiKey: $('ttKey').value.trim() });
    toast('Đang kết nối @' + id.replace(/^@/, '') + '…');
  });
  on('btnDisconnect', () => emit('tiktok:disconnect'));
  on('btnStart', () => emit('game:start'));
  on('btnStop', () => emit('game:stop'));
  on('btnSkip', () => emit('game:skip'));
  on('btnEndSession', () => emit('game:endSession'));
  on('btnNewSession', () => emit('game:newSession'));
  on('btnResetScores', () => confirm('Xóa toàn bộ điểm của phiên hiện tại?') && emit('game:resetScores'));
  on('btnResetDonors', () => confirm('Xóa bảng vàng donate (và trang phục VIP)?') && emit('game:resetDonors'));
  on('btnSaveGame', () => {
    emit('config:set', {
      questionTime: +$('cfgQT').value, revealTime: +$('cfgRT').value, sessionMinutes: +$('cfgSM').value,
      maxCrowd: +$('cfgMC').value, autoNextSession: $('cfgAuto').checked, title: $('cfgTitle').value.trim(),
    });
    toast('Đã lưu cài đặt game (áp dụng từ câu/phiên tiếp theo)');
  });

  // Nhạc
  const sendMusic = (playing) => {
    const music = { url: $('musicUrl').value.trim(), volume: +$('musicVol').value };
    if (playing !== undefined) music.playing = playing;
    emit('config:set', { music });
  };
  $('musicVol').addEventListener('input', () => { $('musicVolVal').textContent = $('musicVol').value; });
  $('musicVol').addEventListener('change', () => sendMusic());
  on('btnMusicPlay', () => { if (!$('musicUrl').value.trim()) return toast('Dán link nhạc trước nhé'); sendMusic(true); toast('Đã gửi nhạc tới trang người xem'); });
  on('btnMusicStop', () => sendMusic(false));

  // Giọng đọc
  on('btnSaveTts', () => {
    emit('config:set', {
      tts: {
        enabled: $('ttsEnabled').checked, question: $('ttsQuestion').checked, answers: $('ttsAnswers').checked,
        reveal: $('ttsReveal').checked, gift: $('ttsGift').checked, join: $('ttsJoin').checked,
        engine: $('ttsEngine').value, rate: +$('ttsRate').value || 1,
      },
    });
    toast('Đã lưu giọng đọc');
  });
  on('btnTtsTest', () => emit('tts:test', $('ttsTestText').value.trim()));

  // Bot
  [['botCount', 'botCountVal'], ['botAcc', 'botAccVal'], ['botRate', 'botRateVal']].forEach(([a, b]) =>
    $(a).addEventListener('input', () => { $(b).textContent = $(a).value; }));
  on('btnBots', () => {
    emit('bots:set', { count: +$('botCount').value, accuracy: +$('botAcc').value, answerRate: +$('botRate').value, chat: $('botChat').checked, score: $('botScore').checked });
    toast('Đã cập nhật bot');
  });

  // VIP
  on('btnTiers', () => {
    const tiers = [0, 1, 2, 3].map((i) => Math.max(1, +$('tier' + i).value || 1));
    for (let i = 1; i < 4; i++) if (tiers[i] <= tiers[i - 1]) return toast('Mốc sau phải lớn hơn mốc trước');
    emit('config:set', { tiers });
    toast('Đã lưu mốc VIP');
  });

  // Thông báo
  on('btnAnnounce', () => { const t = $('annText').value.trim(); if (t) { emit('announce', t); toast('Đã gửi thông báo'); } });

  // Test
  const nick = () => $('testNick').value.trim() || 'Khách test';
  on('btnTestComment', () => emit('test:comment', { nick: nick(), text: $('testText').value || 'A' }));
  on('btnTestGift', () => emit('test:gift', { nick: nick(), giftName: $('testGiftName').value, diamonds: +$('testGiftCoins').value, count: +$('testGiftCount').value }));
  on('btnTestJoin', () => emit('test:join', { nick: nick() }));
  on('btnTestLike', () => emit('test:like', { nick: nick() }));
  on('btnTestBig', () => emit('test:gift', { nick: nick(), giftName: 'Thiên hà', diamonds: 1000, count: 1 }));

  // Câu hỏi
  on('btnSaveCats', () => {
    const map = {};
    document.querySelectorAll('#cats input[data-cat]').forEach((i) => (map[i.dataset.cat] = i.checked));
    emit('categories:set', map);
    toast('Đã lưu chủ đề');
  });
  on('btnResetHistory', () => confirm('Cho phép hỏi lại các câu đã hỏi?') && emit('questions:resetHistory'));
  on('btnAddCustom', () => { const t = $('customQ').value.trim(); if (t) { emit('questions:addCustom', t); $('customQ').value = ''; $('cats').innerHTML = ''; } });
  on('btnClearCustom', () => confirm('Xóa hết câu hỏi riêng?') && emit('questions:clearCustom'));
})();
