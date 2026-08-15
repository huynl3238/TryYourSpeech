import { randomUUID } from 'crypto';
import pool from '../config/db.js';
import { createNotification } from './notificationModel.js';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeText(value, maxLength, fieldName) {
  if (!isNonEmptyString(value)) {
    throw new Error(`${fieldName} is required`);
  }

  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new Error(`${fieldName} is too long`);
  }

  return trimmed;
}

function normalizeOptionalText(value, maxLength, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }

  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new Error(`${fieldName} is too long`);
  }

  return trimmed || null;
}

function toNumberOrNull(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value || null;
}

function getInitials(name) {
  if (!name) return 'YS';

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'YS';
}

function getTurnLabel(partNumber) {
  if (partNumber === 2) return 'Part 2 - Cue Card';
  return `Part ${partNumber}`;
}

function averageScores(scores) {
  const values = scores
    .filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)))
    .map(Number);
  if (values.length === 0) {
    return null;
  }

  return Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 2) / 2;
}

function mapParticipant(row, role) {
  return {
    id: row[`${role}_id`],
    name: row[`${role}_display_name`],
    band: toNumberOrNull(row[`${role}_band`]),
    role: role === 'user_a' ? 'A' : 'B',
    userRole: row[`${role}_role`] || 'student',
    avatar: getInitials(row[`${role}_display_name`]),
  };
}

function buildSummary(row) {
  if (row.session_mode === 'mentor') {
    return row.mentor_overall_comment || 'Bai luyen da duoc mentor nhan xet va chia se len lop hoc.';
  }

  if (row.ai_feedback_summary) {
    return row.ai_feedback_summary;
  }

  if (row.ai_completed_count > 0) {
    return 'Bai luyen da co ket qua AI va ghi chu tu nguoi nghe.';
  }

  return 'Bai luyen da duoc chia se de hoc vien tham khao cach tra loi va ghi chu peer.';
}

function mapCommentRow(row) {
  return {
    id: row.id,
    postId: row.post_id,
    userId: row.user_id,
    userName: row.user_display_name,
    userAvatar: getInitials(row.user_display_name),
    commentText: row.comment_text,
    createdAt: toIsoString(row.created_at),
  };
}

function mapPostRow(row) {
  const participants = [
    mapParticipant(row, 'user_a'),
    mapParticipant(row, 'user_b'),
  ];
  const author = participants.find((participant) => participant.id === row.author_id) || participants[0];

  return {
    id: row.id,
    sessionId: row.session_id,
    title: row.title,
    description: row.description || buildSummary(row),
    status: row.status,
    time: toIsoString(row.created_at),
    topic: {
      id: row.topic_id,
      name: row.topic_name,
    },
    author: {
      id: row.author_id,
      name: row.author_display_name,
      avatar: getInitials(row.author_display_name),
    },
    participants,
    videoPlaceholder: row.topic_name || 'IELTS Speaking',
    commentsCount: Number(row.comments_count || 0),
    likes: Number(row.likes_count || 0),
    saves: Number(row.saves_count || 0),
    isLiked: Boolean(row.is_liked),
    isSaved: Boolean(row.is_saved),
    comments: [],
    peerNoteCount: Number(row.peer_note_count || 0),
    peerReviews: Number(row.peer_note_count || 0) > 0 ? [{ notes: [] }] : [],
    aiTranscripts: [],
    aiCompletedCount: Number(row.ai_completed_count || 0),
    overallBand: toNumberOrNull(row.overall_band),
    aiComment: buildSummary(row),
    // Kết quả chấm cả bài của người đăng, lấy nguyên từ session_ai_results. Giao
    // diện phải dựa vào `status`: chưa 'completed' thì không được hiện con số nào.
    // Phiên mentor không chạy AI nên ở đó cả khối này là null — đúng như vậy.
    ai: {
      status: row.holistic_status || null,
      overallBand: toNumberOrNull(row.overall_band),
      scores: {
        fluency: toNumberOrNull(row.holistic_fluency_score),
        lexical: toNumberOrNull(row.holistic_lexical_score),
        grammar: toNumberOrNull(row.holistic_grammar_score),
      },
      feedback: row.holistic_feedback || null,
    },
    sessionMode: row.session_mode || 'peer',
  };
}

