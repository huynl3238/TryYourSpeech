# Try Your Speech

Try Your Speech is a web application for Vietnamese IELTS learners to practise Speaking with a real partner. Two learners are matched by band level, take timed turns answering IELTS questions, mark mistakes while listening, and receive peer and AI-assisted feedback after the session.

## Highlights

- Band-based partner matching with manual invitations or random matching
- Peer-to-peer audio/video calls using WebRTC and Socket.IO signalling
- Synchronized IELTS Speaking Part 1, 2, and 3 timers
- Timestamped peer notes for pronunciation, grammar, vocabulary, and fluency
- Per-turn audio recording and protected playback
- Post-session transcription, pronunciation assessment, and IELTS feedback
- Practice history, classroom sharing, mentor sessions, and role-based administration

## Tech stack

- **Frontend:** React, Vite, Tailwind CSS, Socket.IO Client, WebRTC, MediaRecorder
- **Backend:** Node.js, Express, Socket.IO, PostgreSQL, Redis
- **AI:** OpenAI transcription and feedback, optional Azure Pronunciation Assessment
- **Testing:** Node.js test runner

## Run locally

Requirements: Node.js 20+, npm, Docker, and Docker Compose.

```bash
git clone <repository-url>
cd try-your-speech
docker compose up -d

cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

cd backend
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Set `JWT_SECRET` and configure either Google OAuth or email delivery in `backend/.env` before signing in. AI grading is optional and stays disabled until its environment variables and feature flag are configured.

## Tests

```bash
cd backend && npm test
cd frontend && npm test
cd frontend && npm run build
```

Database-backed tests run when the local PostgreSQL service is available and the migrations have been applied.

## Project structure

```text
backend/   Express API, Socket.IO server, database, and AI pipeline
frontend/  React application and browser media logic
```

The core product is human-to-human speaking practice. AI feedback complements the peer review after a session; it does not replace the conversation partner.
