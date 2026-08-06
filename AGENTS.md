# AGENTS.md — IELTS Speaking Practice App

## Tổng quan dự án

Ứng dụng luyện IELTS Speaking trực tuyến theo mô hình ghép cặp 2 học viên. Hai người vào cùng một phiên luyện nói, thay phiên nhau trả lời câu hỏi theo format IELTS Speaking. Khi một người nói, người còn lại lắng nghe và đánh dấu lỗi theo mốc thời gian để review sau.

Hệ thống tích hợp AI **sau phiên luyện** để:
- Chuyển audio thành transcript bằng OpenAI Whisper.
- Chấm phát âm chi tiết bằng Azure Pronunciation Assessment.
- Đánh giá ngữ pháp, từ vựng, fluency, coherence và gợi ý cải thiện bằng OpenAI text model.

**Đối tượng:** Người Việt đang luyện IELTS Speaking.
**Quy mô hiện tại:** Local development, ưu tiên hoàn thành MVP trước production.
**Team:** 1 developer.

---

## Nguyên tắc sản phẩm

Ứng dụng **không phải** app "tự nói với AI". Giá trị cốt lõi là kết hợp:
- Áp lực giao tiếp thật khi nói với người lạ.
- Phản hồi từ người học cùng qua peer notes.
- AI bổ sung đánh giá khách quan hơn sau phiên luyện.

Khi cần quyết định thiết kế tính năng, ưu tiên các tính năng giúp 2 người luyện nói, ghi lỗi nhanh, review đúng mốc thời gian và nhận feedback AI sau phiên.

---

## Phạm vi MVP bắt buộc

Chỉ tập trung làm các tính năng sau trước:

1. Học viên nhập tên hiển thị và band hiện tại (tự khai báo).
2. Học viên bấm "Tìm đối tác".
3. Backend ghép cặp 2 người bằng Socket.IO.
4. Frontend tạo kết nối WebRTC P2P audio/video.
5. Hiển thị câu hỏi IELTS theo bộ câu hỏi có sẵn.
6. Hai người thay phiên nói và nghe theo timer đồng bộ.
7. Người nghe bấm TAB để đánh dấu lỗi theo timestamp.
8. Người nghe chọn loại lỗi: pronunciation, grammar, vocabulary, fluency.
9. Người nghe có thể ghi note ngắn ngay lúc đó hoặc bổ sung ở bước review.
10. Client ghi audio theo từng speaking turn:
    - Audio của chính mình trong mỗi turn để upload lên server cho AI chấm.
    - Audio của đối phương trong mỗi turn để review local.
11. Sau phiên luyện, mỗi người review audio đối phương tối đa 5 phút và bổ sung note.
12. Client upload audio của chính mình lên server.
13. Server xử lý AI pipeline: OpenAI transcription → Azure Pronunciation Assessment → OpenAI IELTS feedback.
14. Lưu kết quả và hiển thị màn hình kết quả.

## Ngoài phạm vi MVP

Không tự ý code các phần sau nếu user chưa xác nhận rõ:

- Vai trò giáo viên.
- Giáo viên tạo tài khoản học viên.
- Giáo viên quản lý chủ đề/câu hỏi bằng UI riêng.
- Public cuộc trò chuyện lên khu vực chung.
- Hệ thống đánh giá band đầu vào tự động.
- Realtime AI feedback trong lúc đang nói.
- Video recording và upload video.
- TURN server/production WebRTC infrastructure.
- Payment, notification, email, admin dashboard.

Nếu user yêu cầu một tính năng trong danh sách này, phải đề xuất phương án trước khi code.

---

## Tech Stack

### Frontend

- React + Vite + JavaScript, không dùng TypeScript.
- Socket.IO Client `^4.7.5`.
- Native WebRTC API, không dùng wrapper library.
- Native MediaRecorder API.
- shadcn/ui chỉ dùng khi đã được cài đặt và phù hợp với codebase JavaScript. Không tự chuyển project sang TypeScript.

### Backend

- Node.js + Express `^4.21.1` + ESM (`"type": "module"`).
- Socket.IO `^4.7.5`.
- PostgreSQL (`pg ^8.13.1`).
- Redis (`ioredis ^5.4.2`).

### AI Services

- OpenAI Audio transcription API: transcription, dùng làm reference text.
- Azure Cognitive Services Speech SDK: Pronunciation Assessment ở word/phoneme level.
- OpenAI text model: grammar, vocabulary, fluency/coherence, IELTS band feedback bằng tiếng Việt.
  - Dùng Structured Outputs/JSON schema khi cần kết quả ổn định để backend rubric scoring xử lý.
  - Trước khi implement hoặc nâng package/model, kiểm tra docs OpenAI hiện hành để tránh dùng API/model đã deprecated.

### Local Infrastructure

- Docker Compose: PostgreSQL + Redis.
- Backend và frontend chạy trực tiếp bằng `npm run dev`.
- PostgreSQL local phải khớp với `.env`: host `localhost`, port `5432`, database `ielts_speaking`, user `postgres`, password `postgres`.
- Redis local phải khớp với `.env`: `redis://localhost:6379`.

### Backend dependencies cần có khi làm AI/audio

Các package này chưa chắc đã được cài sẵn trong repo. Khi implement phần tương ứng, kiểm tra `backend/package.json` trước và chỉ cài package thật sự cần dùng:

- `openai` cho transcription.
- `microsoft-cognitiveservices-speech-sdk` cho Azure Pronunciation Assessment.
- `openai` cho IELTS feedback bằng text model, dùng cùng API key với transcription nếu phù hợp.
- `multer` cho multipart upload.
- `fluent-ffmpeg` cho conversion, kèm binary `ffmpeg` có sẵn trong môi trường local.

---

## Environment Variables

### Backend `.env`

```
PORT=3001
CLIENT_URL=http://localhost:5173

DB_HOST=localhost
DB_PORT=5432
DB_NAME=ielts_speaking
DB_USER=postgres
DB_PASSWORD=postgres

REDIS_URL=redis://localhost:6379

OPENAI_API_KEY=
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
OPENAI_FEEDBACK_MODEL=gpt-4.1-mini
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=
AZURE_SPEECH_LANGUAGE=en-US
# Production: JSON array of TURN servers. Local: để trống.
ICE_SERVERS=[]
```

