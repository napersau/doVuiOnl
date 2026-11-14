'use strict';
const { CATEGORIES, BANK } = require('./bank');
const gen = require('./generators');
const { shuffle, normalizeText } = require('../util');
const store = require('../store');

// Trọng số chủ đề: Toán được ưu tiên vì đúng chủ đề "học sinh lớp 5"
const CAT_WEIGHT = { toan: 3, dome: 1.3, custom: 2, tiengviet: 1.1, khoahoc: 1.1, dialy: 1.2, tienganh: 1.1 };

class QuestionManager {
  constructor() {
    this.static = {}; // cat -> [{id, text, correct, wrongs}]
    for (const [cat, list] of Object.entries(BANK)) {
      this.static[cat] = list.map((row, i) => ({ id: `${cat}:${i}`, text: row[0], correct: row[1], wrongs: row.slice(2, 5), category: cat }));
    }
    this.custom = store.load('custom', []);
    this.used = new Set(store.load('used', []));
    this.recentGen = []; // key câu sinh tự động gần đây
    this.recentGenSet = new Set();
    this.recentCats = [];
    this.enabled = Object.fromEntries(Object.keys(CATEGORIES).map((k) => [k, true]));
    this.served = 0;
  }

  setEnabled(map) {
    for (const k of Object.keys(this.enabled)) if (typeof map[k] === 'boolean') this.enabled[k] = map[k];
  }

  categoriesInfo() {
    return Object.entries(CATEGORIES).map(([key, label]) => {
      const list = key === 'custom' ? this.custom : this.static[key] || [];
      const used = list.filter((q) => this.used.has(q.id)).length;
      return { key, label, total: list.length, used, generator: gen.hasGenerator(key), enabled: this.enabled[key] };
    });
  }

  stats() {
    const staticTotal = Object.values(this.static).reduce((s, l) => s + l.length, 0) + this.custom.length;
    return { staticTotal, used: this.used.size, served: this.served, custom: this.custom.length };
  }

  resetHistory() {
    this.used.clear();
    this.recentGen = [];
    this.recentGenSet.clear();
    store.save('used', []);
  }

  // Định dạng nhập: "Câu hỏi | Đáp án A | Đáp án B | Đáp án C | Đáp án D | A"  (cột cuối là đáp án đúng)
  addCustom(text) {
    let added = 0;
    const errors = [];
    String(text || '').split(/\r?\n/).forEach((line, idx) => {
      const parts = line.split('|').map((s) => s.trim());
      if (parts.length < 6 || !parts[0]) { if (line.trim()) errors.push(idx + 1); return; }
      const letter = parts[5].toUpperCase().replace(/[^ABCD]/g, '');
      const ci = 'ABCD'.indexOf(letter);
      if (ci < 0) { errors.push(idx + 1); return; }
      const answers = parts.slice(1, 5);
      const correct = answers[ci];
      const wrongs = answers.filter((_, i) => i !== ci);
      this.custom.push({ id: `custom:${Date.now()}:${added}`, text: parts[0], correct, wrongs, category: 'custom' });
      added++;
    });
    store.save('custom', this.custom);
    return { added, errors };
  }

  clearCustom() {
    this.custom = [];
    store.save('custom', this.custom);
  }

  _pickCategory() {
    const cats = Object.keys(CATEGORIES).filter((c) => {
      if (!this.enabled[c]) return false;
      if (c === 'custom') return this.custom.length > 0;
      return true;
    });
    if (!cats.length) return 'toan';
    // tránh lặp chủ đề vừa ra (2 câu gần nhất; Toán chỉ tránh 1 câu)
    let pool = cats.filter((c) => (c === 'toan' ? this.recentCats[this.recentCats.length - 1] !== c : !this.recentCats.slice(-2).includes(c)));
    if (!pool.length) pool = cats;
    // Chủ đề không có bộ sinh tự động: càng ít câu chưa dùng thì càng ít được chọn
    const w = (c) => {
      const base = CAT_WEIGHT[c] || 1;
      if (gen.hasGenerator(c)) return base;
      const list = c === 'custom' ? this.custom : this.static[c] || [];
      const remain = list.filter((q) => !this.used.has(q.id)).length;
      return base * Math.max(0.02, remain / Math.max(1, list.length));
    };
    const weights = pool.map(w);
    const total = weights.reduce((s, x) => s + x, 0);
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }

  _fromStatic(cat) {
    const list = cat === 'custom' ? this.custom : this.static[cat] || [];
    if (!list.length) return null;
    let avail = list.filter((q) => !this.used.has(q.id));
    if (!avail.length) {
      if (gen.hasGenerator(cat)) return null; // để bộ sinh tự động lo
      // hết câu của chủ đề -> làm mới chủ đề đó
      list.forEach((q) => this.used.delete(q.id));
      avail = list;
    }
    const q = avail[Math.floor(Math.random() * avail.length)];
    this.used.add(q.id);
    store.save('used', [...this.used]);
    return q;
  }

  _fromGenerator(cat) {
    for (let i = 0; i < 12; i++) {
      const q = gen.generate(cat);
      if (!q) return null;
      const key = normalizeText(q.text + '|' + q.correct);
      if (this.recentGenSet.has(key)) continue;
      this.recentGen.push(key);
      this.recentGenSet.add(key);
      if (this.recentGen.length > 5000) this.recentGenSet.delete(this.recentGen.shift());
      return { id: 'gen:' + key, ...q };
    }
    return null;
  }

  next() {
    let q = null;
    for (let attempt = 0; attempt < 8 && !q; attempt++) {
      const cat = this._pickCategory();
      const list = cat === 'custom' ? this.custom : this.static[cat] || [];
      const remaining = list.filter((x) => !this.used.has(x.id)).length;
      const hasGen = gen.hasGenerator(cat);
      // Tỉ lệ dùng bộ sinh: toán 60%, chủ đề khác 25%, hoặc 100% nếu hết câu viết tay
      let useGen = false;
      if (hasGen) useGen = remaining === 0 || Math.random() < (cat === 'toan' ? 0.6 : 0.25);
      q = useGen ? this._fromGenerator(cat) || this._fromStatic(cat) : this._fromStatic(cat) || (hasGen && this._fromGenerator(cat));
      if (q) {
        this.recentCats.push(cat);
        if (this.recentCats.length > 3) this.recentCats.shift();
      }
    }
    if (!q) q = this._fromGenerator('toan');
    this.served++;
    const answers = shuffle([q.correct, ...q.wrongs]);
    return {
      id: q.id,
      text: q.text,
      answers,
      correct: answers.indexOf(q.correct),
      category: q.category,
      categoryLabel: CATEGORIES[q.category] || q.category,
    };
  }
}

module.exports = { QuestionManager, CATEGORIES };
