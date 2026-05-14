# PROJECT.md — Bối cảnh và Quyết định Thiết kế

## Nguồn gốc ý tưởng

Trong lớp luyện IELTS, giáo viên tổ chức luyện speaking bằng cách ghép cặp học viên, phát câu hỏi theo format IELTS, và yêu cầu hai người luân phiên trả lời trong thời gian quy định. Khi một người nói, người còn lại lắng nghe và ghi nhận lỗi sai (phát âm, ngữ pháp, từ vựng), sau đó đưa ra nhận xét.

Ứng dụng này số hóa quy trình đó và giải quyết những điểm bất tiện của hình thức truyền thống.

---

## Vấn đề cần giải quyết

### Tại sao không tự luyện với AI?

Các app tự luyện nói với AI một mình không tạo được áp lực giao tiếp thật. Khi đối mặt với người lạ — đặc biệt là người cùng học — người dùng sẽ cảm thấy áp lực tương tự như khi thi thật với giám khảo. Đây là yếu tố tâm lý quan trọng mà AI không thể thay thế.

### Tại sao cần người nghe là con người?

- Người học cùng đưa ra phản hồi từ góc nhìn của người đang học, không phải từ chuẩn mực lý thuyết.
- Gợi ý cách dùng từ khác, điểm ngữ pháp khác → nhiều góc nhìn hơn AI.
- Người nghe phải chủ động lắng nghe để ghi lỗi → tự rèn kỹ năng nghe và tư duy phân tích.

### Tại sao vẫn cần AI?

- Người nghe có thể bỏ lỡ lỗi phát âm vì không theo kịp tốc độ nói.
- Người nghe không đủ chuyên môn để phân tích phoneme-level.
- AI đảm bảo đánh giá phát âm đầy đủ và chính xác hơn, bổ sung cho peer review.

---

## Đối tượng người dùng

- Người Việt đang luyện IELTS Speaking.
- Quen với bàn phím, có thể dùng phím tắt.
- Đang nghe chủ động → tay và mắt bận → UX phải tối thiểu thao tác.
- Không phải native speaker → cần feedback bằng tiếng Việt.

---

## Non-goals (những thứ ứng dụng KHÔNG làm)

- Không phải app luyện nói một mình với AI.
- Không phải nền tảng dạy IELTS toàn diện (không có bài giảng, không có luyện reading/writing/listening).
- Không phải mạng xã hội hay diễn đàn học tiếng Anh.
- Không thay thế giáo viên — AI chỉ bổ sung, không phán xét cuối cùng.

---

## Quyết định kỹ thuật và lý do

### Dùng Whisper + Azure thay vì chỉ một

**Vấn đề với Whisper:** Model đoán từ theo ngữ cảnh. Nếu người dùng phát âm sai nhưng nghe gần giống từ đúng, Whisper tự sửa thành từ đúng trong transcript → che giấu lỗi phát âm.

**Giải pháp:** Dùng Whisper để lấy transcript ngữ cảnh đầy đủ (làm reference text), sau đó gửi transcript đó cho Azure để chấm phát âm. Azure so khớp từng phoneme với reference text mà không tự đoán → bắt được lỗi Whisper bỏ qua.

Không thay bằng chỉ Azure vì Azure cần reference text để hoạt động chính xác.

### Dùng Gemini cho grammar/vocabulary, không dùng Azure

Azure Pronunciation Assessment chỉ tốt ở phát âm. Grammar và vocabulary cần LLM hiểu ngữ cảnh câu trả lời và câu hỏi gốc. Gemini Flash đủ tốt, rẻ, và có thể output tiếng Việt.

### Không dùng TypeScript

Team 1 developer, giai đoạn MVP cần tốc độ hơn type safety. TypeScript sẽ được xem xét lại khi project ổn định.

### TAB thay vì click để đánh dấu lỗi

Người nghe đang tập trung nghe, tay có thể đặt sẵn trên bàn phím. Click chuột yêu cầu chuyển sự chú ý sang màn hình. TAB + phím số giữ tay trên bàn phím và giảm thời gian rời khỏi việc nghe xuống tối thiểu.

### Phím số (1–4) để chọn loại lỗi

Chọn bằng TAB nhiều lần để di chuyển giữa các option sẽ chậm và dễ nhầm. Phím số bấm một lần là xong.

### Ghi remote audio ở client, không upload

Remote audio chỉ dùng để review trong vài phút ngay sau phiên. Upload lên server tốn băng thông và storage không cần thiết. Khi tab đóng, Blob mất → chấp nhận được vì review phải làm ngay.

### Band tự khai báo trong MVP

Làm bài test band đầu vào tự động phức tạp hơn nhiều và không phải core flow. MVP dùng band tự khai báo, sau này mới bổ sung placement test nếu cần.

### Timestamp đồng bộ từ server

`Date.now()` của hai client có thể lệch nhau vài giây. Dùng timestamp từ `session_start` event của server làm mốc chung để tính `timestamp_ms` của peer notes — đảm bảo khi review seek audio sẽ đúng vị trí.

---

## UX Philosophy

**Ưu tiên cao nhất:** Không làm gián đoạn người đang nghe.

Mọi thao tác trong lúc nghe (đánh dấu lỗi, chọn loại, ghi note) phải:
- Không che khuất nội dung chính.
- Hoàn thành trong dưới 3 giây.
- Có thể bỏ qua bước ghi note chi tiết (làm sau ở review).

**Ưu tiên thứ hai:** Feedback phải actionable.

Không chỉ hiện điểm số — phải chỉ rõ từ nào sai, phoneme nào sai, và gợi ý sửa cụ thể bằng tiếng Việt.

---

## Rủi ro đã biết

| Rủi ro | Mức độ | Cách xử lý trong MVP |
|---|---|---|
| Azure SDK lỗi với ESM | Cao | Dùng `createRequire` — xem AGENTS.md |
| Whisper file > 25MB | Trung bình | Kiểm tra size trước khi upload, log cảnh báo |
| Gemini rate limit 429 | Thấp (free tier) | Trả lỗi rõ ràng, không retry phức tạp |
| WebRTC fail khi không có TURN | Trung bình | Local dev dùng STUN, production cần TURN — làm sau MVP |
| Hai client lệch timer | Cao nếu không xử lý | Dùng server timestamp làm gốc |