### Frontend `.env`

```
VITE_BACKEND_URL=http://localhost:3001
VITE_BACKEND_WS_URL=ws://localhost:3001
```

Không hardcode bất kỳ giá trị nào ở trên vào code. Backend dùng `process.env.X`, frontend dùng `import.meta.env.VITE_X`.

Frontend không đọc `ICE_SERVERS` trực tiếp. Frontend gọi `GET /api/config` để lấy WebRTC config từ backend.

Nếu `docker-compose.yml` khác các giá trị trên, phải sửa `docker-compose.yml` hoặc `.env` cho khớp trước khi code feature phụ thuộc PostgreSQL/Redis. Không để tài liệu, Docker và fallback trong code lệch nhau.

---

## Quy tắc viết code bắt buộc

### 1. Mỗi hàm chỉ làm một việc

Không viết hàm làm nhiều việc cùng lúc. Nếu một hàm cần làm 2 việc, tách thành 2 hàm nhỏ rõ nghĩa. Khi một hàm đang lỗi, sửa đúng hàm đó, không tạo thêm hàm mới chỉ để né bug cũ.

### 2. Không over-engineering

Không thêm abstraction layer, design pattern, service/repository/helper nếu chưa cần. Giải quyết đúng bài toán hiện tại.

### 3. Logic rõ ràng

Tên biến và tên hàm phải nói lên chức năng. Ưu tiên code đọc vào hiểu ngay hơn code ngắn nhưng khó đọc.

### 4. Cú pháp đơn giản

Dùng cú pháp JavaScript thông thường khi có thể. Không dùng kỹ thuật nâng cao nếu không làm code dễ hiểu hơn.

### 5. Error handling vừa đủ

Không bọc try/catch tràn lan. Cần có error handling tối thiểu tại ranh giới hệ thống:
- Network request.
- File upload/read/write.
- Database/Redis.
- External AI APIs.
- WebRTC/media permission.

### 6. Không tạo file/layer thừa

Nếu logic đơn giản và chỉ dùng ở một nơi, để ngay tại nơi sử dụng. Chỉ tách file khi logic đủ dài, được dùng lại, hoặc giúp file hiện tại dễ đọc hơn rõ rệt.

### 7. Bám sát docs theo version

Dùng API đúng với version trong `package.json`. Không dùng API deprecated hoặc copy code không khớp version.

### 8. Config đọc từ env

Không hardcode URL, port, API key trong code. Giá trị fallback local chỉ chấp nhận cho development và không được chứa secret.

---

## Conventions

- **Date/time:** dùng UTC, lưu `TIMESTAMP`, không dùng `TIMESTAMPTZ`.
- **UUID:** generate ở backend bằng `crypto.randomUUID()`, không thêm package. Khi insert database, backend truyền `id` rõ ràng, không dựa vào `gen_random_uuid()` của PostgreSQL.
- **Error response:** `{ error: "mô tả lỗi" }`.
- **Logging:** `console.log` cho info, `console.warn` cho cảnh báo, `console.error` chỉ cho lỗi thật sự.
- **Async:** dùng `async/await`, không dùng `.then().catch()` chain.
- **Import:** dùng ESM `import/export`. Chỉ dùng `require()` khi bắt buộc, ví dụ Azure Speech SDK.
- **Frontend language:** JavaScript JSX, không tạo file TypeScript.
- **UI text:** ưu tiên tiếng Việt cho người dùng cuối.

---

## Quy tắc khi đề xuất giải pháp

Khi nhận yêu cầu làm tính năng mà chưa có trong AGENTS.md, nằm ngoài MVP, hoặc chưa chỉ định rõ cách xử lý, không được tự ý chọn và code ngay.

Quy trình bắt buộc:

1. Tóm tắt lại bài toán bằng ngôn ngữ đơn giản.
2. Đề xuất 2–3 cách tiếp cận.
3. Mỗi cách cần có: cách hoạt động, ưu điểm, nhược điểm, phù hợp khi nào.
4. Đưa ra recommendation rõ ràng: "Với dự án này, tôi khuyên dùng phương án X vì..."
5. Chờ user xác nhận trước khi code.

Nếu tính năng đã nằm trong MVP và cách làm đã được quy định rõ trong file này, có thể code sau khi đọc ngữ cảnh codebase liên quan.

---

## Socket và matchmaking

**Quan trọng:** `backend/src/socket/index.js` đã implement phần server socket hiện tại. Luôn đọc file này trước khi làm bất cứ việc gì liên quan đến socket, matchmaking, WebRTC signaling, room, ready state hoặc disconnect.

### Client → Server

| Event | Data | Mô tả |
|---|---|---|
| `find_match` | `{ displayName, band }` | Người dùng muốn tìm đối tác |
| `cancel_find_match` | — | Huỷ tìm kiếm |
| `signal` | `{ type, payload }` | Relay WebRTC signal sang đối tác |
| `device_ready` | — | Người dùng bấm "Tôi đã sẵn sàng"; mic/camera OK, **chưa** đàm phán gì |
| `device_failed` | — | Không mở được mic/camera trên máy này |
| `peer_connected` | — | `pc.connectionState === 'connected'`, kết nối media đã thật sự thông |
| `practice_complete` | — | Hết timeline luyện nói, đang chuyển sang giai đoạn đánh giá |

### Server → Client

| Event | Data | Mô tả |
|---|---|---|
| `waiting` | — | Đang chờ đối tác |
| `matched` | `{ roomId, sessionId, userId, partnerId, role, isInitiator, partnerName }` | Đã ghép cặp |
| `match_error` | `{ error }` | Không thể ghép cặp/tạo session |
| `signal` | `{ type, payload }` | Relay từ đối tác |
| `begin_signaling` | — | Cả hai đã `device_ready`; bắt đầu offer/answer |
| `session_start` | `{ timestamp }` | Cả hai đã `peer_connected`, bắt đầu session |
| `partner_reconnecting` | — | Socket của đối tác vừa rớt; phòng đang được giữ 15s chờ họ quay lại |
| `partner_reconnected` | — | Đối tác đã quay lại kịp; phiên chạy tiếp |
| `session_resumed` | `{ roomId, sessionId, phase, sessionMode }` | Gửi cho chính người vừa quay lại, cho biết phòng đang ở phase nào |
| `partner_disconnected` | — | Đối tác rời đi khi phiên chưa luyện xong (chỉ gửi SAU khi hết 15s ân hạn) |
| `partner_not_ready` | — | Đối tác không xác nhận sẵn sàng trong 60s |
| `partner_device_failed` | — | Mic/camera của đối tác hỏng (chỉ gửi cho người còn lại) |
| `webrtc_failed` | — | Hai máy không kết nối được với nhau trong 45s |

