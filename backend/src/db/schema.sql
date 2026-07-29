CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  display_name VARCHAR(100) NOT NULL,
  band DECIMAL(2,1),
  user_role VARCHAR(20) DEFAULT 'student',
  created_at TIMESTAMP DEFAULT NOW(),
  CHECK (band IS NULL OR (band >= 0 AND band <= 9))
);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS user_role VARCHAR(20) DEFAULT 'student';

ALTER TABLE users
DROP CONSTRAINT IF EXISTS users_user_role_check;

ALTER TABLE users
ADD CONSTRAINT users_user_role_check
CHECK (user_role IN ('student', 'mentor', 'admin'));

-- --- Authentication (Google OAuth2 + JWT) --------------------------------
-- A users row is the app-level person. Sign-in credentials live in
-- user_identities, so a user can later link more providers without changing
-- their id (every session/turn/note already references users.id).
ALTER TABLE users
ADD COLUMN IF NOT EXISTS email VARCHAR(255);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email))
WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_identities (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL,
  provider_user_id VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (provider, provider_user_id),
  CHECK (provider IN ('google'))
);

CREATE INDEX IF NOT EXISTS idx_user_identities_user_id ON user_identities(user_id);

-- Email + password sign-in is a second provider on the same users row, so a
-- person who signs up both ways keeps one history.
--   provider = 'password', provider_user_id = the lowercased email.
ALTER TABLE user_identities
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- Verification is per identity, NOT per user. A Google account already proves
-- the email, but that must not let someone attach a password to it: they would
-- take over the account just by knowing the address. A password identity is
-- unusable until the person clicks the link mailed to that address.
ALTER TABLE user_identities
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP;

ALTER TABLE user_identities
DROP CONSTRAINT IF EXISTS user_identities_provider_check;

ALTER TABLE user_identities
ADD CONSTRAINT user_identities_provider_check
CHECK (provider IN ('google', 'password'));

-- Single-use links mailed to the user: confirming an address, or resetting a
-- forgotten password. Stored hashed for the same reason refresh tokens are.
CREATE TABLE IF NOT EXISTS email_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose VARCHAR(20) NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  CHECK (purpose IN ('verify_email', 'reset_password'))
);

CREATE INDEX IF NOT EXISTS idx_email_tokens_user
ON email_tokens(user_id, purpose, created_at DESC);

-- Refresh tokens are stored hashed (never in plaintext) so a DB leak cannot be
-- replayed, and rows can be revoked individually (logout) or in bulk (ban).
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);

-- Students apply to become a mentor; an admin approves or rejects.
CREATE TABLE IF NOT EXISTS mentor_applications (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,
  review_note TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- Only one open application per user at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mentor_applications_pending
ON mentor_applications(user_id)
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_mentor_applications_status
ON mentor_applications(status, created_at DESC);

CREATE TABLE IF NOT EXISTS topics (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  target_band VARCHAR(50),
  status VARCHAR(20) DEFAULT 'open',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE topics
ADD COLUMN IF NOT EXISTS target_band VARCHAR(50);

ALTER TABLE topics
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'open';

ALTER TABLE topics
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

ALTER TABLE topics
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

ALTER TABLE topics
DROP CONSTRAINT IF EXISTS topics_status_check;

ALTER TABLE topics
ADD CONSTRAINT topics_status_check
CHECK (status IN ('open', 'draft', 'hidden'));

-- Each mentor owns their own question sets. Rows with owner_id = NULL are
-- shared templates available to every mentor. Name must be unique per owner.
ALTER TABLE topics
ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id);

ALTER TABLE topics
ADD COLUMN IF NOT EXISTS scope VARCHAR(30) DEFAULT 'system';

UPDATE topics
SET scope = CASE
  WHEN owner_id IS NULL THEN 'system'
  ELSE 'mentor_private'
END
WHERE
  scope IS NULL
  OR (owner_id IS NULL AND scope <> 'system')
  OR (owner_id IS NOT NULL AND scope <> 'mentor_private');

ALTER TABLE topics
DROP CONSTRAINT IF EXISTS topics_scope_check;

ALTER TABLE topics
ADD CONSTRAINT topics_scope_check
CHECK (scope IN ('system', 'mentor_private'));

ALTER TABLE topics
DROP CONSTRAINT IF EXISTS topics_scope_owner_check;

ALTER TABLE topics
ADD CONSTRAINT topics_scope_owner_check
CHECK (
  (scope = 'system' AND owner_id IS NULL)
  OR
  (scope = 'mentor_private' AND owner_id IS NOT NULL)
);

ALTER TABLE topics
DROP CONSTRAINT IF EXISTS topics_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_topics_owner_name ON topics(owner_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_topics_scope_owner_name
ON topics(scope, COALESCE(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), name);
CREATE INDEX IF NOT EXISTS idx_topics_owner_id ON topics(owner_id);
CREATE INDEX IF NOT EXISTS idx_topics_scope ON topics(scope);

CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY,
  topic_id UUID REFERENCES topics(id),
  part_number SMALLINT NOT NULL,
  question_text TEXT NOT NULL,
  cue_card JSONB,
  suggested_phrases JSONB,
  CHECK (part_number IN (1, 2, 3))
);
CREATE INDEX IF NOT EXISTS idx_questions_topic_id ON questions(topic_id);

ALTER TABLE questions
ADD COLUMN IF NOT EXISTS suggested_phrases JSONB;

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  room_id VARCHAR(100),
  user_a_id UUID REFERENCES users(id),
  user_b_id UUID REFERENCES users(id),
  topic_id UUID REFERENCES topics(id),
  session_mode VARCHAR(20) DEFAULT 'peer',
  status VARCHAR(20) DEFAULT 'matched',
  user_a_review_done_at TIMESTAMP,
  user_b_review_done_at TIMESTAMP,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  CHECK (status IN ('matched', 'active', 'reviewing', 'processing', 'completed', 'abandoned'))
);

ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS session_mode VARCHAR(20) DEFAULT 'peer';

