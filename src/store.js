'use strict';
// Lưu dữ liệu đơn giản ra file JSON (Render free: ổ đĩa tạm, mất khi deploy lại / khởi động lại — vẫn chạy bình thường)
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'data');
const timers = {};

function load(name, fallback) {
  try {
    const p = path.join(DIR, name + '.json');
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.warn('[store] không đọc được', name, e.message);
  }
  return fallback;
}

function save(name, data, delay = 1500) {
  clearTimeout(timers[name]);
  timers[name] = setTimeout(() => {
    try {
      if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(path.join(DIR, name + '.json'), JSON.stringify(data));
    } catch (e) {
      console.warn('[store] không ghi được', name, e.message);
    }
  }, delay);
}

module.exports = { load, save };