### Vòng đời một room

`devices → signaling → active → done`. Phase quyết định một socket mất kết nối
có nghĩa gì: ở `signaling` là ghép hỏng, ở `done` thì **không có nghĩa gì cả** và
tuyệt đối không được đụng vào session.

Bốn event lỗi ở trên trước đây gộp chung thành `partner_disconnected`, nên micro
hỏng, đối tác bấm chậm và tab bị đóng đều báo cùng một câu sai sự thật. Thêm lỗi
mới thì thêm event mới, đừng gộp lại.

### Mất kết nối tạm thời

Socket rớt **không** phá phòng ngay. Phòng được giữ thêm `RECONNECT_GRACE_MS`
(15s, đổi được bằng env `SOCKET_RECONNECT_GRACE_MS` — test dùng giá trị ngắn).

Lý do: WebRTC chạy thẳng giữa hai trình duyệt, không qua server. Một cú rớt mạng
vài giây hoàn toàn có thể xảy ra trong khi tiếng và hình vẫn đang chạy bình
thường — phá phòng lúc đó là tự tay giết một cuộc gọi đang tốt.

Người quay lại mang **socket.id mới**, nên `resumeRoomIfAway` phải thay id cũ ở
mọi nơi cùng lúc: `room.userA/userB.socketId`, `userRoom`, và cả bốn Set
`deviceReadyUsers` / `connectedUsers` / `practiceCompleteUsers` /
`practiceReadyUsers`. Bỏ sót Set nào thì phòng quên mất người đó đã bấm sẵn sàng
và ngồi chờ một cú bấm thứ hai không bao giờ tới.

Khi hết ân hạn mà phase đã là `done` thì chỉ xoá phòng, **không** đánh session
abandoned: bài đã luyện xong và peer notes vẫn còn nợ.

### `signal.type` values
- `offer` — WebRTC offer SDP
- `answer` — WebRTC answer SDP
- `ice-candidate` — ICE candidate

Không tự tưởng tượng socket event mới nếu chưa đối chiếu file này.

### Matchmaking và DB trong MVP

Matchmaking hiện tại dùng **Band Difference Matching** in-memory. Khi user gửi `find_match`, backend tìm người đang chờ có band gần nhất và chỉ ghép nếu chênh lệch band không quá `1.0`.

Quy tắc MVP:

- User bắt buộc gửi `{ displayName, band }`.
- Backend parse `band` thành số từ `0` đến `9`.
- Chỉ xét candidate có band hợp lệ.
- Chỉ ghép nếu `Math.abs(user.band - candidate.band) <= 1.0`.
- Nếu có nhiều candidate phù hợp, chọn người có band gần nhất.
- Nếu band difference bằng nhau, chọn người chờ lâu hơn.
- Nếu không có candidate phù hợp, user tiếp tục ở hàng chờ và nhận event `waiting`.

Khi hai user được match:

1. Backend tạo hoặc lưu `users` từ `{ displayName, band }`.
2. Backend chọn một topic/questions cho session.
3. Backend tạo `sessions`.
4. Backend tạo toàn bộ `turns` cho session theo thứ tự cố định.
5. Backend emit `matched` cho hai client với cùng `sessionId`, `roomId`, role `A` hoặc `B`, và `userId` riêng của từng client.

`role` chỉ dùng trong session hiện tại để xác định thứ tự nói/nghe. Không dùng `socket.id` làm user id trong database. `socket.id` chỉ là id kết nối tạm thời.

Khi bắt đầu implement matchmaking gắn database, dùng payload `matched` mới ở trên ngay. Không tiếp tục mở rộng payload cũ vì audio upload, peer notes và results đều cần `sessionId`, `userId`, `partnerId` và `role`.

### Chọn topic/questions trong MVP

Khi tạo session, backend chọn random 1 topic có đủ câu hỏi tối thiểu:

- Part 1: 4 câu.
- Part 2: 1 cue card.
- Part 3: 3 câu.

Nếu chưa có topic nào đủ dữ liệu, API/socket phải trả lỗi rõ ràng `{ error: "Chưa có đủ câu hỏi để tạo phiên luyện tập" }`. Không hardcode questions ở frontend để né lỗi seed data.

---

## WebRTC Config

Backend đọc TURN/STUN config từ env và expose qua endpoint cấu hình tối thiểu:

```js
app.get('/api/config', (req, res) => {
  const configuredIceServers = JSON.parse(process.env.ICE_SERVERS || '[]');

  res.json({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      ...configuredIceServers,
    ],
  });
});
```

Frontend lấy config từ backend trước khi tạo `RTCPeerConnection`:

```js
const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/config`);
const { iceServers } = await response.json();