function mapPeerNote(row) {
  return {
    timestampMs: Number(row.timestamp_ms || 0),
    errorType: row.error_type,
    noteText: row.note_text || '',
    partNumber: Number(row.part_number),
    partLabel: getTurnLabel(Number(row.part_number)),
    questionText: row.question_text,
  };
}

function mapTranscript(row) {
  const transcript = row.whisper_transcript || '';
  const words = transcript
    ? transcript.split(/\s+/).map((word) => ({ text: word }))
    : [];

  return {
    turnId: row.turn_id,
    speakerId: row.speaker_id,
    speakerName: row.speaker_name,
    speakerRole: row.speaker_role,
    speakerUserRole: row.speaker_user_role || 'student',
    partNumber: Number(row.part_number),
    partLabel: getTurnLabel(Number(row.part_number)),
    questionText: row.question_text,
    durationMs: Number(row.duration_ms || 0),
    audioUrl: row.audio_url ? `/api/turns/${row.turn_id}/audio` : null,
    transcript,
    transcriptStatus: transcript
      ? 'ready'
      : row.ai_status === 'failed'
        ? 'failed'
        : 'processing',
    words,
    scores: {
      fluency: toNumberOrNull(row.fluency_score),
      lexical: toNumberOrNull(row.lexical_score),
      grammar: toNumberOrNull(row.grammar_score),
      pronunciation: toNumberOrNull(row.pronunciation_score),
      // Phát âm KHÔNG được cộng vào band: điểm Azure là số âm học, không phải band
      // IELTS, và việc quy đổi nó sang band đã bị bỏ ngày 09/08. Bản trước lấy
      // trung bình cả 4 nên vẫn kéo phát âm vào điểm tổng ở đúng chỗ này.
      overall: averageScores([
        row.fluency_score,
        row.lexical_score,
        row.grammar_score,
      ]),
    },
    aiFeedback: row.ai_feedback || {},
    aiStatus: row.ai_status || 'pending',
  };
}

async function getPublishableSession(client, sessionId, userId) {
  const result = await client.query(
    `
      SELECT id, user_a_id, user_b_id, status
      FROM sessions
      WHERE id = $1
        AND (user_a_id = $2 OR user_b_id = $2)
    `,
    [sessionId, userId]
  );

  return result.rows[0] || null;
}

function getOtherParticipantIds(session, userId) {
  return [session.user_a_id, session.user_b_id]
    .filter((participantId) => participantId && participantId !== userId);
}

async function ensurePostExists(client, postId) {
  const result = await client.query(
    `
      SELECT id
      FROM classroom_posts
      WHERE id = $1
        AND status = 'published'
    `,
    [postId]
  );

  if (result.rowCount === 0) {
    throw new Error('Classroom post not found');
  }
}

async function ensureUserExists(client, userId) {
  const result = await client.query('SELECT id FROM users WHERE id = $1', [userId]);

  if (result.rowCount === 0) {
    throw new Error('User not found');
  }
}

