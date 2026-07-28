import { randomUUID } from 'crypto';
import pool from '../config/db.js';
import { createNotification } from './notificationModel.js';

const MAX_MESSAGE_LENGTH = 1000;
const MAX_REVIEW_NOTE_LENGTH = 500;

// Postgres raises this when the partial unique index on pending applications is
// violated, i.e. the user already has an open application.
const UNIQUE_VIOLATION = '23505';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
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

function mapApplication(row) {
  return {
    id: row.id,
    userId: row.user_id,
    message: row.message,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: toIsoString(row.reviewed_at),
    reviewNote: row.review_note,
    createdAt: toIsoString(row.created_at),
  };
}

// The admin list needs to judge the person, not just read their message.
function mapApplicationWithApplicant(row) {
  return {
    ...mapApplication(row),
    applicant: {
      id: row.user_id,
      displayName: row.display_name,
      band: toNumberOrNull(row.band),
      userRole: row.user_role || 'student',
      email: row.email,
      joinedAt: toIsoString(row.user_created_at),
      completedSessions: Number(row.completed_sessions) || 0,
    },
    reviewer: row.reviewer_name ? { id: row.reviewed_by, displayName: row.reviewer_name } : null,
  };
}

function mapMentor(row) {
  return {
    id: row.id,
    displayName: row.display_name,
    band: toNumberOrNull(row.band),
    email: row.email,
    joinedAt: toIsoString(row.created_at),
    hostedSessions: Number(row.hosted_sessions) || 0,
    reviewsWritten: Number(row.reviews_written) || 0,
  };
}

function normalizeMessage(message) {
  if (!isNonEmptyString(message)) {
    throw new Error('Bạn cần viết vài dòng giới thiệu về mình');
  }

  const trimmed = message.trim();
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Lời nhắn không được dài quá ${MAX_MESSAGE_LENGTH} ký tự`);
  }

  return trimmed;
}

function normalizeReviewNote(reviewNote) {
  if (reviewNote === undefined || reviewNote === null || String(reviewNote).trim() === '') {
    return null;
  }

  const trimmed = String(reviewNote).trim();
  if (trimmed.length > MAX_REVIEW_NOTE_LENGTH) {
    throw new Error(`Ghi chú không được dài quá ${MAX_REVIEW_NOTE_LENGTH} ký tự`);
  }

  return trimmed;
}

async function getUserRole(client, userId) {
  const result = await client.query('SELECT user_role FROM users WHERE id = $1', [userId]);
  return result.rows[0]?.user_role || null;
}

export async function submitMentorApplication({ userId, message }) {
  if (!isNonEmptyString(userId)) {
    throw new Error('userId is required');
  }

  const safeMessage = normalizeMessage(message);
  const client = await pool.connect();

  try {
    const role = await getUserRole(client, userId);
    if (!role) {
      throw new Error('Application user not found');
    }

    if (role !== 'student') {
      throw new Error('Bạn đã có quyền mentor rồi, không cần đăng ký lại');
    }

    const result = await client.query(
      `
        INSERT INTO mentor_applications (id, user_id, message, status)
        VALUES ($1, $2, $3, 'pending')
        RETURNING *
      `,
      [randomUUID(), userId, safeMessage]
    );

    return { application: mapApplication(result.rows[0]) };
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION) {
      throw new Error('Bạn đã có một đơn đang chờ duyệt');
    }

    throw err;
  } finally {
    client.release();
  }
}

// The applicant only ever needs their newest application: an older rejected one
// is history, and the partial index guarantees at most one is still pending.
export async function getLatestMentorApplication(userId) {
  if (!isNonEmptyString(userId)) {
    throw new Error('userId is required');
  }

  const result = await pool.query(
    `
      SELECT *
      FROM mentor_applications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [userId]
  );

  const row = result.rows[0];
  return { application: row ? mapApplication(row) : null };
}

export async function listMentorApplications({ status = 'pending' } = {}) {
  if (!['pending', 'approved', 'rejected', 'all'].includes(status)) {
    throw new Error('status is invalid');
  }

  const result = await pool.query(
    `
      SELECT
        ma.*,
        u.display_name,
        u.band,
        u.user_role,
        u.email,
        u.created_at AS user_created_at,
        reviewer.display_name AS reviewer_name,
        (
          SELECT COUNT(*)::int
          FROM sessions s
          WHERE (s.user_a_id = u.id OR s.user_b_id = u.id)
            AND s.status = 'completed'
        ) AS completed_sessions
      FROM mentor_applications ma
      JOIN users u ON u.id = ma.user_id
      LEFT JOIN users reviewer ON reviewer.id = ma.reviewed_by
      WHERE ($1 = 'all' OR ma.status = $1)
      ORDER BY
        -- Pending first: those are the only ones needing action.
        CASE WHEN ma.status = 'pending' THEN 0 ELSE 1 END,
        ma.created_at DESC
      LIMIT 200
    `,
    [status]
  );

  return { applications: result.rows.map(mapApplicationWithApplicant) };
}