const pc = new RTCPeerConnection({
  iceServers,
});
```

Không hardcode TURN server ở frontend. Local development dùng STUN mặc định và `ICE_SERVERS=[]`.

---

## App Flow MVP

### Phase 1 — Đăng nhập tối giản

Trong MVP, chưa cần authentication đầy đủ. Học viên nhập:
- Display name.
- Band hiện tại do user tự khai báo (dùng để hiển thị và matchmaking đơn giản).

Chưa làm hệ thống đánh giá band đầu vào tự động trong MVP.

### Phase 2 — Tìm đối tác

Người dùng bấm "Tìm đối tác". Hệ thống ghép cặp 2 người đang chờ.

Matchmaking MVP dùng Band Difference Matching:
- Ưu tiên ghép người có band gần nhau nhất.
- Chỉ ghép nếu chênh lệch band không quá `1.0`.
- Nếu chưa có người phù hợp, user tiếp tục chờ thay vì ghép đại với người chênh band quá xa.

Không làm bài test đầu vào tự động nếu user chưa xác nhận.

Khi match thành công, backend phải tạo `users`, `sessions` và `turns` trước khi client bắt đầu luyện nói. Client không tự generate `sessionId`, `userId`, `turnId` hoặc `questionId`.

### Phase 3 — Luyện nói

Hệ thống hiển thị câu hỏi IELTS cho cả hai. Nguồn câu hỏi MVP lấy từ backend, không hardcode trong frontend. Backend có thể seed sẵn `topics` và `questions` vào PostgreSQL, sau đó trả một bộ câu hỏi qua API.

Mỗi câu hỏi cả hai người đều trả lời:
- Người A nói, người B nghe và đánh dấu lỗi.
- Sau đó đổi vai.
- Xong cả hai lượt thì chuyển câu tiếp theo.

Cấu trúc IELTS Speaking trong MVP:

| Part | Mô tả | Thời gian/lượt | Số câu |
|---|---|---:|---:|
| Part 1 | Câu hỏi ngắn về đời sống, sở thích | 45 giây | 4–5 |
| Part 2 | Cue card, nói dài về một chủ đề | 1 phút chuẩn bị + 2 phút nói | 1 |
| Part 3 | Thảo luận sâu theo chủ đề Part 2 | 60 giây | 3–4 |

Tổng thời gian luyện nói ước tính 18–22 phút.

Turn order phải lấy từ backend qua session detail. Mỗi turn có `turnId`, `questionId`, `speakerId`, `speakerRole`, `turnIndex`, `durationMs`, `partNumber` và optional `prepDurationMs`.

### Phase 4 — Review

Sau khi luyện nói xong, mỗi người nghe lại audio của đối phương trong tối đa 5 phút:
- Có thể click marker để seek đến mốc lỗi.
- Có thể bổ sung note chi tiết.
- Bấm "Hoàn tất" để gửi đánh giá cho đối phương.

Remote audio chỉ dùng local để review, không upload trong MVP.

Review audio của đối phương dùng Blob local map theo `turnId`. Nếu tab bị refresh/đóng trong review, remote Blob có thể mất; MVP chấp nhận điều này và hiển thị thông báo rõ ràng. Không upload remote audio lên server nếu user chưa xác nhận đổi scope.

Khi vào review phase, client bắt đầu upload audio của chính mình ở background theo từng turn. User vẫn có thể review audio đối phương trong lúc upload chạy. Upload audio và review peer notes là hai luồng độc lập nhưng cùng map theo `turnId`.

### Phase 5 — AI chấm điểm

AI processing chỉ bắt đầu khi đủ 2 điều kiện:

1. Audio của speaking turn đã upload thành công.
2. Cả hai user đã hoàn tất review bằng `POST /api/review/complete`.

Nếu user bấm hoàn tất review trước khi audio upload xong, session vẫn chờ các upload còn thiếu. Nếu audio upload xong trước khi cả hai review complete, backend chỉ lưu file/metadata và chưa gọi AI.

Khi đủ điều kiện, server xử lý mỗi turn độc lập:

1. Nhận `audio/webm`.
2. Convert sang WAV 16kHz mono bằng `fluent-ffmpeg`.
3. Gửi WAV cho Whisper để lấy transcript.
4. Gửi WAV + transcript cho Azure Pronunciation Assessment.
5. Gửi transcript + Azure scores + câu hỏi + peer notes cho OpenAI text model.
6. Lưu kết quả.
7. Trả kết quả cho frontend.

### Phase 6 — Xem kết quả

Người dùng xem:
- Điểm IELTS Speaking theo 4 tiêu chí.
- Pronunciation details theo word/phoneme.
- Nhận xét ngữ pháp và từ vựng bằng tiếng Việt.
- Gợi ý cải thiện.
- Ghi chú từ người nghe (loại lỗi + timestamp + nội dung).
- Transcript đầy đủ.

---

## Audio Architecture

Mỗi client ghi audio theo từng speaking turn, không ghi một file dài cho cả phiên. Điều này giúp map trực tiếp audio vào bảng `turns`, peer notes và AI result.

Trong mỗi speaking turn:

```text
Client A:
  Nếu A đang nói:
    localTurnRecorder  → ghi stream của A trong turn hiện tại → upload server → AI xử lý
  Nếu B đang nói:
    remoteTurnRecorder → ghi stream của B trong turn hiện tại → local Blob    → review playback

Client B:
  Nếu B đang nói:
    localTurnRecorder  → ghi stream của B trong turn hiện tại → upload server → AI xử lý
  Nếu A đang nói:
    remoteTurnRecorder → ghi stream của A trong turn hiện tại → local Blob    → review playback
