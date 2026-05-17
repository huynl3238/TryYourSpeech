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

Với IELTS turn dài 45–120 giây, Azure cần được triển khai bằng continuous pronunciation assessment thay vì chỉ nhận diện một lượt ngắn. Miscue detection có thể bị giới hạn trong continuous mode, nên MVP ưu tiên điểm phát âm/fluency/word detail trước; omission/insertion chi tiết có thể xử lý đơn giản hơn hoặc để sau nếu SDK không hỗ trợ tốt.

### Dùng OpenAI cho grammar/vocabulary, không dùng Azure

Azure Pronunciation Assessment chỉ tốt ở phát âm. Grammar, vocabulary, fluency/coherence và IELTS-style feedback cần LLM hiểu ngữ cảnh câu trả lời, câu hỏi gốc, cue card và peer notes. MVP dùng OpenAI text model để giảm số lượng vendor, dùng chung hệ sinh thái với transcription và dễ ép output theo JSON schema.

Khi implement hoặc nâng cấp model, kiểm tra docs OpenAI hiện hành. Kết quả đánh giá phải ưu tiên Structured Outputs/JSON schema để backend rubric scoring có dữ liệu ổn định, không phụ thuộc vào văn bản tự do.

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

### Ghép cặp theo band difference

MVP không dùng recommendation system phức tạp hoặc machine learning. Cơ chế ghép cặp hiện tại là rule-based matching dựa trên độ gần band:

- Chỉ ghép 2 người nếu chênh lệch band không quá `1.0`.
- Nếu có nhiều người phù hợp, chọn người có band gần nhất.
- Nếu vẫn bằng nhau, chọn người chờ lâu hơn.

Cách này đủ đơn giản để triển khai sớm, nhưng tốt hơn FIFO vì tránh ghép người có trình độ quá xa nhau trong một buổi luyện speaking.

### Timestamp đồng bộ từ server, peer note tính theo turn

`Date.now()` của hai client có thể lệch nhau vài giây. Dùng `session_start` event từ server làm tín hiệu bắt đầu chung cho UI session.

Tuy nhiên audio được ghi thành từng file/Blob theo `turnId`, nên `timestamp_ms` của peer notes phải tính từ lúc turn hiện tại bắt đầu, không tính từ đầu session. Khi review một Blob của một turn, app seek bằng:

```js
audioElement.currentTime = note.timestampMs / 1000;
```

Nếu lưu timestamp từ đầu session, app phải lưu thêm `turn_start_ms` để quy đổi. MVP chọn cách đơn giản hơn: peer note timestamp luôn relative to turn.

### Backend là nguồn sự thật cho session và turns

Client không tự tạo `sessionId`, `userId`, `turnId` hoặc `questionId`. Khi Socket.IO match thành công, backend tạo user/session/turns trong PostgreSQL rồi gửi lại thông tin cần thiết cho hai client. Cách này giúp upload audio, peer notes và AI results luôn map về cùng một dữ liệu.

Socket chỉ chịu trách nhiệm realtime matchmaking/signaling. Database chịu trách nhiệm lưu session lifecycle, turns, review completion, audio upload status và AI results.

Session lifecycle trong MVP được giữ đơn giản: `matched` khi ghép cặp xong, `active` khi hai bên WebRTC ready, `reviewing` khi bắt đầu upload/review sau luyện nói, `processing` khi cả hai hoàn tất review và audio đã upload đủ, `completed` khi AI pipeline kết thúc, `abandoned` khi disconnect trước khi hoàn tất.

Audio của chính user được upload ở background trong review phase. AI không chạy ngay khi upload nếu peer review chưa hoàn tất, vì OpenAI feedback cần dùng peer notes làm input.

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
| Azure Pronunciation Assessment với turn > 30 giây | Cao | Dùng continuous mode cho turn dài; chấp nhận caveat với miscue trong MVP |
| Whisper file > 25MB | Trung bình | Ghi audio theo từng turn, kiểm tra size trước khi gửi OpenAI |
| OpenAI feedback rate limit/model error | Trung bình | Trả lỗi rõ ràng, không retry phức tạp |
| WebRTC fail khi không có TURN | Trung bình | Local dev dùng STUN, production cần TURN — làm sau MVP |
| Hai client lệch timer | Cao nếu không xử lý | Dùng `session_start` từ server; peer note timestamp tính theo turn local |
| Env Docker và backend lệch nhau | Cao | Giữ `.env`, Docker Compose và fallback code cùng port/password |
| Refresh tab trong review làm mất remote audio | Trung bình | MVP chấp nhận vì remote Blob không upload; cảnh báo user nếu rời trang |
| Upload/AI fail một phần | Trung bình | Lưu status theo từng turn, không bắt user làm lại toàn bộ session |
