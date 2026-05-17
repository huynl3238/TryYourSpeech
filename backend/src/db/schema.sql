CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  display_name VARCHAR(100) NOT NULL,
  band DECIMAL(2,1),
  created_at TIMESTAMP DEFAULT NOW(),
  CHECK (band IS NULL OR (band >= 0 AND band <= 9))
);

CREATE TABLE IF NOT EXISTS topics (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY,
  topic_id UUID REFERENCES topics(id),
  part_number SMALLINT NOT NULL,
  question_text TEXT NOT NULL,
  cue_card JSONB,
  CHECK (part_number IN (1, 2, 3))
);
CREATE INDEX IF NOT EXISTS idx_questions_topic_id ON questions(topic_id);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  room_id VARCHAR(100),
  user_a_id UUID REFERENCES users(id),
  user_b_id UUID REFERENCES users(id),
  topic_id UUID REFERENCES topics(id),
  status VARCHAR(20) DEFAULT 'matched',
  user_a_review_done_at TIMESTAMP,
  user_b_review_done_at TIMESTAMP,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  CHECK (status IN ('matched', 'active', 'reviewing', 'processing', 'completed', 'abandoned'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_a_id ON sessions(user_a_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_b_id ON sessions(user_b_id);

CREATE TABLE IF NOT EXISTS turns (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES sessions(id),
  speaker_id UUID REFERENCES users(id),
  speaker_role VARCHAR(1) NOT NULL,
  question_id UUID REFERENCES questions(id),
  part_number SMALLINT NOT NULL,
  turn_index INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  prep_duration_ms INTEGER DEFAULT 0,
  audio_url VARCHAR(500),
  upload_status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (session_id, turn_index),
  CHECK (speaker_role IN ('A', 'B')),
  CHECK (part_number IN (1, 2, 3)),
  CHECK (duration_ms > 0),
  CHECK (prep_duration_ms >= 0),
  CHECK (upload_status IN ('pending', 'uploaded', 'failed'))
);
CREATE INDEX IF NOT EXISTS idx_turns_session_id ON turns(session_id);
CREATE INDEX IF NOT EXISTS idx_turns_speaker_id ON turns(speaker_id);

CREATE TABLE IF NOT EXISTS peer_notes (
  id UUID PRIMARY KEY,
  turn_id UUID REFERENCES turns(id),
  listener_id UUID REFERENCES users(id),
  client_note_id VARCHAR(100) NOT NULL,
  timestamp_ms INTEGER NOT NULL,
  error_type VARCHAR(20) NOT NULL,
  note_text TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  CHECK (timestamp_ms >= 0),
  CHECK (error_type IN ('pronunciation', 'grammar', 'vocabulary', 'fluency')),
  UNIQUE (listener_id, turn_id, client_note_id)
);
CREATE INDEX IF NOT EXISTS idx_peer_notes_turn_id ON peer_notes(turn_id);

CREATE TABLE IF NOT EXISTS ai_results (
  id UUID PRIMARY KEY,
  turn_id UUID UNIQUE REFERENCES turns(id),
  status VARCHAR(20) DEFAULT 'processing',
  whisper_transcript TEXT,
  fluency_score DECIMAL(3,1),
  lexical_score DECIMAL(3,1),
  grammar_score DECIMAL(3,1),
  pronunciation_score DECIMAL(3,1),
  pronunciation_detail JSONB,
  ai_feedback JSONB,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CHECK (status IN ('processing', 'completed', 'failed'))
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'ai_results'
      AND column_name = 'gemini_feedback'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'ai_results'
      AND column_name = 'ai_feedback'
  ) THEN
    ALTER TABLE ai_results RENAME COLUMN gemini_feedback TO ai_feedback;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'ai_results'
      AND column_name = 'ai_feedback'
  ) THEN
    ALTER TABLE ai_results ADD COLUMN ai_feedback JSONB;
  END IF;
END $$;