```

Khi bắt đầu một turn, client tạo recorder phù hợp với vai trò hiện tại. Khi hết turn, stop recorder và lưu Blob theo `turnId`.

Client lưu audio như sau:

- `localAudioByTurnId`: audio của chính user, dùng để upload.
- `remoteAudioByTurnId`: audio của đối phương, chỉ dùng local review.
- Mỗi note lưu `turnId` và `timestampMs` tính từ lúc bắt đầu turn đó, không tính từ đầu session.

Ghi remote stream từ WebRTC track khi người đối phương đang nói:

```js
peerConnection.ontrack = (event) => {
  const remoteStream = event.streams[0];
  const remoteRecorder = new MediaRecorder(remoteStream, {
    mimeType: 'audio/webm;codecs=opus',
  });
};
```

Remote Blob không upload trong MVP. Chỉ dùng local để review audio của đối phương. Chỉ upload audio của chính user theo từng `turnId` để AI chấm.

Khi browser không support `audio/webm;codecs=opus`, fallback sang MIME type đầu tiên được `MediaRecorder.isTypeSupported()` chấp nhận. Không hardcode một MIME type duy nhất mà không kiểm tra support.

### Audio conversion server-side

1. Client upload `audio/webm` của một turn lên `POST /api/audio/upload`.
2. Server nhận bằng `multer`.
3. Server validate `turnId`, `sessionId`, `speakerId`, `questionId` và quyền upload.
4. Lưu file tạm vào temp directory.
5. Convert bằng `fluent-ffmpeg` sang WAV: 16kHz, mono, `pcm_s16le`.
6. Gửi WAV cho AI services.
7. Xóa file tạm `.webm` và `.wav` sau khi xử lý xong.

### Nghe lại audio — `GET /api/turns/:turnId/audio`

Thư mục `uploads/audio` **không** được serve tĩnh. Bản ghi âm là giọng nói của người thật, nên mọi lần nghe đều phải đi qua endpoint này để kiểm tra quyền.

Cần đăng nhập (`requireAuth`). Được nghe khi:

- là một trong hai người của phiên đó, hoặc
- phiên đó đã có bài đăng Lớp học ở trạng thái `published`, hoặc
- là admin.

Không đủ quyền và không tồn tại đều trả `404` giống hệt nhau, để người dò `turnId` không biết được id nào là thật. Endpoint dùng `res.sendFile` vì nó tự trả lời Range request — đây là thứ cho phép tua tới đúng chỗ được đánh dấu lỗi thay vì phát lại từ đầu.

Cột `turns.audio_url` vẫn giữ đường dẫn trên đĩa (`/uploads/audio/<turnId>.webm`) cho AI đọc trực tiếp; chỉ có API trả về cho client là đổi sang `/api/turns/<turnId>/audio`. Không được lẫn hai thứ này.

---

## API Contracts MVP

Không tự tưởng tượng API mới nếu các contract dưới đây đã đủ cho flow hiện tại. Nếu cần thêm API ngoài danh sách này, phải đọc code hiện có trước và giữ contract đơn giản.

### `GET /api/config`

Trả config runtime cho frontend.

Response:

```json
{
  "iceServers": [
    { "urls": "stun:stun.l.google.com:19302" }
  ]
}
```

### `GET /api/sessions/:sessionId`

Trả session detail sau khi backend đã match 2 user và tạo turns. Frontend dùng endpoint này để render câu hỏi, timer và xác định thứ tự nói/nghe. Không hardcode questions hoặc turns ở frontend.

Response:

```json
{
  "session": {
    "id": "uuid",
    "status": "active",
    "userAId": "uuid",
    "userBId": "uuid"
  },
  "topic": {
    "id": "uuid",
    "name": "Education"
  },
  "participants": [
    {
      "id": "uuid",
      "displayName": "An",
      "band": 6.5,
      "role": "A"
    }
  ],
  "turns": [
    {
      "id": "uuid",
      "turnIndex": 1,
      "speakerId": "uuid",
      "speakerRole": "A",
      "questionId": "uuid",
      "partNumber": 1,
      "questionText": "Do you work or study?",
      "cueCard": null,
      "durationMs": 45000,
      "prepDurationMs": 0
    }
  ]
}
```

### `GET /api/questions/session`

Endpoint cũ này chỉ được dùng tạm nếu chưa có session persistence. Khi đã có `sessions` và `turns`, ưu tiên `GET /api/sessions/:sessionId`.

### `POST /api/audio/upload`

Upload audio của chính user cho một speaking turn. Request dùng `multipart/form-data`.

Fields:

| Field | Type | Bắt buộc | Mô tả |
|---|---|---:|---|
| `audio` | File | Có | File `audio/webm` của turn hiện tại |
| `turnId` | string | Có | ID của speaking turn |
| `sessionId` | string | Có | ID phiên luyện tập |
| `speakerId` | string | Có | ID user đang upload audio của chính mình |
| `questionId` | string | Có | ID câu hỏi của turn |
| `durationMs` | number | Có | Thời lượng audio |

Response thành công:

```json
{
  "turnId": "uuid",
  "audioUrl": "/uploads/audio/turn-id.webm",
  "status": "uploaded",
  "aiStatus": "pending"
}
```

Nếu cả hai user đã hoàn tất review trước đó, upload endpoint có thể bắt đầu AI ngay và trả `aiStatus: "processing"`. Nếu chưa, chỉ lưu audio và trả `aiStatus: "pending"`. Frontend chuyển sang màn hình loading/result và poll `GET /api/results/:sessionId?userId=...`.

### `POST /api/peer-notes/batch`

Gửi ghi chú mà listener đã đánh dấu cho các turn của đối phương. Endpoint này tách riêng khỏi upload audio vì user chỉ upload audio của chính mình.

Request:

```json
{
  "sessionId": "uuid",
  "listenerId": "uuid",
  "notes": [
    {
      "clientNoteId": "uuid",
      "turnId": "uuid",
      "timestampMs": 12345,
      "errorType": "pronunciation",
      "noteText": "Âm cuối chưa rõ"
    }
  ]
}
```

Response:

```json
{
  "saved": 1
}
```

`clientNoteId` là bắt buộc. Client generate bằng `crypto.randomUUID()` khi note được tạo. Server dùng unique constraint `(listener_id, turn_id, client_note_id)` để retry request không tạo duplicate.

### `POST /api/review/complete`

Đánh dấu một user đã hoàn tất review peer notes.

Request:

```json
{
  "sessionId": "uuid",
  "userId": "uuid"
}
```

Response:

```json
{
  "sessionId": "uuid",
  "userId": "uuid",
  "bothCompleted": false
}
```

Nếu `bothCompleted` là `false`, frontend hiển thị trạng thái chờ đối tác. Khi cả hai hoàn tất, backend kiểm tra audio upload: nếu tất cả turns cần chấm đã upload thì chuyển session sang `processing`; nếu còn thiếu audio thì giữ `reviewing` và chờ các upload còn lại.

`POST /api/review/complete` không thay thế `POST /api/peer-notes/batch`. Frontend phải submit peer notes trước, sau đó mới gọi review complete. Nếu không có note nào, vẫn gọi review complete với session/user tương ứng.

### `GET /api/results/:sessionId`

Trả kết quả AI và peer notes cho màn hình kết quả.

Query:

| Query | Bắt buộc | Mô tả |
|---|---:|---|
| `userId` | Có | User đang xem kết quả của chính mình |

Response tối thiểu:

```json
{
  "sessionId": "uuid",
  "status": "processing",
  "turnResults": [
    {
      "turnId": "uuid",
      "questionText": "Do you work or study?",
      "audioUrl": "/api/turns/turn-id/audio",
      "aiStatus": "completed",
      "transcript": "I am currently studying...",
      "scores": {
        "fluency": 6.0,
        "lexical": 6.5,
        "grammar": 6.0,
        "pronunciation": 5.5
      },
      "pronunciationDetail": [],
      "aiFeedback": {},
      "peerNotes": [
        {
          "timestampMs": 12345,
          "errorType": "pronunciation",
          "noteText": "Âm cuối chưa rõ"
        }
      ],
      "error": null
    }
  ]
}
```

---

## Session Lifecycle

Backend là nguồn sự thật cho `sessions.status`. Frontend không tự quyết định trạng thái session ngoài việc gọi đúng socket/API.

| Transition | Trigger | Backend xử lý |
|---|---|---|
| `matched` | Hai user được ghép cặp | Tạo `users`, `sessions`, `turns`; emit `matched` |
| `matched → active` | Cả hai client emit `peer_connected` — nghĩa là WebRTC đã thật sự `connected`, không phải vừa bấm nút sẵn sàng; backend emit `session_start` | Set `started_at = NOW()`, `status = 'active'` |
| `active → reviewing` | Client bắt đầu gửi upload audio hoặc peer notes sau khi session luyện nói kết thúc | Set `status = 'reviewing'` nếu session đang `active` |
| `reviewing → processing` | Cả hai user đã `review/complete` và tất cả turns cần chấm đã upload audio | Bắt đầu AI pipeline cho các turns có audio |
| `processing → completed` | Mọi `ai_results` của session đã ở trạng thái terminal `completed` hoặc `failed` | Set `ended_at = NOW()`, `status = 'completed'` |
| `matched/active → abandoned` | Một user disconnect **khi phần luyện nói chưa xong** (room chưa ở phase `done`) | Emit `partner_disconnected`, set `ended_at = NOW()`, `status = 'abandoned'` |

**`reviewing` không bao giờ bị chuyển thành `abandoned`.** Phiên đã luyện và đã
ghi âm xong, hai người chỉ còn đánh dấu lỗi cho nhau. Huỷ ở đây là vứt bỏ công
sức đã hoàn thành: `review/complete` từ chối phiên `abandoned` nên không ai kết
thúc được, và AI — vốn chỉ chạy khi cả hai đã đánh giá xong — không bao giờ chạy.
Chỉ cần một người bấm F5 là đủ kích hoạt.

Upload audio có thể xảy ra trong review phase. Thứ tự frontend khuyến nghị:

1. Vừa vào review: upload audio của chính mình ở background.
2. User review audio đối phương và bổ sung notes.
3. Frontend gọi `POST /api/peer-notes/batch`.
4. Frontend gọi `POST /api/review/complete`.
5. Backend chỉ chạy AI khi cả hai đã complete review và audio cần thiết đã upload.

Nếu một số turn upload fail, session không được chuyển `processing` cho đến khi user retry thành công hoặc backend có rule bỏ qua turn đó. MVP ưu tiên yêu cầu retry upload.

---

## AI Pipeline và gotchas

### Whisper

- SDK: `openai`.
- Method: `openai.audio.transcriptions.create`.
- Model: `whisper-1`.
- Input: WAV 16kHz mono.
- **Giới hạn file 25MB.** Kiểm tra size trước khi gửi và log cảnh báo nếu gần giới hạn.
- Whisper có thể sửa lỗi theo ngữ cảnh (đoán từ đúng khi phát âm sai). Không dùng Whisper một mình để kết luận phát âm đúng/sai — đây là lý do phải dùng kết hợp với Azure.
- Dùng Whisper transcript làm reference text cho Azure là lựa chọn thực dụng cho MVP, không phải ground truth tuyệt đối. Không hiển thị kết luận kiểu "AI chắc chắn đúng 100%" cho người dùng.

### Azure Pronunciation Assessment

- Package: `microsoft-cognitiveservices-speech-sdk`.
- Dùng Whisper transcript làm reference text.
- Với audio ngắn dưới 30 giây, có thể dùng chế độ once/short recognition và bật `enableMiscue: true` nếu SDK hỗ trợ trong flow đó.
- Với turn dài hơn 30 giây (Part 1, Part 2, Part 3 của app đều có thể vượt 30 giây), dùng continuous pronunciation assessment. Lưu ý continuous mode có giới hạn/caveat với miscue; nếu `enableMiscue` không hoạt động trong continuous mode, MVP chấp nhận lưu omission/insertion bằng cách so sánh transcript/reference ở mức đơn giản hoặc bỏ qua miscue chi tiết.
- Output cần ưu tiên:
  - Word-level accuracy.
  - Phoneme-level score.
  - Fluency score.
  - Prosody score nếu API trả về.

**Azure Speech SDK là CommonJS.** Trong project ESM, bắt buộc dùng `createRequire`:

```js
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const sdk = require('microsoft-cognitiveservices-speech-sdk');
```

Không import trực tiếp bằng `import sdk from 'microsoft-cognitiveservices-speech-sdk'` — sẽ lỗi.

### OpenAI IELTS Feedback

- Package: `openai`.
- Dùng OpenAI text model để đánh giá grammar, vocabulary, fluency/coherence và tạo feedback tiếng Việt.
- Input: transcript từ OpenAI transcription, Azure pronunciation scores/details, câu hỏi gốc, cue card nếu có, peer notes, part number và duration.
- Output nên dùng Structured Outputs/JSON schema để trả về ổn định:
  - band score 4 tiêu chí.
  - scoring metrics cho backend rubric.
  - nhận xét và gợi ý bằng tiếng Việt.
  - lỗi grammar/vocabulary/coherence nổi bật, có ví dụ sửa nếu đủ dữ liệu.
- Không dùng OpenAI text model để thay thế Azure ở phần phoneme/word-level pronunciation detail.
- Có thể gặp rate limit hoặc lỗi model. Trong MVP, chỉ cần xử lý lỗi rõ ràng và trả `{ error: "..." }`. Không làm retry phức tạp trừ khi user yêu cầu.

---

## Timer Sync

Dùng event `session_start` từ server làm tín hiệu bắt đầu chung. Ở frontend, dùng `performance.now()` tại thời điểm nhận event để tính elapsed time trong tab hiện tại. Không dùng `Date.now() - serverTimestamp` để tính note timestamp vì clock của client và server có thể lệch.

Có 2 loại mốc thời gian:

- `sessionElapsedMs`: tính từ lúc client nhận `session_start`, dùng để điều khiển UI tổng thể/debug.
- `turnElapsedMs`: tính từ lúc turn hiện tại bắt đầu trên client, dùng cho `peer_notes.timestamp_ms` và seek audio review.

Vì audio được ghi thành từng Blob theo `turnId`, peer note bắt buộc lưu timestamp relative to turn. Khi review:

```js
audioElement.currentTime = note.timestampMs / 1000;
```

Không dùng timestamp tính từ đầu session để seek vào audio của một turn riêng lẻ.

```js
socket.on('session_start', ({ timestamp }) => {
  const serverStartTime = timestamp; // Date.now() từ server, dùng để hiển thị/debug nếu cần
  const sessionStartLocalTime = performance.now();

  // Khi bắt đầu mỗi turn:
  // currentTurnStartLocalTime = performance.now()

  // Khi listener bấm TAB trong turn:
  // timestamp_ms = performance.now() - currentTurnStartLocalTime
});
```

---

## Listener UI — TAB Workflow

```text
Trạng thái: ĐANG NGHE, timeline đang chạy
  TAB
    → capture timestamp_ms = performance.now() - currentTurnStartLocalTime
    → hiện popup nhỏ chọn loại lỗi

