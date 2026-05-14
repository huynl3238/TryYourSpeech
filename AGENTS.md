# AGENTS.md — IELTS Speaking Practice App

## Tổng quan dự án

Ứng dụng luyện IELTS Speaking trực tuyến theo mô hình ghép cặp 2 học viên. Hai người vào cùng một phiên luyện nói, thay phiên nhau trả lời câu hỏi theo format IELTS Speaking. Khi một người nói, người còn lại lắng nghe và đánh dấu lỗi theo mốc thời gian để review sau.

Hệ thống tích hợp AI **sau phiên luyện** để:
- Chuyển audio thành transcript bằng OpenAI Whisper.
- Chấm phát âm chi tiết bằng Azure Pronunciation Assessment.
- Đánh giá ngữ pháp, từ vựng, fluency và gợi ý cải thiện bằng Gemini.

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
13. Server xử lý AI pipeline: Whisper → Azure → Gemini.
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

- OpenAI Whisper API: transcription, dùng làm reference text.
- Azure Cognitive Services Speech SDK: Pronunciation Assessment ở word/phoneme level.
- Gemini 1.5 Flash (`@google/generative-ai`): grammar, vocabulary, IELTS band feedback bằng tiếng Việt.

### Local Infrastructure

- Docker Compose: PostgreSQL + Redis.
- Backend và frontend chạy trực tiếp bằng `npm run dev`.

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
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=
GEMINI_API_KEY=

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
| `peer_connected` | — | WebRTC P2P đã kết nối thành công |

### Server → Client

| Event | Data | Mô tả |
|---|---|---|
| `waiting` | — | Đang chờ đối tác |
| `matched` | `{ roomId, isInitiator, partnerName }` | Đã ghép cặp |
| `signal` | `{ type, payload }` | Relay từ đối tác |
| `session_start` | `{ timestamp }` | Cả hai ready, bắt đầu session |
| `partner_disconnected` | — | Đối tác mất kết nối |

### `signal.type` values
- `offer` — WebRTC offer SDP
- `answer` — WebRTC answer SDP
- `ice-candidate` — ICE candidate

Không tự tưởng tượng socket event mới nếu chưa đối chiếu file này.

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

Matchmaking ban đầu dùng FIFO đơn giản. Nếu thêm rule theo band, chỉ áp dụng rule đơn giản:
- Ưu tiên ghép người chênh nhau từ 1 đến 2 band.
- Nếu hàng đợi ít người, có thể nới lỏng điều kiện sau một khoảng chờ.

Không làm bài test đầu vào tự động nếu user chưa xác nhận.

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

### Phase 4 — Review

Sau khi luyện nói xong, mỗi người nghe lại audio của đối phương trong tối đa 5 phút:
- Có thể click marker để seek đến mốc lỗi.
- Có thể bổ sung note chi tiết.
- Bấm "Hoàn tất" để gửi đánh giá cho đối phương.

Remote audio chỉ dùng local để review, không upload trong MVP.

### Phase 5 — AI chấm điểm

Sau khi user hoàn tất review, client upload audio của chính mình theo từng `turn`. Server xử lý mỗi turn độc lập:

1. Nhận `audio/webm`.
2. Convert sang WAV 16kHz mono bằng `fluent-ffmpeg`.
3. Gửi WAV cho Whisper để lấy transcript.
4. Gửi WAV + transcript cho Azure Pronunciation Assessment.
5. Gửi transcript + Azure scores + câu hỏi + peer notes cho Gemini.
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

### Audio conversion server-side

1. Client upload `audio/webm` của một turn lên `POST /api/audio/upload`.
2. Server nhận bằng `multer`.
3. Server validate `turnId`, `sessionId`, `speakerId`, `questionId` và quyền upload.
4. Lưu file tạm vào temp directory.
5. Convert bằng `fluent-ffmpeg` sang WAV: 16kHz, mono, `pcm_s16le`.
6. Gửi WAV cho AI services.
7. Xóa file tạm `.webm` và `.wav` sau khi xử lý xong.

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

### `GET /api/questions/session`

Trả một bộ câu hỏi IELTS cho một session luyện nói. MVP lấy từ dữ liệu seed trong PostgreSQL.

Response:

