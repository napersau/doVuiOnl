'use strict';
// Bộ sinh câu hỏi tự động -> gần như vô hạn câu hỏi, live nhiều giờ không trùng.
const { rand, pick, shuffle } = require('../util');

// ---------- Tiện ích số ----------
function fmt(n) {
  const neg = n < 0;
  n = Math.abs(Math.round(n * 1000) / 1000);
  let [i, d] = n.toString().split('.');
  i = i.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + i + (d ? ',' + d : '');
}
const r2 = (x) => Math.round(x * 100) / 100;

// Tạo 3 đáp án sai khác nhau, khác đáp án đúng
function finalize(correct, candidates, fallback) {
  const out = [];
  const seen = new Set([correct]);
  for (const c of candidates) {
    if (c == null) continue;
    const s = String(c);
    if (!seen.has(s)) { seen.add(s); out.push(s); }
    if (out.length === 3) break;
  }
  let guard = 0;
  while (out.length < 3 && guard++ < 60) {
    const s = String(fallback());
    if (!seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out.slice(0, 3);
}

function numQ(text, ans, deltas, unit = '', opts = {}) {
  const u = unit ? ' ' + unit : '';
  const correct = fmt(ans) + u;
  const cands = shuffle(deltas)
    .map((d) => ans + d)
    .filter((v) => opts.allowNeg || v >= 0)
    .map((v) => fmt(opts.decimals ? r2(v) : v) + u);
  const wrongs = finalize(correct, cands, () => fmt(Math.max(0, ans + rand(-15, 15) || 1)) + u);
  return { text, correct, wrongs };
}

// ---------- TOÁN ----------
const math = {
  add() {
    const a = rand(120, 9800), b = rand(100, 9800);
    return numQ(`${fmt(a)} + ${fmt(b)} = ?`, a + b, [10, -10, 100, -100, 1, -1, 1000, 20]);
  },
  sub() {
    const a = rand(800, 9999), b = rand(100, a - 50);
    return numQ(`${fmt(a)} – ${fmt(b)} = ?`, a - b, [10, -10, 100, -100, 1, -1, 20]);
  },
  mul() {
    let a, b;
    if (Math.random() < 0.5) { a = rand(12, 99); b = rand(3, 9); } else { a = rand(11, 25); b = rand(11, 25); }
    return numQ(`${a} × ${b} = ?`, a * b, [a, -a, b, -b, 10, -10, 2]);
  },
  div() {
    const b = rand(3, 12), q = rand(12, 99);
    return numQ(`${fmt(b * q)} : ${b} = ?`, q, [1, -1, 2, -2, 10, -10]);
  },
  table() {
    const a = rand(6, 9), b = rand(6, 9);
    return numQ(`Tính nhanh: ${a} × ${b} = ?`, a * b, [a, -a, b, -b, 1, -1, 2, -2]);
  },
  order() {
    const t = rand(0, 3);
    const a = rand(2, 20), b = rand(2, 12), c = rand(2, 9);
    if (t === 0) return { ...numQ(`${a} + ${b} × ${c} = ?`, a + b * c, [1, -1, 10, -2]), wrongsFirst: [fmt((a + b) * c)] };
    if (t === 1) {
      const x = a * b, y = rand(1, Math.max(1, x - 1));
      return { ...numQ(`${a} × ${b} – ${y} = ?`, x - y, [1, -1, 10, -10, b]) };
    }
    if (t === 2) return { ...numQ(`(${a} + ${b}) × ${c} = ?`, (a + b) * c, [c, -c, 1, -1]), wrongsFirst: [fmt(a + b * c)] };
    const q = rand(2, 12), d = rand(2, 9), big = q * d + rand(20, 90);
    return { ...numQ(`${big} – ${q * d} : ${d} = ?`, big - q, [1, -1, 10, -10]), wrongsFirst: [fmt((big - q * d) / d)] };
  },
  decAdd() {
    const x = rand(11, 999) / (Math.random() < 0.5 ? 10 : 100), y = rand(11, 999) / (Math.random() < 0.5 ? 10 : 100);
    return numQ(`${fmt(x)} + ${fmt(y)} = ?`, r2(x + y), [0.1, -0.1, 1, -1, 0.01, 10], '', { decimals: true });
  },
  decSub() {
    let x = rand(101, 999) / 10, y = rand(11, 999) / 100;
    if (y > x) [x, y] = [y, x];
    return numQ(`${fmt(x)} – ${fmt(y)} = ?`, r2(x - y), [0.1, -0.1, 1, -1, 0.01, 10], '', { decimals: true });
  },
  decMul() {
    const x = rand(11, 99) / 10, k = pick([10, 100, 1000]);
    return numQ(`${fmt(x)} × ${fmt(k)} = ?`, r2(x * k), [x * k * 9, -x * k * 0.9, x * k * 99, x - x * k], '', { decimals: true });
  },
  percent() {
    const p = pick([10, 20, 25, 50, 75, 5, 15, 40, 30]);
    const step = 100 / gcd(p, 100);
    const n = step * rand(2, Math.max(3, Math.floor(400 / step)));
    return numQ(`${p}% của ${fmt(n)} là bao nhiêu?`, (p * n) / 100, [n / 10, -n / 20, 5, -5, 10, p]);
  },
  fracOf() {
    const [num, den] = pick([[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5]]);
    const n = den * rand(2, 20);
    return numQ(`${num}/${den} của ${n} là bao nhiêu?`, (n / den) * num, [n / den, -1, 1, num, den, n / den * (num + 1)]);
  },
  rectArea() {
    const l = rand(5, 30), w = rand(2, l - 1);
    const q = numQ(`Hình chữ nhật dài ${l} m, rộng ${w} m. Diện tích là bao nhiêu?`, l * w, [l, -l, w, -w], 'm²');
    q.wrongsFirst = [fmt(2 * (l + w)) + ' m²'];
    return q;
  },
  rectPerim() {
    const l = rand(5, 30), w = rand(2, l - 1);
    const q = numQ(`Hình chữ nhật dài ${l} cm, rộng ${w} cm. Chu vi là bao nhiêu?`, 2 * (l + w), [2, -2, 4, -4], 'cm');
    q.wrongsFirst = [fmt(l + w) + ' cm', fmt(l * w) + ' cm'];
    return q;
  },
  square() {
    const a = rand(3, 25);
    if (Math.random() < 0.5) {
      const q = numQ(`Hình vuông cạnh ${a} cm có diện tích là bao nhiêu?`, a * a, [a, -a, 1, -1], 'cm²');
      q.wrongsFirst = [fmt(a * 4) + ' cm²'];
      return q;
    }
    const q = numQ(`Hình vuông cạnh ${a} m có chu vi là bao nhiêu?`, a * 4, [a, -a, 2, -2], 'm');
    q.wrongsFirst = [fmt(a * a) + ' m'];
    return q;
  },
  triArea() {
    let b = rand(4, 30), h = rand(3, 20);
    if ((b * h) % 2) b++;
    const q = numQ(`Tam giác có đáy ${b} cm, chiều cao ${h} cm. Diện tích là bao nhiêu?`, (b * h) / 2, [h, -h, 2, -2], 'cm²');
    q.wrongsFirst = [fmt(b * h) + ' cm²'];
    return q;
  },
  circle() {
    const r = rand(1, 10);
    if (Math.random() < 0.5) {
      const ans = r2(r * 2 * 3.14);
      const q = numQ(`Hình tròn bán kính ${r} cm có chu vi là bao nhiêu?`, ans, [3.14, -3.14, 6.28, 1], 'cm', { decimals: true });
      q.wrongsFirst = [fmt(r2(r * 3.14)) + ' cm', fmt(r2(r * r * 3.14)) + ' cm'];
      return q;
    }
    const ans = r2(r * r * 3.14);
    const q = numQ(`Hình tròn bán kính ${r} cm có diện tích là bao nhiêu?`, ans, [3.14, -3.14, 6.28, 1], 'cm²', { decimals: true });
    q.wrongsFirst = [fmt(r2(r * 2 * 3.14)) + ' cm²', fmt(r2(r * 3.14)) + ' cm²'];
    return q;
  },
  boxVolume() {
    const a = rand(2, 12), b = rand(2, 12), c = rand(2, 10);
    const q = numQ(`Hình hộp chữ nhật có kích thước ${a} cm × ${b} cm × ${c} cm. Thể tích là?`, a * b * c, [a * b, -a * b, c, 10], 'cm³');
    q.wrongsFirst = [fmt(a + b + c) + ' cm³'];
    return q;
  },
  convert() {
    const t = rand(0, 7);
    if (t === 0) { const x = rand(11, 99) / 10; return numQ(`${fmt(x)} km = ? m`, r2(x * 1000), [x * 100 - x * 1000, x * 10000 - x * 1000, 10, -100], ''); }
    if (t === 1) { const x = rand(11, 99) / 10; return numQ(`${fmt(x)} kg = ? g`, r2(x * 1000), [x * 100 - x * 1000, x * 10000 - x * 1000, 100, -10], ''); }
    if (t === 2) {
      const h = rand(1, 4), m = rand(1, 11) * 5;
      const q = numQ(`${h} giờ ${m} phút = ? phút`, h * 60 + m, [10, -10, 60, -60], '');
      q.wrongsFirst = [fmt(h * 100 + m), fmt(h * 10 + m)];
      return q;
    }
    if (t === 3) { const x = rand(11, 99) / 10; return numQ(`${fmt(x)} tấn = ? kg`, r2(x * 1000), [-x * 900, x * 9000, 100, -10], ''); }
    if (t === 4) { const x = rand(101, 999) / 100; return numQ(`${fmt(x)} m = ? cm`, Math.round(x * 100), [x * 1000 - x * 100, -x * 90, 10, -1], ''); }
    if (t === 5) { const x = rand(2, 50); return numQ(`${x} m² = ? dm²`, x * 100, [-x * 90, x * 900, x * 9900, 10], ''); }
    if (t === 6) { const m = rand(2, 15); return numQ(`${m} phút = ? giây`, m * 60, [-m * 50, 60, -60, m * 40], ''); }
    const x = rand(2, 9); return numQ(`${x} thế kỷ = ? năm`, x * 100, [-x * 90, x * 900, 10, -10], '');
  },
  speed() {
    const v = rand(3, 12) * 5, t = rand(2, 5);
    if (Math.random() < 0.5) {
      const q = numQ(`Một ô tô đi với vận tốc ${v} km/giờ trong ${t} giờ. Quãng đường đi được là?`, v * t, [v, -v, 10, -10], 'km');
      q.wrongsFirst = [fmt(v + t) + ' km'];
      return q;
    }
    const q = numQ(`Một người đi ${v * t} km hết ${t} giờ. Vận tốc trung bình là?`, v, [5, -5, 10, t], 'km/giờ');
    q.wrongsFirst = [fmt(v * t * t) + ' km/giờ'];
    return q;
  },
  average() {
    const n = rand(3, 4), m = rand(12, 90);
    const nums = [];
    let sum = 0;
    for (let i = 0; i < n - 1; i++) { const x = Math.max(1, m + rand(-10, 10)); nums.push(x); sum += x; }
    const last = m * n - sum;
    if (last <= 0) return math.add();
    nums.push(last);
    const q = numQ(`Trung bình cộng của ${nums.join('; ')} là?`, m, [1, -1, 2, -2, 5]);
    q.wrongsFirst = [fmt(m * n)];
    return q;
  },
  findX() {
    const t = rand(0, 3), a = rand(3, 99), x = rand(2, 99);
    if (t === 0) return numQ(`Tìm x: x + ${a} = ${x + a}`, x, [a, 1, -1, 10, -10]);
    if (t === 1) { const k = rand(2, 9); return numQ(`Tìm x: x × ${k} = ${x * k}`, x, [k, 1, -1, 10, -10]); }
    if (t === 2) return numQ(`Tìm x: x – ${a} = ${x}`, x + a, [-2 * a, 1, -1, 10, -10]);
    const k = rand(2, 9); return numQ(`Tìm x: x : ${k} = ${x}`, x * k, [k, -k, 1, -1, 10]);
  },
  sequence() {
    const t = rand(0, 3);
    if (t === 0) {
      const s = rand(1, 30), d = rand(2, 12);
      const arr = [0, 1, 2, 3].map((i) => s + i * d);
      return numQ(`Số tiếp theo của dãy: ${arr.join(', ')}, … ?`, s + 4 * d, [d, -d, 1, -1, 2]);
    }
    if (t === 1) {
      const s = rand(1, 5), k = pick([2, 3]);
      const arr = [0, 1, 2, 3].map((i) => s * k ** i);
      return numQ(`Số tiếp theo của dãy: ${arr.join(', ')}, … ?`, s * k ** 4, [s * k ** 3, -s * k ** 3 + s * k ** 2, k, -k, 1]);
    }
    if (t === 2) {
      const s = rand(1, 6);
      const arr = [0, 1, 2, 3].map((i) => (s + i) ** 2);
      return numQ(`Số tiếp theo của dãy: ${arr.join(', ')}, … ?`, (s + 4) ** 2, [1, -1, 2, s + 4, -(s + 4)]);
    }
    const s = rand(40, 99), d = rand(2, 9);
    const arr = [0, 1, 2, 3].map((i) => s - i * d);
    return numQ(`Số tiếp theo của dãy: ${arr.join(', ')}, … ?`, s - 4 * d, [d, -d, 1, -1]);
  },
  compareDec() {
    const a = rand(0, 9);
    const set = new Set();
    let guard = 0;
    while (set.size < 4 && guard++ < 50) {
      const digits = rand(1, 3);
      const frac = rand(1, 10 ** digits - 1);
      const v = a + frac / 10 ** digits;
      set.add(Math.round(v * 1000) / 1000);
    }
    const vals = [...set];
    if (vals.length < 4) return math.add();
    const max = Math.random() < 0.6;
    const ans = max ? Math.max(...vals) : Math.min(...vals);
    return {
      text: `Số ${max ? 'LỚN nhất' : 'BÉ nhất'} trong các số sau là số nào?`,
      correct: fmt(ans),
      wrongs: vals.filter((v) => v !== ans).map(fmt),
    };
  },
  weekday() {
    const days = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const s = rand(0, 6), n = rand(3, 45);
    const ans = days[(s + n) % 7];
    return { text: `Hôm nay là ${days[s]}. Hỏi ${n} ngày nữa là thứ mấy?`, correct: ans, wrongs: shuffle(days.filter((d) => d !== ans)).slice(0, 3) };
  },
  roman() {
    const n = rand(4, 99);
    if (Math.random() < 0.5) {
      return numQ(`Số La Mã “${toRoman(n)}” là số mấy?`, n, [1, -1, 10, -10, 5, -5, 9]);
    }
    const correct = toRoman(n);
    const wrongs = finalize(correct, shuffle([n + 1, n - 1, n + 10, n - 10, n + 5, n + 9].filter((x) => x > 0)).map(toRoman), () => toRoman(rand(1, 99)));
    return { text: `Số ${n} viết bằng chữ số La Mã là?`, correct, wrongs };
  },
  clock() {
    const h = rand(6, 19), m = rand(0, 11) * 5, add = rand(3, 19) * 5;
    const tot = h * 60 + m + add;
    const f = (t) => `${Math.floor(t / 60) % 24} giờ ${String(t % 60).padStart(2, '0')}`;
    const correct = f(tot);
    const wrongs = finalize(correct, shuffle([tot + 10, tot - 10, tot + 60, tot - 60, tot + 5]).map(f), () => f(tot + rand(-90, 90)));
    return { text: `Bây giờ là ${f(h * 60 + m)}. Hỏi ${add} phút nữa là mấy giờ?`, correct, wrongs };
  },
  age() {
    const mom = rand(26, 45), child = rand(3, 15), k = rand(3, 12);
    const d = mom - child;
    const q = numQ(`Năm nay mẹ ${mom} tuổi, con ${child} tuổi. Hỏi ${k} năm nữa mẹ hơn con bao nhiêu tuổi?`, d, [k, -k, 1, -1, 2 * k], 'tuổi');
    return q;
  },
  money() {
    const n = rand(2, 12), p = rand(3, 25);
    return numQ(`Mua ${n} quyển vở, mỗi quyển giá ${p}.000 đồng. Hết bao nhiêu tiền?`, n * p * 1000, [p * 1000, -p * 1000, 1000, -1000, 10000], 'đồng');
  },
  logic() {
    const n = rand(5, 30), gap = rand(2, 5);
    // Trồng cây 2 đầu: số khoảng cách
    return numQ(`Trồng ${n} cây thẳng hàng, 2 cây liền nhau cách ${gap} m. Cây đầu cách cây cuối bao nhiêu mét?`, (n - 1) * gap, [gap, -gap, 1, 2 * gap], 'm');
  },
};

function gcd(a, b) { return b ? gcd(b, a % b) : a; }
function toRoman(num) {
  const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [v, r] of map) while (num >= v) { s += r; num -= v; }
  return s;
}

// ---------- DỮ LIỆU ----------
// [Nước, Thủ đô, Châu lục (null = bỏ qua)]
const COUNTRIES = [
  ['Pháp', 'Paris', 'Châu Âu'], ['Anh', 'Luân Đôn (London)', 'Châu Âu'], ['Đức', 'Berlin', 'Châu Âu'],
  ['Ý', 'Rome', 'Châu Âu'], ['Tây Ban Nha', 'Madrid', 'Châu Âu'], ['Bồ Đào Nha', 'Lisbon', 'Châu Âu'],
  ['Hà Lan', 'Amsterdam', 'Châu Âu'], ['Bỉ', 'Brussels', 'Châu Âu'], ['Thụy Sĩ', 'Bern', 'Châu Âu'],
  ['Áo', 'Viên (Vienna)', 'Châu Âu'], ['Nga', 'Mát-xcơ-va', null], ['Ba Lan', 'Vác-sa-va', 'Châu Âu'],
  ['Hy Lạp', 'Athens', 'Châu Âu'], ['Thụy Điển', 'Stockholm', 'Châu Âu'], ['Na Uy', 'Oslo', 'Châu Âu'],
  ['Đan Mạch', 'Copenhagen', 'Châu Âu'], ['Phần Lan', 'Helsinki', 'Châu Âu'], ['Ireland', 'Dublin', 'Châu Âu'],
  ['Cộng hòa Séc', 'Praha', 'Châu Âu'], ['Hungary', 'Budapest', 'Châu Âu'], ['Nhật Bản', 'Tokyo', 'Châu Á'],
  ['Hàn Quốc', 'Seoul', 'Châu Á'], ['Trung Quốc', 'Bắc Kinh', 'Châu Á'], ['Thái Lan', 'Bangkok', 'Châu Á'],
  ['Lào', 'Viêng Chăn', 'Châu Á'], ['Campuchia', 'Phnôm Pênh', 'Châu Á'], ['Malaysia', 'Kuala Lumpur', 'Châu Á'],
  ['Philippines', 'Manila', 'Châu Á'], ['Myanmar', 'Nay Pyi Taw', 'Châu Á'], ['Ấn Độ', 'New Delhi', 'Châu Á'],
  ['Pakistan', 'Islamabad', 'Châu Á'], ['Bangladesh', 'Dhaka', 'Châu Á'], ['Nepal', 'Kathmandu', 'Châu Á'],
  ['Mông Cổ', 'Ulaanbaatar', 'Châu Á'], ['Triều Tiên', 'Bình Nhưỡng', 'Châu Á'], ['Iran', 'Tehran', 'Châu Á'],
  ['Iraq', 'Baghdad', 'Châu Á'], ['Ả Rập Xê Út', 'Riyadh', 'Châu Á'], ['Thổ Nhĩ Kỳ', 'Ankara', null],
  ['Ai Cập', 'Cairo', 'Châu Phi'], ['Kenya', 'Nairobi', 'Châu Phi'], ['Nigeria', 'Abuja', 'Châu Phi'],
  ['Ethiopia', 'Addis Ababa', 'Châu Phi'], ['Maroc', 'Rabat', 'Châu Phi'], ['Mỹ', 'Washington D.C.', 'Châu Mỹ'],
  ['Canada', 'Ottawa', 'Châu Mỹ'], ['Mexico', 'Mexico City', 'Châu Mỹ'], ['Brazil', 'Brasília', 'Châu Mỹ'],
  ['Argentina', 'Buenos Aires', 'Châu Mỹ'], ['Chile', 'Santiago', 'Châu Mỹ'], ['Peru', 'Lima', 'Châu Mỹ'],
  ['Colombia', 'Bogotá', 'Châu Mỹ'], ['Cuba', 'La Habana', 'Châu Mỹ'], ['Úc', 'Canberra', 'Châu Đại Dương'],
  ['New Zealand', 'Wellington', 'Châu Đại Dương'], ['Việt Nam', 'Hà Nội', 'Châu Á'], ['Đông Timor', 'Dili', 'Châu Á'],
  ['Brunei', 'Bandar Seri Begawan', 'Châu Á'], ['Afghanistan', 'Kabul', 'Châu Á'], ['Ghana', 'Accra', 'Châu Phi'],
];
const CONTINENTS = ['Châu Á', 'Châu Âu', 'Châu Phi', 'Châu Mỹ', 'Châu Đại Dương'];

// [English, Tiếng Việt, nhóm]
const WORDS = [
  ['Apple', 'Quả táo', 'food'], ['Banana', 'Quả chuối', 'food'], ['Mango', 'Quả xoài', 'food'], ['Grapes', 'Quả nho', 'food'],
  ['Watermelon', 'Dưa hấu', 'food'], ['Rice', 'Cơm, gạo', 'food'], ['Bread', 'Bánh mì', 'food'], ['Egg', 'Quả trứng', 'food'],
  ['Milk', 'Sữa', 'food'], ['Water', 'Nước', 'food'], ['Candy', 'Kẹo', 'food'], ['Noodles', 'Mì, bún', 'food'],
  ['Cat', 'Con mèo', 'animal'], ['Dog', 'Con chó', 'animal'], ['Bird', 'Con chim', 'animal'], ['Fish', 'Con cá', 'animal'],
  ['Elephant', 'Con voi', 'animal'], ['Tiger', 'Con hổ', 'animal'], ['Lion', 'Con sư tử', 'animal'], ['Monkey', 'Con khỉ', 'animal'],
  ['Rabbit', 'Con thỏ', 'animal'], ['Horse', 'Con ngựa', 'animal'], ['Cow', 'Con bò', 'animal'], ['Pig', 'Con heo', 'animal'],
  ['Chicken', 'Con gà', 'animal'], ['Duck', 'Con vịt', 'animal'], ['Snake', 'Con rắn', 'animal'], ['Bear', 'Con gấu', 'animal'],
  ['Butterfly', 'Con bướm', 'animal'], ['Turtle', 'Con rùa', 'animal'], ['Frog', 'Con ếch', 'animal'], ['Mouse', 'Con chuột', 'animal'],
  ['House', 'Ngôi nhà', 'place'], ['School', 'Trường học', 'place'], ['Hospital', 'Bệnh viện', 'place'], ['Kitchen', 'Nhà bếp', 'place'],
  ['Bedroom', 'Phòng ngủ', 'place'], ['Market', 'Chợ', 'place'], ['Park', 'Công viên', 'place'], ['Library', 'Thư viện', 'place'],
  ['Book', 'Quyển sách', 'thing'], ['Pen', 'Cây bút', 'thing'], ['Pencil', 'Bút chì', 'thing'], ['Ruler', 'Thước kẻ', 'thing'],
  ['Eraser', 'Cục tẩy', 'thing'], ['Table', 'Cái bàn', 'thing'], ['Chair', 'Cái ghế', 'thing'], ['Door', 'Cánh cửa', 'thing'],
  ['Window', 'Cửa sổ', 'thing'], ['Umbrella', 'Cái ô (dù)', 'thing'], ['Clock', 'Đồng hồ', 'thing'], ['Computer', 'Máy tính', 'thing'],
  ['Kite', 'Con diều', 'thing'], ['Ball', 'Quả bóng', 'thing'], ['Doll', 'Búp bê', 'thing'], ['Shoes', 'Đôi giày', 'thing'],
  ['Hat', 'Cái mũ', 'thing'], ['Bag', 'Cái cặp, túi', 'thing'], ['Sun', 'Mặt trời', 'nature'], ['Moon', 'Mặt trăng', 'nature'],
  ['Star', 'Ngôi sao', 'nature'], ['Rain', 'Mưa', 'nature'], ['Cloud', 'Đám mây', 'nature'], ['Tree', 'Cái cây', 'nature'],
  ['Flower', 'Bông hoa', 'nature'], ['River', 'Dòng sông', 'nature'], ['Mountain', 'Ngọn núi', 'nature'], ['Sea', 'Biển', 'nature'],
  ['Red', 'Màu đỏ', 'color'], ['Blue', 'Màu xanh dương', 'color'], ['Green', 'Màu xanh lá', 'color'], ['Yellow', 'Màu vàng', 'color'],
  ['Black', 'Màu đen', 'color'], ['White', 'Màu trắng', 'color'], ['Pink', 'Màu hồng', 'color'], ['Purple', 'Màu tím', 'color'],
  ['Brown', 'Màu nâu', 'color'], ['Gray', 'Màu xám', 'color'], ['Father', 'Bố', 'family'], ['Mother', 'Mẹ', 'family'],
  ['Brother', 'Anh/em trai', 'family'], ['Sister', 'Chị/em gái', 'family'], ['Grandmother', 'Bà', 'family'], ['Grandfather', 'Ông', 'family'],
  ['Friend', 'Bạn bè', 'family'], ['Teacher', 'Giáo viên', 'job'], ['Student', 'Học sinh', 'job'], ['Doctor', 'Bác sĩ', 'job'],
  ['Nurse', 'Y tá', 'job'], ['Farmer', 'Nông dân', 'job'], ['Driver', 'Tài xế', 'job'], ['Singer', 'Ca sĩ', 'job'],
  ['Police officer', 'Cảnh sát', 'job'], ['Cook', 'Đầu bếp', 'job'], ['Happy', 'Vui vẻ', 'adj'], ['Sad', 'Buồn', 'adj'],
  ['Big', 'To lớn', 'adj'], ['Small', 'Nhỏ bé', 'adj'], ['Tall', 'Cao', 'adj'], ['Hot', 'Nóng', 'adj'], ['Cold', 'Lạnh', 'adj'],
  ['Fast', 'Nhanh', 'adj'], ['Slow', 'Chậm', 'adj'], ['Beautiful', 'Xinh đẹp', 'adj'], ['Hungry', 'Đói bụng', 'adj'], ['Tired', 'Mệt mỏi', 'adj'],
  ['Head', 'Cái đầu', 'body'], ['Hand', 'Bàn tay', 'body'], ['Foot', 'Bàn chân', 'body'], ['Eye', 'Con mắt', 'body'],
  ['Ear', 'Cái tai', 'body'], ['Nose', 'Cái mũi', 'body'], ['Mouth', 'Cái miệng', 'body'], ['Hair', 'Mái tóc', 'body'],
  ['Car', 'Ô tô', 'vehicle'], ['Bicycle', 'Xe đạp', 'vehicle'], ['Airplane', 'Máy bay', 'vehicle'], ['Train', 'Tàu hỏa', 'vehicle'],
  ['Boat', 'Con thuyền', 'vehicle'], ['Bus', 'Xe buýt', 'vehicle'], ['Motorbike', 'Xe máy', 'vehicle'], ['Monday', 'Thứ Hai', 'day'],
  ['Tuesday', 'Thứ Ba', 'day'], ['Wednesday', 'Thứ Tư', 'day'], ['Thursday', 'Thứ Năm', 'day'], ['Friday', 'Thứ Sáu', 'day'],
  ['Saturday', 'Thứ Bảy', 'day'], ['Sunday', 'Chủ nhật', 'day'], ['Spring', 'Mùa xuân', 'season'], ['Summer', 'Mùa hè', 'season'],
  ['Autumn', 'Mùa thu', 'season'], ['Winter', 'Mùa đông', 'season'], ['Run', 'Chạy', 'verb'], ['Swim', 'Bơi', 'verb'],
  ['Sing', 'Hát', 'verb'], ['Dance', 'Nhảy múa', 'verb'], ['Read', 'Đọc', 'verb'], ['Write', 'Viết', 'verb'], ['Sleep', 'Ngủ', 'verb'],
  ['Cook', 'Nấu ăn', 'verb'], ['Draw', 'Vẽ', 'verb'], ['Jump', 'Nhảy', 'verb'], ['Fly', 'Bay', 'verb'], ['Listen', 'Nghe', 'verb'],
];

const ELEMENTS = [
  ['Sắt', 'Fe'], ['Vàng', 'Au'], ['Bạc', 'Ag'], ['Đồng', 'Cu'], ['Nhôm', 'Al'], ['Oxy', 'O'], ['Hiđro', 'H'], ['Cacbon', 'C'],
  ['Nitơ', 'N'], ['Natri', 'Na'], ['Kali', 'K'], ['Canxi', 'Ca'], ['Kẽm', 'Zn'], ['Chì', 'Pb'], ['Thủy ngân', 'Hg'],
  ['Lưu huỳnh', 'S'], ['Clo', 'Cl'], ['Heli', 'He'], ['Magie', 'Mg'], ['Thiếc', 'Sn'], ['Photpho', 'P'], ['Iốt', 'I'], ['Silic', 'Si'],
];

const ANTONYMS = [
  ['cao', 'thấp'], ['nóng', 'lạnh'], ['nhanh', 'chậm'], ['ngày', 'đêm'], ['sáng', 'tối'], ['đen', 'trắng'], ['già', 'trẻ'],
  ['dài', 'ngắn'], ['béo', 'gầy'], ['giàu', 'nghèo'], ['vui', 'buồn'], ['trên', 'dưới'], ['trong', 'ngoài'], ['đầu', 'cuối'],
  ['mở', 'đóng'], ['khóc', 'cười'], ['thắng', 'thua'], ['sạch', 'bẩn'], ['mới', 'cũ'], ['nặng', 'nhẹ'], ['xa', 'gần'],
  ['rộng', 'hẹp'], ['dày', 'mỏng'], ['cứng', 'mềm'], ['ngọt', 'đắng'], ['khô', 'ướt'], ['đúng', 'sai'], ['mạnh', 'yếu'],
  ['chăm chỉ', 'lười biếng'], ['dũng cảm', 'hèn nhát'], ['trung thực', 'gian dối'], ['ồn ào', 'yên tĩnh'], ['đông đúc', 'vắng vẻ'],
  ['sớm', 'muộn'], ['mua', 'bán'], ['vào', 'ra'], ['lên', 'xuống'], ['to', 'nhỏ'], ['đẹp', 'xấu'], ['thông minh', 'ngốc nghếch'],
];

// [Nước, Đơn vị tiền tệ]
const CURRENCY = [
  ['Nhật Bản', 'Yên'], ['Hàn Quốc', 'Won'], ['Trung Quốc', 'Nhân dân tệ'], ['Mỹ', 'Đô la Mỹ'], ['Anh', 'Bảng Anh'],
  ['Thái Lan', 'Baht'], ['Ấn Độ', 'Rupee'], ['Nga', 'Rúp'], ['Úc', 'Đô la Úc'], ['Canada', 'Đô la Canada'],
  ['Pháp', 'Euro'], ['Đức', 'Euro'], ['Ý', 'Euro'], ['Thụy Sĩ', 'Franc Thụy Sĩ'], ['Brazil', 'Real'],
  ['Việt Nam', 'Đồng'], ['Malaysia', 'Ringgit'], ['Indonesia', 'Rupiah'], ['Singapore', 'Đô la Singapore'],
  ['Campuchia', 'Riel'], ['Lào', 'Kíp'], ['Thổ Nhĩ Kỳ', 'Lira'], ['Mexico', 'Peso Mexico'],
];
// [Nước, Ngôn ngữ chính thức]
const LANGUAGES = [
  ['Pháp', 'Tiếng Pháp'], ['Đức', 'Tiếng Đức'], ['Ý', 'Tiếng Ý'], ['Tây Ban Nha', 'Tiếng Tây Ban Nha'],
  ['Bồ Đào Nha', 'Tiếng Bồ Đào Nha'], ['Brazil', 'Tiếng Bồ Đào Nha'], ['Nga', 'Tiếng Nga'], ['Nhật Bản', 'Tiếng Nhật'],
  ['Hàn Quốc', 'Tiếng Hàn'], ['Thái Lan', 'Tiếng Thái'], ['Lào', 'Tiếng Lào'], ['Campuchia', 'Tiếng Khmer'],
  ['Hà Lan', 'Tiếng Hà Lan'], ['Hy Lạp', 'Tiếng Hy Lạp'], ['Thổ Nhĩ Kỳ', 'Tiếng Thổ Nhĩ Kỳ'], ['Ba Lan', 'Tiếng Ba Lan'],
  ['Trung Quốc', 'Tiếng Trung'], ['Ai Cập', 'Tiếng Ả Rập'], ['Indonesia', 'Tiếng Indonesia'], ['Việt Nam', 'Tiếng Việt'],
];
// [Động từ, Quá khứ đơn]
const IRREGULAR = [
  ['go', 'went'], ['see', 'saw'], ['eat', 'ate'], ['have', 'had'], ['buy', 'bought'], ['write', 'wrote'], ['run', 'ran'],
  ['take', 'took'], ['make', 'made'], ['come', 'came'], ['drink', 'drank'], ['sing', 'sang'], ['swim', 'swam'], ['give', 'gave'],
  ['know', 'knew'], ['think', 'thought'], ['teach', 'taught'], ['catch', 'caught'], ['sleep', 'slept'], ['fly', 'flew'],
  ['draw', 'drew'], ['sit', 'sat'], ['stand', 'stood'], ['speak', 'spoke'], ['drive', 'drove'], ['ride', 'rode'],
  ['find', 'found'], ['get', 'got'], ['tell', 'told'], ['begin', 'began'],
];
// [Số ít, Số nhiều]
const PLURALS = [
  ['child', 'children'], ['man', 'men'], ['woman', 'women'], ['foot', 'feet'], ['tooth', 'teeth'], ['mouse', 'mice'],
  ['goose', 'geese'], ['person', 'people'], ['box', 'boxes'], ['bus', 'buses'], ['watch', 'watches'], ['city', 'cities'],
  ['baby', 'babies'], ['leaf', 'leaves'], ['knife', 'knives'], ['wolf', 'wolves'], ['potato', 'potatoes'], ['tomato', 'tomatoes'],
  ['dish', 'dishes'], ['class', 'classes'], ['story', 'stories'], ['party', 'parties'], ['life', 'lives'], ['shelf', 'shelves'],
];

const data = {
  currency() {
    const [c, cur] = pick(CURRENCY);
    const pool = [...new Set(CURRENCY.map((x) => x[1]).filter((x) => x !== cur))];
    return { text: `Đơn vị tiền tệ của ${c} là gì?`, correct: cur, wrongs: shuffle(pool).slice(0, 3) };
  },
  language() {
    const [c, lang] = pick(LANGUAGES);
    const pool = [...new Set(LANGUAGES.map((x) => x[1]).filter((x) => x !== lang))];
    return { text: `Ngôn ngữ chính thức của ${c} là gì?`, correct: lang, wrongs: shuffle(pool).slice(0, 3) };
  },
  pastTense() {
    const [base, past] = pick(IRREGULAR);
    const regular = base.endsWith('e') ? base + 'd' : base + 'ed';
    const others = shuffle(IRREGULAR.filter((x) => x[1] !== past)).map((x) => x[1]);
    const cands = [regular, ...others];
    return { text: `Quá khứ đơn của động từ “${base}” là gì?`, correct: past, wrongs: finalize(past, cands, () => base + 'en') };
  },
  pluralEn() {
    const [one, many] = pick(PLURALS);
    const naive = one + 's';
    const others = shuffle(PLURALS.filter((x) => x[1] !== many)).map((x) => x[1]);
    return { text: `Số nhiều của “${one}” trong tiếng Anh là gì?`, correct: many, wrongs: finalize(many, [naive, one + 'es', ...others], () => one + 'ies') };
  },
  capital() {
    const [c, cap] = pick(COUNTRIES);
    const wrongs = shuffle(COUNTRIES.filter((x) => x[1] !== cap)).slice(0, 3).map((x) => x[1]);
    return { text: `Thủ đô của ${c} là thành phố nào?`, correct: cap, wrongs };
  },
  capitalRev() {
    const [c, cap] = pick(COUNTRIES);
    const wrongs = shuffle(COUNTRIES.filter((x) => x[0] !== c)).slice(0, 3).map((x) => x[0]);
    return { text: `${cap} là thủ đô của nước nào?`, correct: c, wrongs };
  },
  continent() {
    const list = COUNTRIES.filter((x) => x[2] && x[0] !== 'Việt Nam');
    const [c, , cont] = pick(list);
    const wrongs = shuffle(CONTINENTS.filter((x) => x !== cont)).slice(0, 3);
    return { text: `Nước ${c} nằm ở châu lục nào?`, correct: cont, wrongs };
  },
  english() {
    const [en, vi, g] = pick(WORDS);
    const same = WORDS.filter((w) => w[2] === g && w[1] !== vi);
    const pool = same.length >= 3 ? same : WORDS.filter((w) => w[1] !== vi);
    const wrongs = shuffle(pool).slice(0, 3).map((w) => w[1]);
    return { text: `Từ tiếng Anh “${en}” nghĩa là gì?`, correct: vi, wrongs };
  },
  englishRev() {
    const [en, vi, g] = pick(WORDS);
    const same = WORDS.filter((w) => w[2] === g && w[0] !== en);
    const pool = same.length >= 3 ? same : WORDS.filter((w) => w[0] !== en);
    const wrongs = shuffle(pool).slice(0, 3).map((w) => w[0]);
    return { text: `“${vi}” trong tiếng Anh là từ nào?`, correct: en, wrongs };
  },
  element() {
    const [name, sym] = pick(ELEMENTS);
    if (Math.random() < 0.5) {
      const wrongs = shuffle(ELEMENTS.filter((e) => e[1] !== sym)).slice(0, 3).map((e) => e[1]);
      return { text: `Ký hiệu hóa học của nguyên tố ${name} là gì?`, correct: sym, wrongs };
    }
    const wrongs = shuffle(ELEMENTS.filter((e) => e[0] !== name)).slice(0, 3).map((e) => e[0]);
    return { text: `Nguyên tố có ký hiệu hóa học “${sym}” là gì?`, correct: name, wrongs };
  },
  antonym() {
    const pair = pick(ANTONYMS);
    const flip = Math.random() < 0.5;
    const w = flip ? pair[1] : pair[0];
    const ans = flip ? pair[0] : pair[1];
    const others = shuffle(ANTONYMS.filter((p) => p !== pair)).slice(0, 3).map((p) => p[Math.random() < 0.5 ? 0 : 1]);
    return { text: `Từ trái nghĩa với “${w}” là từ nào?`, correct: ans, wrongs: others };
  },
};

// Danh sách bộ sinh theo chủ đề: [hàm, trọng số]
const BY_CATEGORY = {
  toan: [
    [math.add, 1], [math.sub, 1], [math.mul, 1.2], [math.div, 1], [math.table, 1], [math.order, 1.3], [math.decAdd, 1],
    [math.decSub, 0.8], [math.decMul, 0.6], [math.percent, 1], [math.fracOf, 1], [math.rectArea, 0.8], [math.rectPerim, 0.8],
    [math.square, 0.8], [math.triArea, 0.7], [math.circle, 0.7], [math.boxVolume, 0.5], [math.convert, 1.3], [math.speed, 1],
    [math.average, 0.8], [math.findX, 1], [math.sequence, 1.2], [math.compareDec, 1.2], [math.weekday, 0.8], [math.roman, 0.8],
    [math.clock, 0.8], [math.age, 0.6], [math.money, 0.6], [math.logic, 0.5],
  ],
  dialy: [[data.capital, 1.2], [data.capitalRev, 0.8], [data.continent, 0.8], [data.currency, 0.9], [data.language, 0.9]],
  tienganh: [[data.english, 1.2], [data.englishRev, 1], [data.pastTense, 0.8], [data.pluralEn, 0.8]],
  khoahoc: [[data.element, 1]],
  tiengviet: [[data.antonym, 1]],
};

function weightedPick(list) {
  const total = list.reduce((s, x) => s + x[1], 0);
  let r = Math.random() * total;
  for (const item of list) { r -= item[1]; if (r <= 0) return item[0]; }
  return list[list.length - 1][0];
}

function generate(cat) {
  const list = BY_CATEGORY[cat];
  if (!list) return null;
  for (let i = 0; i < 5; i++) {
    try {
      const q = weightedPick(list)();
      if (!q) continue;
      let wrongs = q.wrongs;
      if (q.wrongsFirst) wrongs = finalize(q.correct, [...q.wrongsFirst, ...q.wrongs], () => q.correct + '?');
      if (wrongs.length === 3 && !wrongs.includes(q.correct)) return { text: q.text, correct: q.correct, wrongs, category: cat };
    } catch (e) {
      console.warn('[gen] lỗi', e.message);
    }
  }
  return null;
}

module.exports = { generate, hasGenerator: (c) => !!BY_CATEGORY[c], fmt };