Chọn loại lỗi (phím số):
  1: Pronunciation
  2: Grammar
  3: Vocabulary
  4: Fluency

Sau khi chọn:
  → hiện input ghi note ngắn
  Enter  : lưu note_text, đóng popup
  Escape : bỏ qua note_text, vẫn lưu marker + error_type
  → quay lại trạng thái ĐANG NGHE
```

Popup phải nhỏ, không làm người nghe rời khỏi màn hình chính. Mục tiêu là đánh dấu nhanh, không bắt người nghe viết đầy đủ ngay lúc đang nghe.

---

## Database Schema

```sql
-- Người dùng (đơn giản, auth đầy đủ làm sau MVP)
CREATE TABLE users (
  id           UUID PRIMARY KEY,
  display_name VARCHAR(100) NOT NULL,
  band         DECIMAL(2,1),           -- band tự khai báo, ví dụ 6.5
  created_at   TIMESTAMP DEFAULT NOW(),
  CHECK (band IS NULL OR (band >= 0 AND band <= 9))
);

-- Ngân hàng chủ đề
CREATE TABLE topics (
  id   UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL           -- ví dụ: "Education", "Technology"
);

-- Câu hỏi theo topic và part
CREATE TABLE questions (
  id            UUID PRIMARY KEY,
  topic_id      UUID REFERENCES topics(id),
  part_number   SMALLINT NOT NULL,     -- 1, 2, 3
  question_text TEXT NOT NULL,
  cue_card      JSONB,                 -- chỉ Part 2: { prompt, bullet_points[] }
  CHECK (part_number IN (1, 2, 3))
);
CREATE INDEX idx_questions_topic_id ON questions(topic_id);