async function getPostRows(client, whereClause, params, viewerId = null) {
  const viewerParamIndex = params.length + 1;
  const result = await client.query(
    `
      SELECT
        cp.id,
        cp.session_id,
        cp.author_id,
        cp.title,
        cp.description,
        cp.status,
        COALESCE(comment_summary.comments_count, 0) AS comments_count,
        COALESCE(like_summary.likes_count, 0) AS likes_count,
        COALESCE(save_summary.saves_count, 0) AS saves_count,
        EXISTS (
          SELECT 1
          FROM classroom_post_likes cpl
          WHERE cpl.post_id = cp.id
            AND cpl.user_id = $${viewerParamIndex}
        ) AS is_liked,
        EXISTS (
          SELECT 1
          FROM classroom_post_saves cps
          WHERE cps.post_id = cp.id
            AND cps.user_id = $${viewerParamIndex}
        ) AS is_saved,
        cp.created_at,
        s.session_mode,
        t.id AS topic_id,
        t.name AS topic_name,
        author.display_name AS author_display_name,
        ua.id AS user_a_id,
        ua.display_name AS user_a_display_name,
        ua.band AS user_a_band,
        ua.user_role AS user_a_role,
        ub.id AS user_b_id,
        ub.display_name AS user_b_display_name,
        ub.band AS user_b_band,
        ub.user_role AS user_b_role,
        COALESCE(notes.peer_note_count, 0) AS peer_note_count,
        COALESCE(ai.completed_count, 0) AS ai_completed_count,
        holistic.overall_band,
        holistic.feedback_summary AS ai_feedback_summary,
        -- Điểm chấm cả bài. Trước đây trang chi tiết Lớp học không có đường nào
        -- lấy được mấy con số này, nên frontend đã viết cứng điểm giả vào code.
        holistic.ai_status AS holistic_status,
        holistic.fluency_score AS holistic_fluency_score,
        holistic.lexical_score AS holistic_lexical_score,
        holistic.grammar_score AS holistic_grammar_score,
        holistic.holistic_feedback,
        mr.overall_comment AS mentor_overall_comment
      FROM classroom_posts cp
      JOIN sessions s ON s.id = cp.session_id
      JOIN topics t ON t.id = s.topic_id
      JOIN users author ON author.id = cp.author_id
      JOIN users ua ON ua.id = s.user_a_id
      JOIN users ub ON ub.id = s.user_b_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS peer_note_count
        FROM peer_notes pn
        JOIN turns tr ON tr.id = pn.turn_id
        WHERE tr.session_id = s.id
      ) notes ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE ar.status = 'completed')::int AS completed_count
        FROM turns tr
        LEFT JOIN ai_results ar ON ar.turn_id = tr.id
        WHERE tr.session_id = s.id
      ) ai ON true
      LEFT JOIN LATERAL (
        SELECT
          status AS ai_status,
          overall_band,
          fluency_score,
          lexical_score,
          grammar_score,
          holistic_feedback,
          holistic_feedback -> 'overall' ->> 'summary' AS feedback_summary
        FROM session_ai_results
        WHERE session_id = s.id
          AND user_id = cp.author_id
      ) holistic ON true
      LEFT JOIN mentor_reviews mr ON mr.session_id = s.id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS comments_count
        FROM classroom_comments cc
        WHERE cc.post_id = cp.id
      ) comment_summary ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS likes_count
        FROM classroom_post_likes cpl
        WHERE cpl.post_id = cp.id
      ) like_summary ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS saves_count
        FROM classroom_post_saves cps
        WHERE cps.post_id = cp.id
      ) save_summary ON true
      ${whereClause}
      ORDER BY cp.created_at DESC
    `,
    [...params, viewerId]
  );

  return result.rows;
}

export async function listClassroomPosts({ userId = null } = {}) {
  const client = await pool.connect();

  try {
    const rows = await getPostRows(client, "WHERE cp.status = 'published'", [], userId);
    return { posts: rows.map(mapPostRow) };
  } finally {
    client.release();
  }
}