ALTER TABLE sessions
DROP CONSTRAINT IF EXISTS sessions_session_mode_check;

ALTER TABLE sessions
ADD CONSTRAINT sessions_session_mode_check
CHECK (session_mode IN ('peer', 'mentor'));

-- Counts how many times AI grading has been started for this session. The recovery
-- sweep retries anything stuck in 'processing', so without a ceiling a session that
-- fails for a permanent reason (a corrupt recording, say) would be retried every few
-- minutes forever and cost money on the paid APIs each time.
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS ai_attempts INTEGER NOT NULL DEFAULT 0;

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
  CHECK (error_type IN (
    'grammar_error',
    'collocation_issue',
    'pause_filler',
    'false_start',
    'pronunciation_issue',
    'advanced_vocab',
    'good_connector',
    'idea_development',
    'pronunciation',
    'grammar',
    'vocabulary',
    'fluency'
  )),
  UNIQUE (listener_id, turn_id, client_note_id)
);
CREATE INDEX IF NOT EXISTS idx_peer_notes_turn_id ON peer_notes(turn_id);

ALTER TABLE peer_notes
DROP CONSTRAINT IF EXISTS peer_notes_error_type_check;

ALTER TABLE peer_notes
ADD CONSTRAINT peer_notes_error_type_check
CHECK (error_type IN (
  'grammar_error',
  'collocation_issue',
  'pause_filler',
  'false_start',
  'pronunciation_issue',
  'advanced_vocab',
  'good_connector',
  'idea_development',
  'pronunciation',
  'grammar',
  'vocabulary',
  'fluency'
));

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