-- Phiên luyện tập
CREATE TABLE sessions (
  id                     UUID PRIMARY KEY,
  room_id                VARCHAR(100),             -- Socket.IO room id hiện tại, dùng để debug/map runtime nếu cần
  user_a_id              UUID REFERENCES users(id),
  user_b_id              UUID REFERENCES users(id),
  topic_id               UUID REFERENCES topics(id),
  status                 VARCHAR(20) DEFAULT 'matched',
  user_a_review_done_at  TIMESTAMP,
  user_b_review_done_at  TIMESTAMP,
  started_at             TIMESTAMP,
  ended_at               TIMESTAMP,
  created_at             TIMESTAMP DEFAULT NOW(),
  CHECK (status IN ('matched', 'active', 'reviewing', 'processing', 'completed', 'abandoned'))
);
CREATE INDEX idx_sessions_user_a_id ON sessions(user_a_id);
CREATE INDEX idx_sessions_user_b_id ON sessions(user_b_id);

-- Từng lượt nói (mỗi câu hỏi = 2 turns: A nói + B nói)
CREATE TABLE turns (
  id               UUID PRIMARY KEY,
  session_id       UUID REFERENCES sessions(id),
  speaker_id       UUID REFERENCES users(id),
  speaker_role     VARCHAR(1) NOT NULL,       -- 'A' | 'B'
  question_id      UUID REFERENCES questions(id),
  part_number      SMALLINT NOT NULL,
  turn_index       INTEGER NOT NULL,           -- thứ tự toàn session, bắt đầu từ 1
  duration_ms      INTEGER NOT NULL,
  prep_duration_ms INTEGER DEFAULT 0,
  audio_url        VARCHAR(500),               -- path đến file audio sau khi upload
  upload_status    VARCHAR(20) DEFAULT 'pending',
  created_at       TIMESTAMP DEFAULT NOW(),
  UNIQUE (session_id, turn_index),
  CHECK (speaker_role IN ('A', 'B')),
  CHECK (part_number IN (1, 2, 3)),
  CHECK (duration_ms > 0),
  CHECK (prep_duration_ms >= 0),
  CHECK (upload_status IN ('pending', 'uploaded', 'failed'))
);
CREATE INDEX idx_turns_session_id  ON turns(session_id);
CREATE INDEX idx_turns_speaker_id  ON turns(speaker_id);

-- Ghi chú của listener trong lúc nghe
CREATE TABLE peer_notes (
  id             UUID PRIMARY KEY,
  turn_id        UUID REFERENCES turns(id),
  listener_id    UUID REFERENCES users(id),
  client_note_id VARCHAR(100) NOT NULL,     -- id từ client để chống duplicate khi retry
  timestamp_ms   INTEGER NOT NULL,          -- mốc thời gian relative to turn, không phải đầu session
  error_type     VARCHAR(20) NOT NULL,      -- 'pronunciation' | 'grammar' | 'vocabulary' | 'fluency'
  note_text      TEXT,                      -- có thể null nếu bỏ qua khi nghe
  created_at     TIMESTAMP DEFAULT NOW(),
  CHECK (timestamp_ms >= 0),
  CHECK (error_type IN ('pronunciation', 'grammar', 'vocabulary', 'fluency')),
  UNIQUE (listener_id, turn_id, client_note_id)
);
CREATE INDEX idx_peer_notes_turn_id ON peer_notes(turn_id);