export async function reviewMentorApplication({
  applicationId,
  reviewerId,
  decision,
  reviewNote,
}) {
  if (!isNonEmptyString(applicationId)) {
    throw new Error('applicationId is required');
  }

  if (!isNonEmptyString(reviewerId)) {
    throw new Error('reviewerId is required');
  }

  if (decision !== 'approved' && decision !== 'rejected') {
    throw new Error('decision must be approved or rejected');
  }

  const safeNote = normalizeReviewNote(reviewNote);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Locked because two admins can open the queue at the same time; without this
    // both could approve the same application and send two notifications.
    const existing = await client.query(
      'SELECT * FROM mentor_applications WHERE id = $1 FOR UPDATE',
      [applicationId]
    );

    const application = existing.rows[0];
    if (!application) {
      throw new Error('Mentor application not found');
    }

    if (application.status !== 'pending') {
      throw new Error('Đơn này đã được xử lý rồi');
    }

    const updated = await client.query(
      `
        UPDATE mentor_applications
        SET status = $2,
            reviewed_by = $3,
            reviewed_at = NOW(),
            review_note = $4
        WHERE id = $1
        RETURNING *
      `,
      [applicationId, decision, reviewerId, safeNote]
    );

    if (decision === 'approved') {
      // Guarded on user_role = 'student' so approving a stale application can
      // never demote someone who has since become an admin.
      await client.query(
        `
          UPDATE users
          SET user_role = 'mentor'
          WHERE id = $1 AND user_role = 'student'
        `,
        [application.user_id]
      );
    }

    await createNotification(client, {
      recipientId: application.user_id,
      actorId: reviewerId,
      type: decision === 'approved' ? 'mentor_application_approved' : 'mentor_application_rejected',
      title:
        decision === 'approved'
          ? 'Đơn đăng ký làm mentor đã được duyệt'
          : 'Đơn đăng ký làm mentor chưa được duyệt',
      body:
        decision === 'approved'
          ? 'Từ giờ bạn có thể mở buổi hướng dẫn và nhận xét cho học viên.'
          : safeNote || 'Bạn có thể gửi lại đơn khác sau khi bổ sung thông tin.',
      entityType: 'mentor_application',
      entityId: applicationId,
    });

    await client.query('COMMIT');

    return { application: mapApplication(updated.rows[0]) };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function listMentors() {
  const result = await pool.query(
    `
      SELECT
        u.id,
        u.display_name,
        u.band,
        u.email,
        u.created_at,
        (SELECT COUNT(*)::int FROM mentor_sessions ms WHERE ms.mentor_id = u.id) AS hosted_sessions,
        (SELECT COUNT(*)::int FROM mentor_reviews mr WHERE mr.mentor_id = u.id) AS reviews_written
      FROM users u
      WHERE u.user_role = 'mentor'
      ORDER BY u.display_name
    `
  );

  return { mentors: result.rows.map(mapMentor) };
}

export async function revokeMentorRole({ userId, adminId, reason }) {
  if (!isNonEmptyString(userId)) {
    throw new Error('userId is required');
  }

  if (!isNonEmptyString(adminId)) {
    throw new Error('adminId is required');
  }

  const safeReason = normalizeReviewNote(reason);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Only a mentor can be demoted: this must not silently strip an admin, and
    // it must not "succeed" on someone who was already a student.
    const result = await client.query(
      `
        UPDATE users
        SET user_role = 'student'
        WHERE id = $1 AND user_role = 'mentor'
        RETURNING id, display_name, user_role
      `,
      [userId]
    );

    if (result.rowCount === 0) {
      throw new Error('Người này không phải mentor');
    }

    await createNotification(client, {
      recipientId: userId,
      actorId: adminId,
      type: 'mentor_role_revoked',
      title: 'Quyền mentor đã được gỡ',
      body: safeReason || 'Tài khoản của bạn quay lại vai trò học viên.',
      entityType: 'user',
      entityId: userId,
    });

    await client.query('COMMIT');

    return { userId, userRole: 'student' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
