import { randomUUID } from 'crypto';
import pool from '../config/db.js';
import { emitToUser } from '../socket/notifier.js';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeOptionalString(value, maxLength, fieldName) {
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

function requireText(value, maxLength, fieldName) {
  if (!isNonEmptyString(value)) {
    throw new Error(`${fieldName} is required`);
  }

  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new Error(`${fieldName} is too long`);
  }

  return trimmed;
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value || null;
}

function mapNotification(row) {
  return {
    id: row.id,
    recipientId: row.recipient_id,
    actorId: row.actor_id,
    actorName: row.actor_display_name,
    type: row.type,
    title: row.title,
    body: row.body,
    entityType: row.entity_type,
    entityId: row.entity_id,
    readAt: toIsoString(row.read_at),
    createdAt: toIsoString(row.created_at),
    isRead: row.read_at !== null,
  };
}

async function getUserExists(client, userId) {
  const result = await client.query('SELECT id FROM users WHERE id = $1', [userId]);
  return result.rowCount > 0;
}

export async function createNotification(client, {
  recipientId,
  actorId = null,
  type,
  title,
  body = null,
  entityType = null,
  entityId = null,
}) {
  if (!isNonEmptyString(recipientId)) {
    throw new Error('recipientId is required');
  }

  if (!isNonEmptyString(type)) {
    throw new Error('type is required');
  }

  const safeTitle = requireText(title, 160, 'title');
  const safeBody = normalizeOptionalString(body, 1000, 'body');
  const safeEntityType = normalizeOptionalString(entityType, 50, 'entityType');

  if (!(await getUserExists(client, recipientId))) {
    throw new Error('Recipient not found');
  }

  if (actorId && !(await getUserExists(client, actorId))) {
    throw new Error('Actor not found');
  }

  const result = await client.query(
    `
      INSERT INTO notifications (
        id,
        recipient_id,
        actor_id,
        type,
        title,
        body,
        entity_type,
        entity_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `,
    [
      randomUUID(),
      recipientId,
      actorId,
      type.trim(),
      safeTitle,
      safeBody,
      safeEntityType,
      entityId || null,
    ]
  );

  const notification = mapNotification(result.rows[0]);

  // Realtime push: ping the recipient's live sockets so their UI can refetch
  // without a manual refresh. Fire-and-forget; delivery is best-effort and the
  // authoritative list still comes from GET /api/notifications on refetch.
  emitToUser(recipientId, 'notification:new', {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    createdAt: notification.createdAt,
  });

  return notification;
}

export async function createNotificationWithPool(payload) {
  const client = await pool.connect();

  try {
    return await createNotification(client, payload);
  } finally {
    client.release();
  }
}

export async function listNotificationsForUser({ userId, limit = 50 }) {
  if (!isNonEmptyString(userId)) {
    throw new Error('userId is required');
  }

  const safeLimit = Number.isInteger(limit) && limit > 0 && limit <= 100
    ? limit
    : 50;
  const client = await pool.connect();

  try {
    if (!(await getUserExists(client, userId))) {
      return null;
    }

    const result = await client.query(
      `
        SELECT
          n.*,
          actor.display_name AS actor_display_name
        FROM notifications n
        LEFT JOIN users actor ON actor.id = n.actor_id
        WHERE n.recipient_id = $1
        ORDER BY n.created_at DESC
        LIMIT $2
      `,
      [userId, safeLimit]
    );
    const unreadResult = await client.query(
      `
        SELECT COUNT(*)::int AS unread_count
        FROM notifications
        WHERE recipient_id = $1
          AND read_at IS NULL
      `,
      [userId]
    );

    return {
      unreadCount: unreadResult.rows[0].unread_count,
      notifications: result.rows.map(mapNotification),
    };
  } finally {
    client.release();
  }
}

export async function markNotificationRead({ notificationId, userId }) {
  if (!isNonEmptyString(notificationId)) {
    throw new Error('notificationId is required');
  }

  if (!isNonEmptyString(userId)) {
    throw new Error('userId is required');
  }

  const result = await pool.query(
    `
      UPDATE notifications
      SET read_at = COALESCE(read_at, NOW())
      WHERE id = $1
        AND recipient_id = $2
      RETURNING *
    `,
    [notificationId, userId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return { notification: mapNotification(result.rows[0]) };
}

export async function markAllNotificationsRead(userId) {
  if (!isNonEmptyString(userId)) {
    throw new Error('userId is required');
  }

  const result = await pool.query(
    `
      UPDATE notifications
      SET read_at = COALESCE(read_at, NOW())
      WHERE recipient_id = $1
        AND read_at IS NULL
    `,
    [userId]
  );

  return { updated: result.rowCount };
}