export async function getClassroomPost(postId, { userId = null } = {}) {
  const client = await pool.connect();

  try {
    const rows = await getPostRows(client, 'WHERE cp.id = $1', [postId], userId);
    if (rows.length === 0) {
      return null;
    }

    const post = mapPostRow(rows[0]);
    const commentsResult = await client.query(
      `
        SELECT
          cc.id,
          cc.post_id,
          cc.user_id,
          cc.comment_text,
          cc.created_at,
          u.display_name AS user_display_name
        FROM classroom_comments cc
        JOIN users u ON u.id = cc.user_id
        WHERE cc.post_id = $1
        ORDER BY cc.created_at
      `,
      [postId]
    );
    const transcriptRows = await client.query(
      `
        SELECT
          tr.id AS turn_id,
          tr.speaker_id,
          tr.speaker_role,
          tr.part_number,
          tr.duration_ms,
          tr.audio_url,
          q.question_text,
          speaker.display_name AS speaker_name,
          speaker.user_role AS speaker_user_role,
          ar.status AS ai_status,
          ar.whisper_transcript,
          ar.fluency_score,
          ar.lexical_score,
          ar.grammar_score,
          ar.pronunciation_score,
          ar.ai_feedback
        FROM turns tr
        JOIN questions q ON q.id = tr.question_id
        JOIN users speaker ON speaker.id = tr.speaker_id
        LEFT JOIN ai_results ar ON ar.turn_id = tr.id
        WHERE tr.session_id = $1
        ORDER BY tr.turn_index
      `,
      [post.sessionId]
    );
    const noteRows = await client.query(
      `
        SELECT
          pn.timestamp_ms,
          pn.error_type,
          pn.note_text,
          tr.part_number,
          q.question_text,
          listener.display_name AS reviewer_name,
          listener.id AS reviewer_id,
          speaker.display_name AS target_name,
          tr.speaker_role
        FROM peer_notes pn
        JOIN turns tr ON tr.id = pn.turn_id
        JOIN questions q ON q.id = tr.question_id
        JOIN users listener ON listener.id = pn.listener_id
        JOIN users speaker ON speaker.id = tr.speaker_id
        WHERE tr.session_id = $1
        ORDER BY listener.display_name, tr.turn_index, pn.timestamp_ms
      `,
      [post.sessionId]
    );

    const peerReviewsByReviewer = new Map();
    for (const row of noteRows.rows) {
      if (!peerReviewsByReviewer.has(row.reviewer_id)) {
        peerReviewsByReviewer.set(row.reviewer_id, {
          reviewerName: row.reviewer_name,
          reviewerRole: row.speaker_role === 'A' ? 'B' : 'A',
          targetName: row.target_name,
          notes: [],
        });
      }

      peerReviewsByReviewer.get(row.reviewer_id).notes.push(mapPeerNote(row));
    }

    return {
      post: {
        ...post,
        comments: commentsResult.rows.map(mapCommentRow),
        aiTranscripts: transcriptRows.rows.map(mapTranscript),
        peerReviews: [...peerReviewsByReviewer.values()],
      },
    };
  } finally {
    client.release();
  }
}