-- Kết quả AI cho từng turn
CREATE TABLE ai_results (
  id                   UUID PRIMARY KEY,
  turn_id              UUID UNIQUE REFERENCES turns(id),  -- mỗi turn chỉ có 1 ai_result
  status               VARCHAR(20) DEFAULT 'processing',
  whisper_transcript   TEXT,
  fluency_score        DECIMAL(3,1),
  lexical_score        DECIMAL(3,1),
  grammar_score        DECIMAL(3,1),
  pronunciation_score  DECIMAL(3,1),
  pronunciation_detail JSONB,         -- word-level từ Azure
  ai_feedback          JSONB,         -- nhận xét + gợi ý từ OpenAI text model
  error_message        TEXT,
  created_at           TIMESTAMP DEFAULT NOW(),
  updated_at           TIMESTAMP DEFAULT NOW(),
  CHECK (status IN ('processing', 'completed', 'failed'))
);
```

PostgreSQL không tự cập nhật `updated_at`. MVP không cần trigger riêng; backend phải set `updated_at = NOW()` tường minh trong mọi câu `UPDATE ai_results ...`.

---

## Edge Cases cần xử lý

### User không cấp quyền camera/microphone

- Hiển thị lỗi tiếng Việt rõ ràng và cho phép thử lại.
- Không emit `device_ready` nếu chưa có local media stream cần thiết.
- Emit `device_failed` chứ **không** ngắt socket. Ngắt socket khiến đối tác nhận
  `partner_disconnected` và đi tìm lỗi mạng, trong khi nguyên nhân thật là micro
  bên này chưa được cấp quyền.
- Nếu MVP chỉ cần audio, video permission fail không được làm hỏng audio flow.

### WebRTC không kết nối được

- Server có timeout riêng 45s kể từ `begin_signaling`; hết hạn thì emit
  `webrtc_failed` cho cả hai. Đây là event riêng, không dùng chung với
  `partner_disconnected`.
- Nếu ICE state là `failed`, `disconnected` quá lâu, hoặc không nhận remote track sau một timeout hợp lý, hiển thị lỗi và cho phép user quay lại tìm đối tác.
- Local development chấp nhận chỉ dùng STUN. Không tự thêm TURN production nếu user chưa xác nhận.

### MediaRecorder không hỗ trợ MIME type

- Kiểm tra `MediaRecorder.isTypeSupported('audio/webm;codecs=opus')`.
- Nếu không hỗ trợ, fallback sang MIME type browser hỗ trợ.
- Nếu browser không hỗ trợ MediaRecorder, hiển thị lỗi rõ ràng.

### Disconnect giữa session

- Nếu một người disconnect trong Phase 3 (đang nói): emit `partner_disconnected`, kết thúc session phía client còn lại.
- Audio đã ghi đến thời điểm đó: giữ lại, không xóa tự động.
- Không tự động ghép lại với người mới.

### Timer hết mà người nghe chưa xong note

- Timer hết → tự động chuyển vai (dù popup đang mở).
- Note đang gõ dở: lưu luôn phần đã gõ, không mất dữ liệu.

### Review phase: một người bấm "Hoàn tất" trước

- Hiển thị "Đang chờ đối tác hoàn tất..." phía người xong trước.
- Không bắt buộc đủ 5 phút, user có thể hoàn tất sớm.

### Upload audio thất bại

- Hiển thị lỗi rõ ràng, cho phép retry.
- Không mất peer notes đã lưu khi upload thất bại.
- Nếu chỉ một số turn upload fail, giữ trạng thái theo từng turn; không bắt user upload lại toàn bộ session.

### AI pipeline thất bại một phần

- Nếu OpenAI transcription thành công nhưng Azure hoặc OpenAI feedback fail, lưu `ai_results.status = 'failed'` kèm `error_message`.
- Không xóa audio đã upload khi AI fail.
- Results page hiển thị turn nào đang `processing`, turn nào `failed`, và cho phép retry nếu endpoint retry được implement.

### Refresh hoặc đóng tab trong review

- Remote audio Blob có thể mất vì không upload server trong MVP.
- Peer notes đã lưu trong state trước khi submit có thể mất nếu chưa gửi server. Cần cảnh báo user khi rời trang trong review nếu còn note chưa submit.

### Retry peer notes

- `POST /api/peer-notes/batch` phải xử lý duplicate bằng `clientNoteId`.
- Retry request không được tạo nhiều note giống nhau.

---

## Trạng thái hiện tại

### Đã có trong repo

- [x] Project init backend + frontend.
- [x] `backend/server.js` — HTTP server + Socket.IO setup.
- [x] `backend/src/app.js` — Express app.
- [x] `backend/src/socket/index.js` — matchmaking + signaling server hiện tại.
- [x] `docker-compose.yml` — PostgreSQL + Redis local.
- [x] `backend/src/config/db.js` — PostgreSQL connection pool cơ bản.
- [x] `backend/src/config/redis.js` — Redis client cơ bản.

### Cần làm tiếp theo (theo thứ tự ưu tiên)

- [ ] Kiểm tra lại env và fallback config cho PostgreSQL/Redis.
- [ ] Frontend: WebRTC P2P connection dựa trên socket events hiện có.
- [ ] Frontend: MediaRecorder theo từng turn cho local + remote audio.
- [ ] Frontend: Session flow UI với câu hỏi, timer, luân phiên.
- [ ] Frontend: Listener UI + TAB workflow + timeline marker.
- [ ] Frontend: Review phase + playback seek theo marker.
- [ ] Backend: Audio upload endpoint + ffmpeg conversion.
- [ ] Backend: AI pipeline OpenAI transcription → Azure → OpenAI feedback.
- [ ] Backend: Lưu session, notes, results vào PostgreSQL.
- [ ] Frontend: Results page.

### Chỉ làm sau MVP khi user xác nhận

- [ ] Auth đầy đủ.
- [ ] Role giáo viên.
- [ ] Teacher dashboard.
- [ ] Quản lý topic/question bằng UI.
- [ ] Public conversation.
- [ ] Band placement test.
- [ ] Production WebRTC TURN infrastructure.
