// Âm thanh: hiệu ứng tổng hợp (không cần file), đọc giọng nói (TTS), nhạc nền (YouTube / mp3)

export class Sfx {
  constructor() { this.ctx = null; this.vol = 0.35; }
  unlock() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  tone(freq, dur = 0.15, type = 'sine', vol = 1, when = 0, slide = 0) {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(this.vol * vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  tick(last) { this.tone(last ? 1320 : 880, 0.07, 'square', 0.25); }
  whoosh() { this.tone(300, 0.35, 'sawtooth', 0.15, 0, 900); this.tone(600, 0.25, 'sine', 0.3, 0.05, 600); }
  correct() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.6, i * 0.09)); }
  gift() { [1046, 1318, 1568, 2093, 1568, 2093].forEach((f, i) => this.tone(f, 0.18, 'sine', 0.45, i * 0.06)); }
  pop() { this.tone(500, 0.12, 'sine', 0.35, 0, 500); }
  fanfare() {
    const n = [523, 523, 523, 698, 880, 784, 880, 1046];
    const d = [0, 0.12, 0.24, 0.36, 0.6, 0.78, 0.9, 1.05];
    n.forEach((f, i) => { this.tone(f, 0.3, 'triangle', 0.6, d[i]); this.tone(f / 2, 0.3, 'sine', 0.3, d[i]); });
  }
  levelUp() { [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.2, 'square', 0.25, i * 0.07)); }
}

// ---------- Đọc giọng nói ----------
export class TTS {
  constructor(music) {
    this.music = music;
    this.cfg = { enabled: true, engine: 'auto', rate: 1.05, volume: 1 };
    this.queue = [];
    this.speaking = false;
    this.current = null;
    this.voice = null;
    this.unlocked = false;
    const pickVoice = () => {
      const vs = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
      const vi = vs.filter((v) => /^vi/i.test(v.lang) || /vietnam|tiếng việt/i.test(v.name));
      this.voice = vi.find((v) => /natural|online|hoaimy|namminh/i.test(v.name)) || vi.find((v) => /google/i.test(v.name)) || vi[0] || null;
    };
    if (window.speechSynthesis) {
      pickVoice();
      speechSynthesis.onvoiceschanged = pickVoice;
    }
  }
  setConfig(cfg) { this.cfg = { ...this.cfg, ...cfg }; }
  engine() {
    if (this.cfg.engine === 'google') return 'google';
    if (this.cfg.engine === 'browser') return window.speechSynthesis ? 'browser' : 'google';
    return this.voice ? 'browser' : 'google';
  }
  unlock() {
    this.unlocked = true;
    if (window.speechSynthesis) { try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (_) {} }
  }
  // kind: question | reveal | gift | info
  say(text, kind = 'info') {
    if (!this.cfg.enabled || !text) return;
    const item = { text: String(text), kind };
    if (kind === 'question' || kind === 'reveal' || kind === 'session') {
      // câu mới thì bỏ các câu đọc cũ, ưu tiên đọc ngay
      this.queue = this.queue.filter((q) => q.kind === 'gift');
      if (this.current && this.current.kind !== 'gift') this._cancel();
      if (this.current && this.current.kind === 'gift' && kind === 'question') this._cancel();
      this.queue.unshift(item);
    } else {
      if (kind === 'gift' && this.queue.filter((q) => q.kind === 'gift').length >= 4) {
        const idx = this.queue.findIndex((q) => q.kind === 'gift');
        this.queue.splice(idx, 1);
      }
      this.queue.push(item);
    }
    if (!this.speaking) this._next();
  }
  _cancel() {
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (_) {}
    if (this.audio) { try { this.audio.pause(); } catch (_) {} this.audio = null; }
    this.speaking = false;
    this.current = null;
  }
  _chunks(text) {
    const parts = text.replace(/\s+/g, ' ').match(/[^.!?;:,]+[.!?;:,]*/g) || [text];
    const out = [];
    let buf = '';
    for (const p of parts) {
      if ((buf + p).length > 180) { if (buf) out.push(buf.trim()); buf = p; } else buf += p;
    }
    if (buf.trim()) out.push(buf.trim());
    return out.flatMap((s) => (s.length > 195 ? s.match(/.{1,190}(\s|$)/g) : [s]));
  }
  _next() {
    const item = this.queue.shift();
    if (!item) { this.speaking = false; this.current = null; this.music && this.music.duck(false); return; }
    this.speaking = true;
    this.current = item;
    this.music && this.music.duck(true);
    const chunks = this._chunks(item.text);
    const token = (this.token = Math.random());
    const done = () => { if (this.token === token) this._next(); };
    if (this.engine() === 'browser') this._speakBrowser(chunks, token, done);
    else this._speakGoogle(chunks, token, done);
  }
  _speakBrowser(chunks, token, done) {
    let i = 0;
    const step = () => {
      if (this.token !== token) return;
      if (i >= chunks.length) return done();
      const u = new SpeechSynthesisUtterance(chunks[i++]);
      u.lang = 'vi-VN';
      if (this.voice) u.voice = this.voice;
      u.rate = this.cfg.rate || 1;
      u.volume = this.cfg.volume ?? 1;
      u.onend = step;
      u.onerror = step;
      speechSynthesis.speak(u);
    };
    step();
  }
  _speakGoogle(chunks, token, done) {
    let i = 0;
    const step = () => {
      if (this.token !== token) return;
      if (i >= chunks.length) return done();
      const a = new Audio('/tts?q=' + encodeURIComponent(chunks[i++]));
      a.volume = Math.min(1, this.cfg.volume ?? 1);
      a.playbackRate = Math.min(1.5, Math.max(0.7, this.cfg.rate || 1));
      this.audio = a;
      a.onended = step;
      a.onerror = step;
      a.play().catch(step);
    };
    step();
  }
}