export async function addClassroomComment({ postId, userId, commentText }) {
  if (!isNonEmptyString(postId)) {
    throw new Error('postId is required');
  }

  if (!isNonEmptyString(userId)) {
    throw new Error('userId is required');
  }

  const safeComment = normalizeText(commentText, 1000, 'commentText');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await ensurePostExists(client, postId);
    await ensureUserExists(client, userId);

    const result = await client.query(
      `
        INSERT INTO classroom_comments (id, post_id, user_id, comment_text)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      [randomUUID(), postId, userId, safeComment]
    );
    const userResult = await client.query(
      'SELECT display_name AS user_display_name FROM users WHERE id = $1',
      [userId]
    );
    const countResult = await client.query(
      `
        SELECT COUNT(*)::int AS comments_count
        FROM classroom_comments
        WHERE post_id = $1
      `,
      [postId]
    );
    await client.query('COMMIT');

    return {
      comment: mapCommentRow({
        ...result.rows[0],
        user_display_name: userResult.rows[0].user_display_name,
      }),
      commentsCount: countResult.rows[0].comments_count,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function toggleClassroomLike({ postId, userId }) {
  if (!isNonEmptyString(postId)) {
    throw new Error('postId is required');
  }

  if (!isNonEmptyString(userId)) {
    throw new Error('userId is required');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await ensurePostExists(client, postId);
    await ensureUserExists(client, userId);

    const deleted = await client.query(
      `
        DELETE FROM classroom_post_likes
        WHERE post_id = $1 AND user_id = $2
      `,
      [postId, userId]
    );
    const isLiked = deleted.rowCount === 0;

    if (isLiked) {
      await client.query(
        `
          INSERT INTO classroom_post_likes (post_id, user_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `,
        [postId, userId]
      );
    }

    const countResult = await client.query(
      `
        SELECT COUNT(*)::int AS likes_count
        FROM classroom_post_likes
        WHERE post_id = $1
      `,
      [postId]
    );
    await client.query('COMMIT');

    return {
      postId,
      isLiked,
      likes: countResult.rows[0].likes_count,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function toggleClassroomSave({ postId, userId }) {
  if (!isNonEmptyString(postId)) {
    throw new Error('postId is required');
  }

  if (!isNonEmptyString(userId)) {
    throw new Error('userId is required');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await ensurePostExists(client, postId);
    await ensureUserExists(client, userId);

    const deleted = await client.query(
      `
        DELETE FROM classroom_post_saves
        WHERE post_id = $1 AND user_id = $2
      `,
      [postId, userId]
    );
    const isSaved = deleted.rowCount === 0;

    if (isSaved) {
      await client.query(
        `
          INSERT INTO classroom_post_saves (post_id, user_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `,
        [postId, userId]
      );
    }

    const countResult = await client.query(
      `
        SELECT COUNT(*)::int AS saves_count
        FROM classroom_post_saves
        WHERE post_id = $1
      `,
      [postId]
    );
    await client.query('COMMIT');

    return {
      postId,
      isSaved,
      saves: countResult.rows[0].saves_count,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function publishClassroomPost({ sessionId, userId, title, description }) {
  if (!isNonEmptyString(sessionId)) {
    throw new Error('sessionId is required');
  }

  if (!isNonEmptyString(userId)) {
    throw new Error('userId is required');
  }

  const safeTitle = normalizeText(title, 160, 'title');
  const safeDescription = normalizeOptionalText(description, 1000, 'description');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const session = await getPublishableSession(client, sessionId, userId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.status !== 'completed') {
      throw new Error('Only completed sessions can be published');
    }

    // A post needs the consent of the other participant before it goes public.
    const approverIds = getOtherParticipantIds(session, userId);
    const approverId = approverIds[0] || null;
    if (!approverId) {
      throw new Error('Không tìm thấy người cần đồng ý');
    }

    // Creating the request is idempotent. A repeated click, a slow response
    // followed by a retry, or two tabs submitting together must not turn an
    // already published post back into pending or create another notification.
    // A declined request may be submitted again — by EITHER participant, not just
    // whoever asked the first time. Restricting the retry to the original author
    // left the other person with a button that returned success and did nothing:
    // no state change, no notification, no error. Both people sat in this session,
    // so either may ask; the retry hands authorship to whoever is asking now and
    // makes the other one the approver.
    let result = await client.query(
      `
        INSERT INTO classroom_posts (id, session_id, author_id, title, description, status, approver_id, approved_at)
        VALUES ($1, $2, $3, $4, $5, 'pending', $6, NULL)
        ON CONFLICT (session_id)
        DO NOTHING
        RETURNING id
      `,
      [randomUUID(), sessionId, userId, safeTitle, safeDescription, approverId]
    );
    let shouldNotify = result.rowCount > 0;

    if (!shouldNotify) {
      result = await client.query(
        `
          UPDATE classroom_posts
          SET
            author_id = $2,
            title = $3,
            description = $4,
            status = 'pending',
            approver_id = $5,
            approved_at = NULL,
            updated_at = NOW()
          WHERE session_id = $1
            AND status = 'declined'
          RETURNING id
        `,
        [sessionId, userId, safeTitle, safeDescription, approverId]
      );
      shouldNotify = result.rowCount > 0;
    }

    if (!shouldNotify) {
      result = await client.query(
        `
          SELECT id
          FROM classroom_posts
          WHERE session_id = $1
        `,
        [sessionId]
      );
    }

    // The insert only skipped because a row already exists, so this should never
    // be empty. It can be if that row was removed between the two statements, and
    // reading `.id` off nothing turns a rare race into an unexplainable 500.
    const postId = result.rows[0]?.id;
    if (!postId) {
      throw new Error('Không tìm thấy bài đăng của phiên luyện này');
    }

    if (shouldNotify) {
      await createNotification(client, {
        recipientId: approverId,
        actorId: userId,
        type: 'classroom_consent_request',
        title: 'Có người muốn đăng phiên luyện chung lên Lớp học',
        body: safeTitle,
        entityType: 'classroom_post',
        entityId: postId,
      });
    }

    await client.query('COMMIT');
    return await getClassroomPost(postId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getConsentPost(client, postId, approverId) {
  const result = await client.query(
    `
      SELECT cp.id, cp.author_id, cp.title, cp.status, cp.approver_id
      FROM classroom_posts cp
      WHERE cp.id = $1 AND cp.approver_id = $2
    `,
    [postId, approverId]
  );
  return result.rows[0] || null;
}

// Một yêu cầu không còn ở trạng thái chờ thì người bấm cần biết nó đã đi đâu, chứ
// không phải chỉ biết "đã xử lý". Bốn trạng thái này dẫn tới bốn việc khác nhau:
// đã đăng thì vào Lớp học mà xem, bị từ chối thì phải gửi lại yêu cầu mới, bị gỡ
// thì không cứu được từ đây.
function getConsentClosedMessage(status) {
  if (status === 'published') {
    return 'Bài này đã được đăng lên Lớp học rồi';
  }

  if (status === 'declined') {
    return 'Yêu cầu này đã bị từ chối. Hãy vào Lịch sử luyện tập và gửi lại yêu cầu đăng bài';
  }

  if (status === 'hidden') {
    return 'Bài này đã bị gỡ khỏi Lớp học';
  }

  return 'Yêu cầu đăng bài đã được xử lý';
}

export async function approveClassroomPost({ postId, userId }) {
  if (!isNonEmptyString(postId)) {
    throw new Error('postId is required');
  }
  if (!isNonEmptyString(userId)) {
    throw new Error('userId is required');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const post = await getConsentPost(client, postId, userId);
    if (!post) {
      throw new Error('Consent request not found');
    }
    if (post.status !== 'pending') {
      throw new Error(getConsentClosedMessage(post.status));
    }

    await client.query(
      "UPDATE classroom_posts SET status = 'published', approved_at = NOW(), updated_at = NOW() WHERE id = $1",
      [postId]
    );
    await client.query(
      `
        UPDATE notifications
        SET read_at = COALESCE(read_at, NOW())
        WHERE recipient_id = $1
          AND entity_type = 'classroom_post'
          AND entity_id = $2
          AND type = 'classroom_consent_request'
      `,
      [userId, postId]
    );

    // Notify both parties that the post is now public.
    for (const recipientId of [post.author_id, userId]) {
      await createNotification(client, {
        recipientId,
        actorId: userId,
        type: 'classroom_post_published',
        title: 'Bài luyện đã được public lên Lớp học',
        body: post.title,
        entityType: 'classroom_post',
        entityId: postId,
      });
    }

    await client.query('COMMIT');
    return await getClassroomPost(postId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function declineClassroomPost({ postId, userId }) {
  if (!isNonEmptyString(postId)) {
    throw new Error('postId is required');
  }
  if (!isNonEmptyString(userId)) {
    throw new Error('userId is required');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const post = await getConsentPost(client, postId, userId);
    if (!post) {
      throw new Error('Consent request not found');
    }
    if (post.status !== 'pending') {
      throw new Error(getConsentClosedMessage(post.status));
    }

    await client.query(
      "UPDATE classroom_posts SET status = 'declined', updated_at = NOW() WHERE id = $1",
      [postId]
    );
    await client.query(
      `
        UPDATE notifications
        SET read_at = COALESCE(read_at, NOW())
        WHERE recipient_id = $1
          AND entity_type = 'classroom_post'
          AND entity_id = $2
          AND type = 'classroom_consent_request'
      `,
      [userId, postId]
    );

    await createNotification(client, {
      recipientId: post.author_id,
      actorId: userId,
      type: 'classroom_consent_declined',
      title: 'Yêu cầu đăng bài đã bị từ chối',
      body: post.title,
      entityType: 'classroom_post',
      entityId: postId,
    });

    await client.query('COMMIT');
    return { declined: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
