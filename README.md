# 🧠 Ai Thông Minh Hơn Học Sinh Lớp 5 — Game 3D cho TikTok Live

Game show đố vui 3D chạy trên trình duyệt, kết nối trực tiếp với phiên live TikTok của bạn:
người xem **comment A/B/C/D** để trả lời, **tặng quà** để có trang phục VIP và đứng trên sân khấu.

## Tính năng

| Phần | Mô tả |
|---|---|
| Giao diện người xem (`/`) | Khung dọc 720×1280 (9:16) cho TikTok. Sân khấu neon 3D, màn LED, sàn nhảy đổi màu, đèn quét, pháo hoa |
| Bảng vàng | Trái: **Bảng vàng Donate** (top 5). Phải: **Top điểm cao** của phiên (top 5) |
| Câu hỏi | 4 đáp án, đếm ngược 15 giây (chỉnh được), hết giờ thì **ô đáp án đúng nhấp nháy xanh** kèm % người chọn mỗi đáp án |
| Sân khấu 5 bục | Giữa: TOP 1 – 2 bên: TOP 2, TOP 3 (điểm cao nhất) – 2 đầu: **VIP 1, VIP 2** (donate nhiều nhất) |
| Khán đài | Người xem vào live / comment sẽ hiện nhân vật chibi 3D (ngoại hình riêng theo ID). Comment hiện thành bong bóng trên đầu |
| Chống “treo máy” | Nhân vật dưới khán đài liên tục đi lại, nhảy; camera, đèn, màn LED luôn chuyển động |
| Trang phục VIP | Theo tổng xu đã tặng: 💖 1 xu vòng sáng → 👑 30 xu vương miện + áo vàng → 💎 100 xu áo choàng + lấp lánh → 🐉 500 xu đôi cánh + cột sáng cầu vồng (mốc chỉnh trong admin) |
| Cảm ơn quà | Dải thông báo vàng **nằm giữa bảng câu hỏi và sân khấu (không che câu hỏi)** + giọng đọc cảm ơn |
| Giọng đọc | Đọc câu hỏi mới, đáp án đúng, cảm ơn quà, chào người mới (bật/tắt từng loại) |
| Phiên 10 phút | Mỗi phiên ~27 câu, cuối phiên **vinh danh Top 3** + pháo hoa, rồi tự sang phiên mới |
| Kho câu hỏi | **~1.165 câu viết sẵn (21 chủ đề)** + bộ sinh tự động (toán lớp 5, thủ đô, tiền tệ, ngôn ngữ, tiếng Anh: từ vựng/quá khứ/số nhiều, hóa học, từ trái nghĩa). Đã thử: **0 câu trùng trong ~8 giờ live đầu**. Có thể thêm câu hỏi riêng |
| Trang admin (`/admin`) | Gắn TikTok ID, điều khiển game, nhạc nền (YouTube/mp3, âm lượng nhỏ), bot đám đông, giọng đọc, thông báo, kiểm thử |

Cách tính điểm: đúng được 100 điểm + tối đa 50 điểm thưởng tốc độ. Đúng liên tiếp từ câu thứ 3 có thêm **COMBO** (+20, +40… tối đa +100).
Người xem có thể trả lời bằng: `a`, `B`, `đáp án c`, `chọn D nha`, `1`–`4`, hoặc gõ đúng nội dung đáp án. Mỗi người chỉ tính lần trả lời đầu tiên của mỗi câu.

## Chạy trên máy

Cần Node.js 20 trở lên.

```bash
npm install
npm start          # chạy thật
npm run demo       # chạy thử: 35 bot + vài món quà giả lập để xem hiệu ứng
```

- Trang người xem: http://localhost:3000/
- Trang admin: http://localhost:3000/admin — mật khẩu mặc định `admin123`, đổi bằng biến môi trường `ADMIN_PASSWORD`.

## Đưa lên live

1. Mở trang người xem bằng Chrome/Edge, **bấm vào màn hình 1 lần** để bật âm thanh.
   - Dùng OBS / TikTok LIVE Studio “Link/Browser source”: thêm `?autoplay=1` vào link, kích thước **720×1280**.
   - Máy yếu: thêm `?q=low` (tắt hiệu ứng phát sáng).
2. Trong TikTok LIVE Studio hoặc OBS: thêm nguồn **Window Capture** cửa sổ trình duyệt (hoặc Browser Source), khung dọc.
3. Bấm phát live trên TikTok **trước**, sau đó vào `/admin` nhập TikTok ID → **Kết nối** → **▶ Bắt đầu**.
4. Trước khi live thật nhớ bấm **Xóa bảng donate** nếu đã thử quà test.

Giọng đọc: nên dùng **Microsoft Edge** (có sẵn giọng tiếng Việt tự nhiên HoaiMy/NamMinh). Nếu máy không có giọng Việt, game tự chuyển sang giọng Google (đọc qua server, gửi nội dung câu đọc tới Google Translate).

## Deploy lên Render (gói free)

1. Đẩy thư mục này lên một repo GitHub.
2. Trên Render: **New → Blueprint** và chọn repo (dùng sẵn file `render.yaml`), hoặc **New → Web Service** với
   Build `npm install`, Start `npm start`.
3. Đặt biến môi trường `ADMIN_PASSWORD` (mật khẩu admin riêng của bạn).
4. Mở `https://<tên-app>.onrender.com/` cho trang người xem và `/admin` cho trang quản lý.

Lưu ý về gói free:
- Server **ngủ sau 15 phút không có truy cập**. Khi đang live, trang người xem tự ping 5 phút/lần và server tự ping chính nó (qua `RENDER_EXTERNAL_URL`) nên không bị ngủ giữa chừng. Lần mở đầu tiên sau khi ngủ mất khoảng 30–60 giây.
- Ổ đĩa là tạm thời: điểm, bảng donate, cài đặt và câu hỏi riêng **mất khi server khởi động lại / deploy lại**. Câu hỏi riêng quan trọng nên thêm thẳng vào `src/questions/bank.js`.
- TikTok đôi khi chặn kết nối từ IP máy chủ (datacenter). Nếu trên Render báo lỗi kết nối liên tục, nhập **Euler Stream API key** (mục nâng cao trong admin) hoặc chạy server ngay trên máy tính đang live (`npm start`) — giao diện và tính năng giống hệt.

## Thêm câu hỏi

- Nhanh: trong admin → **Kho câu hỏi** → dán mỗi dòng một câu theo dạng
  `Câu hỏi | Đáp án A | Đáp án B | Đáp án C | Đáp án D | A`
- Lâu dài: sửa `src/questions/bank.js` (mỗi câu: `[câu hỏi, ĐÁP ÁN ĐÚNG, sai 1, sai 2, sai 3]`, thứ tự đáp án được xáo ngẫu nhiên khi ra đề).
- Bật/tắt chủ đề trong admin.

## Cấu trúc thư mục

```
server.js                 Express + Socket.IO, trang admin, đọc giọng Google, tự ping
src/game.js               Vòng chơi, chấm điểm, bục VIP, bot
src/tiktok.js             Kết nối TikTok Live (tiktok-live-connector)
src/questions/            Kho câu hỏi + bộ sinh câu hỏi tự động
public/index.html         Trang người xem
public/js/scene.js        Sân khấu 3D, đèn, bục, pháo hoa (Three.js)
public/js/characters.js   Nhân vật chibi + trang phục VIP
public/js/hud.js          Bảng vàng, bảng câu hỏi, dải cảm ơn quà
public/js/audio.js        Hiệu ứng âm thanh, giọng đọc, nhạc nền
public/admin.html         Trang admin
```
