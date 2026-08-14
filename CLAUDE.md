# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read these first

- **`AGENTS.md`** — the authoritative spec: product principles, MVP scope, mandatory coding rules, socket/API contracts, DB schema, AI pipeline gotchas, and per-phase app flow. It is detailed and written in Vietnamese; treat it as the source of truth and consult the relevant section before implementing a feature.
- **`PROJECT.md`** — the "why" behind key technical decisions (Whisper+Azure split, TAB-based error marking, backend-as-source-of-truth, band matching, timer sync).

When a requested feature is outside MVP scope or its approach isn't already specified in `AGENTS.md`, the project rule (AGENTS.md "Quy tắc khi đề xuất giải pháp") is to **propose 2–3 approaches with a recommendation and wait for confirmation before coding** — do not silently pick one.

## What this app is

A peer-to-peer IELTS Speaking practice app. Two learners are matched by band level, connect over WebRTC, and take turns answering IELTS questions while the listener marks errors in real time (keyboard-driven, TAB + number keys). After practice, each user's own audio is uploaded and run through an AI pipeline (OpenAI transcription → Azure pronunciation assessment → OpenAI IELTS feedback), combined with the peer's notes to produce results. Backend is the source of truth for session/turn IDs; Socket.IO only handles realtime matchmaking and WebRTC signaling.

## Commands

Infra (Postgres + Redis) must be up before the backend runs:

```bash
docker compose up -d          # from repo root: postgres:5432, redis:6379
```

Backend (`cd backend`):

```bash
npm run dev                   # nodemon server.js (port 3001)
npm start                     # node server.js
npm test                      # node --test (runs backend/test/*.test.js)
node --test test/socket.test.js   # run a single test file
npm run db:migrate            # apply src/db/schema.sql
npm run db:seed               # questions.sql (bộ đề) + seed.sql (dữ liệu minh hoạ) — chỉ dùng khi dev
npm run db:seed:questions     # chỉ questions.sql — lệnh dùng trên server thật
npm run db:reset              # drop + recreate + seed
```

Frontend (`cd frontend`):

```bash
npm run dev                   # vite dev server on 0.0.0.0:5173, proxies /api and /socket.io to :3001
npm run build
npm run preview
```

There is no linter configured. Backend uses Node's built-in test runner (no test framework dependency).

## Environment

Backend reads `backend/.env` (`process.env.X`); frontend reads `import.meta.env.VITE_X`. See `AGENTS.md` "Environment Variables" for the full list. Key points:
- Core transcription and holistic scoring require `OPENAI_API_KEY`. Azure credentials are optional and add word/phoneme pronunciation detail; an Azure failure must not block the OpenAI result. `GET /api/health` reports both required and optional config status.
- Sign-in needs `JWT_SECRET` + `GOOGLE_CLIENT_ID` (and `VITE_GOOGLE_CLIENT_ID` on the frontend). Email + password sign-in additionally needs `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL` — without them those endpoints return 503 and only Google sign-in works. `/api/health` reports `auth` and `email` the same way it reports `ai`.
- Audio upload + AI assessment is gated behind `AI_AUDIO_UPLOAD_ENABLED=true` (returns 503 otherwise) — currently used to test the video-call flow without AI.
- Frontend never reads ICE/TURN config directly; it fetches it from `GET /api/config`. `ICE_SERVERS` is a JSON array of TURN servers (empty locally; STUN is always added by the backend).

## Architecture

### Backend (`backend/src`, ESM, no TypeScript)

- `server.js` → `app.js`: Express app wiring, `/health`, and `/api` routes; `server.js` also creates the Socket.IO server and tests DB/Redis on boot. There is deliberately no static mount for `/uploads/audio` — recordings are served only by `GET /api/turns/:turnId/audio`, which checks who is asking (see `AGENTS.md` "Nghe lại audio").
- `socket/index.js`: **the entire realtime layer.** In-memory `waitingQueue`, `rooms`, and `userRoom` maps drive band-difference matchmaking (`MAX_BAND_DIFFERENCE = 1.0`), WebRTC signal relaying, ready-state tracking, `session_start`/`practice_start` broadcasts, and disconnect/abandon handling. Read this file before touching anything socket-, matchmaking-, room-, or signaling-related. Do not use `socket.id` as a DB user id.
- `routes/index.js`: all HTTP endpoints (config, health, sessions, results + retry, audio upload, peer-notes batch, review complete). Heavy input validation (UUID regex, payload shape) lives here; audio upload does a safe temp→final file swap with backup/restore on failure.
- `models/`: DB access + orchestration layer over PostgreSQL. Session lifecycle, turns, audio-upload status, peer reviews, AI results, and the AI pipeline are each their own model module.
- `services/`: external integrations — `azurePronunciationAssessment.js` (Azure SDK), `ieltsRubricScoring.js` (band scoring), `audioConversion.js` (ffmpeg WebM/MP4/Ogg→WAV).
- `db/`: `schema.sql`, `seed.sql`, and the migrate/seed/reset scripts.

**Azure Speech SDK is CommonJS.** In this ESM project it must be loaded via `createRequire(import.meta.url)` — never a direct `import` (see `services/azurePronunciationAssessment.js` and `config/ai.js`). Azure uses continuous pronunciation assessment for turns >30s.

### Frontend (`frontend/src`, React 18 + Vite + Tailwind v4)

- Routing via `react-router-dom`; pages in `pages/` map to the app phases (Home → DeviceCheck → Lobby → Session → Review → WaitingAI → Results).
- `context/SessionContext.jsx`: shared session state across pages.
- `hooks/`: `useSocket` (Socket.IO client), `useWebRTC` (peer connection from `/api/config` ICE servers), `useMediaRecorder` (per-turn audio Blobs).
- `services/`: `socket.js` and `api.js` client wrappers.
- `components/session/` holds the speaker/listener/prep/transition views; `components/ui/` are shadcn-style primitives. Import alias `@` → `frontend/src`.

### Data & timing model (easy to get wrong)

- Audio is recorded as one Blob **per turn** (`turnId`). The user's own audio is uploaded in the background during the review phase; the **remote** peer's audio is recorded client-side only and never uploaded (lost on tab close).
- Peer-note `timestampMs` is **relative to the start of its turn**, not the session, so review can seek with `audioElement.currentTime = note.timestampMs / 1000`. Use `performance.now()` (not `Date.now() - serverTimestamp`) to derive elapsed time from the `session_start` event.
- Session lifecycle states: `matched → active → reviewing → processing → completed`, or `abandoned` on early disconnect. AI does not run until peer review is complete (feedback needs the peer notes as input).

## Conventions (from AGENTS.md)

- Timestamps: UTC, stored as `TIMESTAMP` (not `TIMESTAMPTZ`).
- UUIDs: generated in backend with `crypto.randomUUID()`; pass `id` explicitly on insert (don't rely on `gen_random_uuid()`).
- Error responses: `{ error: "message" }`. Logging: `console.log` info / `console.warn` warnings / `console.error` real errors only.
- `async/await` only (no `.then()` chains); ESM `import/export` (`require` only where forced, e.g. Azure SDK).
- User-facing UI text and error messages are in Vietnamese.