// ---------- Nhạc nền ----------
export class Music {
  constructor(holderId = 'yt') {
    this.holderId = holderId;
    this.cfg = { url: '', volume: 15, playing: false };
    this.ducked = false;
    this.audio = null;
    this.yt = null;
    this.ytReady = false;
    this.unlocked = false;
  }
  unlock() { this.unlocked = true; this.apply(true); }
  set(cfg) {
    const prevUrl = this.cfg.url, prevPlaying = this.cfg.playing;
    this.cfg = { ...this.cfg, ...cfg };
    this.apply(prevUrl !== this.cfg.url || prevPlaying !== this.cfg.playing);
  }
  vol() { return Math.max(0, Math.min(100, this.cfg.volume)) * (this.ducked ? 0.35 : 1); }
  duck(on) { this.ducked = on; this.applyVolume(); }
  applyVolume() {
    const v = this.vol();
    if (this.audio) this.audio.volume = v / 100;
    if (this.yt && this.ytReady && this.yt.setVolume) this.yt.setVolume(v);
  }
  stopAll() {
    if (this.audio) { this.audio.pause(); this.audio = null; }
    if (this.yt && this.ytReady) { try { this.yt.stopVideo(); } catch (_) {} }
  }
  parseYouTube(url) {
    try {
      const u = new URL(url);
      if (!/youtube\.com|youtu\.be/.test(u.hostname)) return null;
      let v = u.searchParams.get('v');
      if (!v && u.hostname.includes('youtu.be')) v = u.pathname.slice(1);
      if (!v && u.pathname.startsWith('/shorts/')) v = u.pathname.split('/')[2];
      if (!v && u.pathname.startsWith('/embed/')) v = u.pathname.split('/')[2];
      return { v, list: u.searchParams.get('list') };
    } catch (_) { return null; }
  }
  apply(changed) {
    const { url, playing } = this.cfg;
    if (!playing || !url) { this.stopAll(); return; }
    if (!this.unlocked) return;
    const yt = this.parseYouTube(url);
    if (yt) {
      if (this.audio) { this.audio.pause(); this.audio = null; }
      this.playYouTube(yt, changed);
    } else {
      if (this.yt && this.ytReady) { try { this.yt.stopVideo(); } catch (_) {} }
      if (!this.audio || changed || this.audio.dataset.src !== url) {
        if (this.audio) this.audio.pause();
        this.audio = new Audio(url);
        this.audio.dataset.src = url;
        this.audio.loop = true;
      }
      this.applyVolume();
      this.audio.play().catch((e) => console.warn('Không phát được nhạc:', e.message));
    }
  }
  playYouTube({ v, list }, changed) {
    const start = () => {
      if (!this.yt) {
        this.yt = new YT.Player(this.holderId, {
          width: '2', height: '2',
          videoId: v || undefined,
          playerVars: list ? { listType: 'playlist', list, autoplay: 1, controls: 0, loop: 1 } : { autoplay: 1, controls: 0, loop: 1, playlist: v },
          events: {
            onReady: () => { this.ytReady = true; this.applyVolume(); this.yt.playVideo(); },
            onStateChange: (e) => { if (e.data === YT.PlayerState.ENDED) { try { this.yt.playVideo(); } catch (_) {} } },
          },
        });
        this.ytKey = (v || '') + (list || '');
        return;
      }
      if (!this.ytReady) return;
      const key = (v || '') + (list || '');
      if (changed || key !== this.ytKey) {
        this.ytKey = key;
        if (list) this.yt.loadPlaylist({ listType: 'playlist', list });
        else this.yt.loadVideoById(v);
        try { this.yt.setLoop(true); } catch (_) {}
      } else this.yt.playVideo();
      this.applyVolume();
    };
    if (window.YT && window.YT.Player) return start();
    if (!this._ytLoading) {
      this._ytLoading = true;
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev && prev(); this.apply(true); };
    }
  }
}