```json
{
  "topic": {
    "id": "uuid",
    "name": "Education"
  },
  "questions": [
    {
      "id": "uuid",
      "partNumber": 1,
      "questionText": "Do you work or study?",
      "cueCard": null
    }
  ]
}
```

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
  "status": "processing"
}
```

Nếu xử lý AI đồng bộ trong MVP, có thể trả thêm `aiResult`. Nếu xử lý async, frontend cần có trạng thái loading và retry hợp lý.

### `POST /api/peer-notes/batch`

Gửi ghi chú mà listener đã đánh dấu cho các turn của đối phương. Endpoint này tách riêng khỏi upload audio vì user chỉ upload audio của chính mình.

Request:

```json
{
  "sessionId": "uuid",
  "listenerId": "uuid",
  "notes": [
    {
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
- Bật `enableMiscue: true` để phát hiện từ bị bỏ hoặc thêm.
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

### Gemini

- Package: `@google/generative-ai`.
- Model: `gemini-1.5-flash`.
- Input: transcript + Azure scores + câu hỏi gốc + peer notes.
- Output: band score 4 tiêu chí, nhận xét và gợi ý bằng tiếng Việt.
- Free tier có thể gặp rate limit 429. Trong MVP, chỉ cần xử lý lỗi rõ ràng và trả `{ error: "..." }`. Không làm retry phức tạp trừ khi user yêu cầu.

---

## Timer Sync

Dùng event `session_start` từ server làm tín hiệu bắt đầu chung. Ở frontend, dùng `performance.now()` tại thời điểm nhận event để tính elapsed time trong tab hiện tại. Không dùng `Date.now() - serverTimestamp` để tính note timestamp vì clock của client và server có thể lệch.

```js
socket.on('session_start', ({ timestamp }) => {
  const serverStartTime = timestamp; // Date.now() từ server, dùng để hiển thị/debug nếu cần
  const sessionStartLocalTime = performance.now();

  // Khi listener bấm TAB:
  // timestamp_ms = performance.now() - sessionStartLocalTime

  // Khi review seek audio:
  // audioElement.currentTime = note.timestamp_ms / 1000
});
```

---

## Listener UI — TAB Workflow

```text
Trạng thái: ĐANG NGHE, timeline đang chạy
  TAB
    → capture timestamp_ms = performance.now() - sessionStartLocalTime
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
  created_at   TIMESTAMP DEFAULT NOW()
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
  cue_card      JSONB                  -- chỉ Part 2: { prompt, bullet_points[] }
);
CREATE INDEX idx_questions_topic_id ON questions(topic_id);

-- Phiên luyện tập
CREATE TABLE sessions (
  id          UUID PRIMARY KEY,
  user_a_id   UUID REFERENCES users(id),
  user_b_id   UUID REFERENCES users(id),
  topic_id    UUID REFERENCES topics(id),
  status      VARCHAR(20) DEFAULT 'active',  -- 'active' | 'reviewing' | 'completed'
  started_at  TIMESTAMP DEFAULT NOW(),
  ended_at    TIMESTAMP
);
CREATE INDEX idx_sessions_user_a_id ON sessions(user_a_id);
CREATE INDEX idx_sessions_user_b_id ON sessions(user_b_id);

-- Từng lượt nói (mỗi câu hỏi = 2 turns: A nói + B nói)
CREATE TABLE turns (
  id          UUID PRIMARY KEY,
  session_id  UUID REFERENCES sessions(id),
  speaker_id  UUID REFERENCES users(id),
  question_id UUID REFERENCES questions(id),
  part_number SMALLINT NOT NULL,
  audio_url   VARCHAR(500),           -- path đến file audio sau khi upload
  duration_ms INTEGER,
  created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_turns_session_id  ON turns(session_id);
CREATE INDEX idx_turns_speaker_id  ON turns(speaker_id);

-- Ghi chú của listener trong lúc nghe
CREATE TABLE peer_notes (
  id           UUID PRIMARY KEY,
  turn_id      UUID REFERENCES turns(id),
  listener_id  UUID REFERENCES users(id),
  timestamp_ms INTEGER NOT NULL,      -- mốc thời gian trên timeline
  error_type   VARCHAR(20) NOT NULL,  -- 'pronunciation' | 'grammar' | 'vocabulary' | 'fluency'
  note_text    TEXT,                  -- có thể null nếu bỏ qua khi nghe
  created_at   TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_peer_notes_turn_id ON peer_notes(turn_id);

-- Kết quả AI cho từng turn
CREATE TABLE ai_results (
  id                   UUID PRIMARY KEY,
  turn_id              UUID UNIQUE REFERENCES turns(id),  -- mỗi turn chỉ có 1 ai_result
  whisper_transcript   TEXT,
  fluency_score        DECIMAL(3,1),
  lexical_score        DECIMAL(3,1),
  grammar_score        DECIMAL(3,1),
  pronunciation_score  DECIMAL(3,1),
  pronunciation_detail JSONB,         -- word-level từ Azure
  gemini_feedback      JSONB,         -- nhận xét + gợi ý từ Gemini
  created_at           TIMESTAMP DEFAULT NOW()
);
```

---

## Edge Cases cần xử lý

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
- [ ] Backend: AI pipeline Whisper → Azure → Gemini.
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
