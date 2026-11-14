'use strict';
// Kết nối TikTok Live (thư viện tiktok-live-connector v2) và chuẩn hóa sự kiện
const EventEmitter = require('events');

let lib = null;
try {
  lib = require('tiktok-live-connector');
} catch (e) {
  console.warn('[tiktok] chưa cài tiktok-live-connector:', e.message);
}

const firstUrl = (img) => (img && (img.urlList?.[0] || img.url_list?.[0] || img.url?.[0])) || '';

function normUser(d) {
  const u = d.user || d;
  const id = u.uniqueId || u.displayId || u.userId || u.id || d.uniqueId || d.userId;
  return {
    id: id ? String(id) : null,
    nick: u.nickname || u.nickName || d.nickname || String(id || 'Ẩn danh'),
    avatar: d.profilePictureUrl || firstUrl(u.avatarThumb) || firstUrl(u.profilePicture) || '',
  };
}

class TikTokBridge extends EventEmitter {
  constructor() {
    super();
    this.conn = null;
    this.status = 'disconnected';
    this.message = '';
    this.uniqueId = '';
    this.viewers = 0;
    this.wantConnected = false;
    this.retryTimer = null;
    this.retryCount = 0;
  }

  info() {
    return { status: this.status, message: this.message, uniqueId: this.uniqueId, viewers: this.viewers, available: !!lib };
  }

  _set(status, message = '') {
    this.status = status;
    this.message = message;
    this.emit('status', this.info());
  }

  async connect(uniqueId, signApiKey) {
    if (!lib) return this._set('error', 'Chưa cài thư viện tiktok-live-connector');
    uniqueId = String(uniqueId || '').trim().replace(/^@/, '');
    if (!uniqueId) return this._set('error', 'Chưa nhập TikTok ID');
    await this.disconnect(true);
    this.uniqueId = uniqueId;
    this.signApiKey = signApiKey || '';
    this.wantConnected = true;
    this._doConnect();
  }

  async _doConnect() {
    clearTimeout(this.retryTimer);
    const Conn = lib.TikTokLiveConnection || lib.WebcastPushConnection;
    const opts = { processInitialData: false, enableExtendedGiftInfo: false, fetchRoomInfoOnConnect: false }; // tắt 2 lệnh HTTP phụ: chúng dùng route ký trả phí (Business plan)
    if (this.signApiKey) opts.signApiKey = this.signApiKey;
    if (this.signApiKey && lib.SignConfig) {
      try { lib.SignConfig.apiKey = this.signApiKey; } catch (_) {}
    }
    let conn;
    try {
      conn = new Conn(this.uniqueId, opts);
    } catch (e) {
      return this._set('error', 'Không tạo được kết nối: ' + e.message);
    }
    this.conn = conn;
    this._set('connecting', 'Đang kết nối @' + this.uniqueId + '...');
    this._bind(conn);
    try {
      const state = await conn.connect();
      if (this.conn !== conn) return;
      this.retryCount = 0;
      const roomId = state?.roomId || conn.roomId || '';
      this._set('connected', `Đã kết nối @${this.uniqueId}${roomId ? ' (room ' + roomId + ')' : ''}`);
    } catch (e) {
      if (this.conn !== conn) return;
      let msg = (e && (e.message || e.toString())) || 'Lỗi không xác định';
      if (/isn't online|offline/i.test(msg)) msg = 'Tài khoản @' + this.uniqueId + ' chưa phát live (hãy bấm phát live trên TikTok trước)';
      else if (/rate.?limit|429/i.test(msg)) msg = 'Bị giới hạn kết nối — thử lại sau ít phút hoặc nhập Euler API key';
      else if (/not found|user_not_found|19881007/i.test(msg)) msg = 'Không tìm thấy TikTok ID @' + this.uniqueId;
      this._set('error', 'Kết nối thất bại: ' + msg.slice(0, 200));
      this._scheduleRetry();
    }
  }

  _scheduleRetry() {
    if (!this.wantConnected) return;
    this.retryCount++;
    const delay = Math.min(60000, 10000 * this.retryCount);
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      if (this.wantConnected) this._doConnect();
    }, delay);
    this.message += ` — thử lại sau ${Math.round(delay / 1000)}s`;
    this.emit('status', this.info());
  }

  _bind(conn) {
    const mine = (fn) => (...a) => { if (this.conn === conn) { try { fn(...a); } catch (e) { console.warn('[tiktok] lỗi xử lý sự kiện', e.message); } } };

    conn.on('chat', mine((d) => {
      const u = normUser(d);
      const text = d.comment ?? d.content ?? '';
      if (u.id && text) this.emit('comment', { ...u, text: String(text) });
    }));

    conn.on('gift', mine((d) => {
      const u = normUser(d);
      if (!u.id) return;
      const gift = d.gift || d.giftDetails || {};
      const ext = d.extendedGiftInfo || {};
      const giftType = d.giftType ?? gift.type ?? gift.giftType ?? ext.type;
      const repeatEnd = d.repeatEnd === true || d.repeatEnd === 1;
      // Quà dạng combo (type 1): chỉ tính khi combo kết thúc
      if (giftType === 1 && !repeatEnd) return;
      const diamond = Number(d.diamondCount ?? gift.diamondCount ?? ext.diamond_count ?? ext.diamondCount ?? 1) || 1;
      const count = Number(d.repeatCount || d.comboCount || 1) || 1;
      this.emit('gift', {
        ...u,
        giftName: d.giftName || gift.name || gift.giftName || ext.name || 'Quà',
        giftPic: d.giftPictureUrl || firstUrl(gift.image) || firstUrl(gift.icon) || firstUrl(ext.image) || '',
        count,
        diamonds: diamond * count,
      });
    }));

    conn.on('member', mine((d) => {
      const u = normUser(d);
      if (u.id) this.emit('join', u);
    }));

    conn.on('like', mine((d) => {
      const u = normUser(d);
      if (u.id) this.emit('like', { ...u, count: Number(d.likeCount ?? d.count ?? 1) || 1 });
    }));

    conn.on('roomUser', mine((d) => {
      const n = Number(d.viewerCount ?? d.totalUser ?? d.total ?? 0);
      if (n && n !== this.viewers) { this.viewers = n; this.emit('viewers', n); }
    }));

    conn.on('follow', mine((d) => {
      const u = normUser(d);
      if (u.id) this.emit('follow', u);
    }));

    conn.on('share', mine((d) => {
      const u = normUser(d);
      if (u.id) this.emit('share', u);
    }));

    conn.on('streamEnd', mine(() => {
      this._set('disconnected', 'Phiên live đã kết thúc');
      this.wantConnected = false;
    }));

    conn.on('disconnected', mine(() => {
      if (!this.wantConnected) return this._set('disconnected', 'Đã ngắt kết nối');
      this._set('error', 'Mất kết nối');
      this._scheduleRetry();
    }));

    conn.on('error', mine((e) => {
      console.warn('[tiktok] error:', e?.exception?.message || e?.info || e?.message || String(e));
    }));
  }

  async disconnect(silent) {
    this.wantConnected = false;
    clearTimeout(this.retryTimer);
    const c = this.conn;
    this.conn = null;
    if (c) {
      try { await c.disconnect(); } catch (_) {}
    }
    if (!silent) this._set('disconnected', 'Đã ngắt kết nối');
  }
}

module.exports = { TikTokBridge };