-- Holistic (whole-test) AI scoring, one row per (session, user). Fluency, Lexical and
-- Grammar are graded ONCE across all of the user's answers (not per turn), while the
-- pronunciation band is aggregated from the per-turn Azure acoustic scores. Per-turn
-- ai_results still hold each answer's transcript and word-level pronunciation detail.
CREATE TABLE IF NOT EXISTS session_ai_results (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id),
  user_id UUID NOT NULL REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'processing',
  fluency_score DECIMAL(3,1),
  lexical_score DECIMAL(3,1),
  grammar_score DECIMAL(3,1),
  pronunciation_score DECIMAL(3,1),
  overall_band DECIMAL(3,1),
  holistic_feedback JSONB,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (session_id, user_id),
  CHECK (status IN ('processing', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_session_ai_results_session_id ON session_ai_results(session_id);

CREATE TABLE IF NOT EXISTS mentor_reviews (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES sessions(id),
  mentor_id UUID REFERENCES users(id),
  student_id UUID REFERENCES users(id),
  overall_comment TEXT NOT NULL,
  pronunciation_comment TEXT,
  grammar_comment TEXT,
  vocabulary_comment TEXT,
  fluency_comment TEXT,
  suggested_next_steps TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (session_id)
);

CREATE INDEX IF NOT EXISTS idx_mentor_reviews_session_id ON mentor_reviews(session_id);
CREATE INDEX IF NOT EXISTS idx_mentor_reviews_student_id ON mentor_reviews(student_id);

CREATE TABLE IF NOT EXISTS classroom_posts (
  id UUID PRIMARY KEY,
  session_id UUID UNIQUE REFERENCES sessions(id),
  author_id UUID REFERENCES users(id),
  title VARCHAR(160) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'published',
  likes_count INTEGER DEFAULT 0,
  saves_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CHECK (status IN ('published', 'hidden'))
);

ALTER TABLE classroom_posts
ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE classroom_posts
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'published';

ALTER TABLE classroom_posts
ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0;

ALTER TABLE classroom_posts
ADD COLUMN IF NOT EXISTS saves_count INTEGER DEFAULT 0;

ALTER TABLE classroom_posts
DROP CONSTRAINT IF EXISTS classroom_posts_status_check;

ALTER TABLE classroom_posts
ADD CONSTRAINT classroom_posts_status_check
CHECK (status IN ('published', 'hidden'));

CREATE INDEX IF NOT EXISTS idx_classroom_posts_author_id ON classroom_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_classroom_posts_status_created_at ON classroom_posts(status, created_at);

CREATE TABLE IF NOT EXISTS classroom_comments (
  id UUID PRIMARY KEY,
  post_id UUID REFERENCES classroom_posts(id),
  user_id UUID REFERENCES users(id),
  comment_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_classroom_comments_post_id ON classroom_comments(post_id, created_at);

CREATE TABLE IF NOT EXISTS classroom_post_likes (
  post_id UUID REFERENCES classroom_posts(id),
  user_id UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_classroom_post_likes_user_id ON classroom_post_likes(user_id);

CREATE TABLE IF NOT EXISTS classroom_post_saves (
  post_id UUID REFERENCES classroom_posts(id),
  user_id UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_classroom_post_saves_user_id ON classroom_post_saves(user_id);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY,
  recipient_id UUID REFERENCES users(id),
  actor_id UUID REFERENCES users(id),
  type VARCHAR(50) NOT NULL,
  title VARCHAR(160) NOT NULL,
  body TEXT,
  entity_type VARCHAR(50),
  entity_id UUID,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES users(id);

ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS body TEXT;

ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50);

ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS entity_id UUID;

ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS read_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created_at ON notifications(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read_at ON notifications(recipient_id, read_at);

-- Mentor-led practice: a mentor opens a session, students apply to a queue,
-- and the mentor picks one student to start the actual practice session.
CREATE TABLE IF NOT EXISTS mentor_sessions (
  id UUID PRIMARY KEY,
  mentor_id UUID REFERENCES users(id),
  focus VARCHAR(10) NOT NULL DEFAULT 'part2',
  target_band_min DECIMAL(2,1),
  target_band_max DECIMAL(2,1),
  topic_id UUID REFERENCES topics(id),
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  session_id UUID REFERENCES sessions(id),
  chosen_student_id UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  closed_at TIMESTAMP,
  CHECK (focus IN ('part1', 'part2', 'part3', 'full')),
  CHECK (status IN ('open', 'started', 'closed')),
  CHECK (target_band_min IS NULL OR (target_band_min >= 0 AND target_band_min <= 9)),
  CHECK (target_band_max IS NULL OR (target_band_max >= 0 AND target_band_max <= 9))
);

CREATE INDEX IF NOT EXISTS idx_mentor_sessions_mentor_id ON mentor_sessions(mentor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mentor_sessions_status ON mentor_sessions(status, created_at DESC);

CREATE TABLE IF NOT EXISTS mentor_session_applicants (
  mentor_session_id UUID REFERENCES mentor_sessions(id) ON DELETE CASCADE,
  student_id UUID REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'waiting',
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (mentor_session_id, student_id),
  CHECK (status IN ('waiting', 'chosen', 'passed'))
);

CREATE INDEX IF NOT EXISTS idx_mentor_session_applicants_student ON mentor_session_applicants(student_id);

-- Two-party consent before a practice session becomes a public classroom post.
ALTER TABLE classroom_posts
DROP CONSTRAINT IF EXISTS classroom_posts_status_check;

ALTER TABLE classroom_posts
ADD CONSTRAINT classroom_posts_status_check
CHECK (status IN ('pending', 'published', 'hidden', 'declined'));

ALTER TABLE classroom_posts
ADD COLUMN IF NOT EXISTS approver_id UUID REFERENCES users(id);

ALTER TABLE classroom_posts
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;

-- Nhật ký từng lần gọi API tính tiền (OpenAI phiên âm, Azure chấm phát âm,
-- OpenAI nhận xét). Trước bảng này app hoàn toàn mù về chi phí: chỉ biết tiền đã
-- tiêu khi nhận hoá đơn cuối tháng, và không biết phần nào tốn nhiều.
--
-- cost_usd được tính lúc ghi và lưu cứng lại, cố ý như vậy: nếu nhà cung cấp đổi
-- giá thì chi phí lịch sử vẫn phản ánh giá tại thời điểm gọi, chứ không bị tính
-- lại theo giá mới.
CREATE TABLE IF NOT EXISTS ai_usage (
  id UUID PRIMARY KEY,
  -- Xoá phiên/lượt nói không được xoá lịch sử chi phí: tiền đã tiêu rồi.
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  turn_id UUID REFERENCES turns(id) ON DELETE SET NULL,
  provider VARCHAR(20) NOT NULL,
  operation VARCHAR(20) NOT NULL,
  model VARCHAR(120),
  audio_seconds DECIMAL(10,2) NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd DECIMAL(12,6) NOT NULL DEFAULT 0,
  succeeded BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  CHECK (provider IN ('openai', 'azure')),
  CHECK (operation IN ('transcription', 'pronunciation', 'feedback'))
);

-- Mọi truy vấn của dashboard đều lọc theo khoảng thời gian (hôm nay / tháng này).
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage(created_at);
