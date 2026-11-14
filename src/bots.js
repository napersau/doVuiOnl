'use strict';
// Bot giả lập khán giả cho đông vui (chỉ hiển thị nhân vật + bình luận trả lời)
const { rand, pick } = require('./util');

const HO = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'];
const DEM = ['Văn', 'Thị', 'Minh', 'Thanh', 'Ngọc', 'Gia', 'Quốc', 'Thu', 'Hoài', 'Bảo', 'Khánh', 'Anh', 'Đức', 'Phương', 'Hải'];
const TEN = ['An', 'Bình', 'Chi', 'Dũng', 'Giang', 'Hà', 'Hiếu', 'Huy', 'Hương', 'Khoa', 'Lan', 'Linh', 'Long', 'Mai', 'My', 'Nam',
  'Ngân', 'Nhi', 'Phúc', 'Quân', 'Sơn', 'Tâm', 'Thảo', 'Trang', 'Trí', 'Tú', 'Tuấn', 'Uyên', 'Vy', 'Yến', 'Hân', 'Khang', 'Duy', 'Lâm', 'Thư'];
const HANDLE = ['mèo', 'bé', 'cún', 'tiểu', 'boy', 'girl', 'kute', 'pro', 'vip', 'xinh', 'chill', 'hihi', 'nhỏ', 'sóc', 'gấu'];
const ANSWER_TEMPLATES = ['{L}', '{L}', '{L}', '{l}', '{l}', 'đáp án {L}', '{L} nha', '{l} chắc luôn', 'chọn {L}', '{L} 100%', '{l} đi mọi người', '{L}!!', 'mình chọn {L}', '{l} nhé'];
const CHATTER = ['hay quá', 'câu này khó ghê', 'hello cả nhà', 'vui quá trời', 'game hay nha', '👏👏👏', 'mình mới vào', 'cố lên mọi người',
  'haha', 'hên xui thôi', 'lớp 5 mà khó thế', 'trời ơi sai rồi 😭', 'đúng rồi nè', 'thả tim nào ❤️', 'chào mọi người', 'nhạc hay quá',
  'top 1 là của tui', 'câu dễ mà', 'ai giỏi vậy trời', 'xin chào streamer'];

function botName() {
  const r = Math.random();
  if (r < 0.45) return `${pick(HO)} ${pick(DEM)} ${pick(TEN)}`;
  if (r < 0.75) return `${pick(TEN)} ${pick(HO)}`;
  const base = pick(TEN).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  return Math.random() < 0.5 ? `${base}_${rand(10, 999)}` : `${pick(HANDLE)}${pick(TEN)}${rand(1, 99)}`;
}

function answerText(idx) {
  const L = 'ABCD'[idx];
  return pick(ANSWER_TEMPLATES).replace('{L}', L).replace('{l}', L.toLowerCase());
}

module.exports = { botName, answerText, CHATTER, rand, pick };
