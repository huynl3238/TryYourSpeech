import { getAudioFileExtension } from '../utils/audioFormat';
import { resolveBackendFileUrl } from '../utils/backendUrl';

function getBaseUrl() {
  const configuredUrl = import.meta.env.VITE_BACKEND_URL;
  if (configuredUrl) return configuredUrl;
  return window.location.origin;
}

const BASE_URL = getBaseUrl();
let refreshSessionInFlight = null;

export function getBackendFileUrl(path) {
  return resolveBackendFileUrl(BASE_URL, path);
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    // Auth tokens live in httpOnly cookies, so every API call must send them.
    credentials: 'include',
    ...options,
  });

  const responseText = await response.text();
  let data = {};

  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { error: responseText };
    }
  }

  if (!response.ok) {
    throw new Error(data.error || 'Đã có lỗi xảy ra');
  }

  return data;
}

export async function getConfig() {
  return request('/config');
}

export async function getAdminStats() {
  return request('/admin/stats', { cache: 'no-store' });
}

// --- Becoming a mentor ---
export async function submitMentorApplication(message) {
  return request('/mentor-applications', {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export async function getMyMentorApplication() {
  return request('/mentor-applications/me', { cache: 'no-store' });
}

export async function getMentorApplications(status = 'pending') {
  return request(`/admin/mentor-applications?status=${encodeURIComponent(status)}`, {
    cache: 'no-store',
  });
}

export async function reviewMentorApplication({ applicationId, decision, reviewNote }) {
  return request(`/admin/mentor-applications/${applicationId}/review`, {
    method: 'POST',
    body: JSON.stringify({ decision, reviewNote }),
  });
}

export async function getMentors() {
  return request('/admin/mentors', { cache: 'no-store' });
}

export async function revokeMentor({ userId, reason }) {
  return request(`/admin/mentors/${userId}/revoke`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

// --- Authentication (Google OAuth2 + JWT cookies) ---
export async function loginWithGoogle(idToken) {
  return request('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  });
}

export async function registerWithPassword({ email, password, displayName }) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, displayName }),
  });
}

export async function loginWithPassword({ email, password }) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function verifyEmail(token) {
  return request('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export async function resendVerification(email) {
  return request('/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function forgotPassword(email) {
  return request('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword({ token, password }) {
  return request('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}

export function refreshSession() {
  if (!refreshSessionInFlight) {
    refreshSessionInFlight = request('/auth/refresh', { method: 'POST' })
      .finally(() => {
        refreshSessionInFlight = null;
      });
  }

  return refreshSessionInFlight;
}

export async function logout() {
  return request('/auth/logout', { method: 'POST' });
}

export async function getCurrentUser() {
  return request('/auth/me', { cache: 'no-store' });
}

export async function getSession(sessionId) {
  return request(`/sessions/${sessionId}`, { cache: 'no-store' });
}

export async function getPracticeHistory(userId) {
  return request(`/users/${userId}/practice-history`, { cache: 'no-store' });
}

export async function getUserProfile(userId) {
  return request(`/users/${userId}/profile`, { cache: 'no-store' });
}

export async function updateUserProfile(userId, { displayName, band }) {
  return request(`/users/${userId}/profile`, {
    method: 'PATCH',
    body: JSON.stringify({ displayName, band }),
  });
}

export async function getNotifications(userId) {
  return request(`/users/${userId}/notifications`, { cache: 'no-store' });
}

export async function markNotificationRead(userId, notificationId) {
  return request(`/users/${userId}/notifications/${notificationId}/read`, {
    method: 'PATCH',
  });
}

export async function markAllNotificationsRead(userId) {
  return request(`/users/${userId}/notifications/read-all`, {
    method: 'PATCH',
  });
}

export async function getTopics(ownerId) {
  const query = ownerId ? `?ownerId=${encodeURIComponent(ownerId)}` : '';
  return request(`/topics${query}`, { cache: 'no-store' });
}

export async function getTopicDetail(topicId) {
  return request(`/topics/${topicId}`, { cache: 'no-store' });
}

export async function createTopic({ name, targetBand, status, ownerId, scope, actorUserId }) {
  return request('/topics', {
    method: 'POST',
    body: JSON.stringify({ name, targetBand, status, ownerId, scope, actorUserId }),
  });
}

export async function updateTopic(topicId, { name, targetBand, status, actorUserId }) {
  return request(`/topics/${topicId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name, targetBand, status, actorUserId }),
  });
}

export async function deleteTopic(topicId, actorUserId) {
  const query = actorUserId ? `?actorUserId=${encodeURIComponent(actorUserId)}` : '';
  return request(`/topics/${topicId}${query}`, {
    method: 'DELETE',
  });
}

export async function createQuestion(topicId, payload) {
  return request(`/topics/${topicId}/questions`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateQuestion(questionId, payload) {
  return request(`/questions/${questionId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteQuestion(questionId, actorUserId) {
  const query = actorUserId ? `?actorUserId=${encodeURIComponent(actorUserId)}` : '';
  return request(`/questions/${questionId}${query}`, {
    method: 'DELETE',
  });
}

export async function getClassroomPosts(userId) {
  const query = userId ? `?userId=${userId}` : '';
  return request(`/classroom/posts${query}`, { cache: 'no-store' });
}

export async function getClassroomPost(postId, userId) {
  const query = userId ? `?userId=${userId}` : '';
  return request(`/classroom/posts/${postId}${query}`, { cache: 'no-store' });
}

export async function publishClassroomPost({ sessionId, userId, title, description }) {
  return request('/classroom/posts', {
    method: 'POST',
    body: JSON.stringify({ sessionId, userId, title, description }),
  });
}

export async function addClassroomComment({ postId, userId, commentText }) {
  return request(`/classroom/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ userId, commentText }),
  });
}

export async function toggleClassroomLike({ postId, userId }) {
  return request(`/classroom/posts/${postId}/like`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export async function toggleClassroomSave({ postId, userId }) {
  return request(`/classroom/posts/${postId}/save`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export async function approveClassroomPost({ postId, userId }) {
  return request(`/classroom/posts/${postId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export async function declineClassroomPost({ postId, userId }) {
  return request(`/classroom/posts/${postId}/decline`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export async function getStudentWork({ limit = 50 } = {}) {
  return request(`/teacher/student-work?limit=${limit}`, { cache: 'no-store' });
}

// --- Mentor-led sessions ---
export async function getMentorSessions(studentId) {
  const query = studentId ? `?studentId=${studentId}` : '';
  return request(`/mentor-sessions${query}`, { cache: 'no-store' });
}

export async function getMentorHostedSessions(mentorId) {
  return request(`/mentors/${mentorId}/sessions`, { cache: 'no-store' });
}

export async function openMentorSession({ mentorId, focus, targetBandMin, targetBandMax, topicId }) {
  return request('/mentor-sessions', {
    method: 'POST',
    body: JSON.stringify({ mentorId, focus, targetBandMin, targetBandMax, topicId }),
  });
}

export async function applyToMentorSession({ mentorSessionId, studentId }) {
  return request(`/mentor-sessions/${mentorSessionId}/apply`, {
    method: 'POST',
    body: JSON.stringify({ studentId }),
  });
}

export async function leaveMentorSession({ mentorSessionId, studentId }) {
  return request(`/mentor-sessions/${mentorSessionId}/leave`, {
    method: 'POST',
    body: JSON.stringify({ studentId }),
  });
}

export async function startMentorSession({ mentorSessionId, mentorId, studentId }) {
  return request(`/mentor-sessions/${mentorSessionId}/start`, {
    method: 'POST',
    body: JSON.stringify({ mentorId, studentId }),
  });
}

export async function closeMentorSession({ mentorSessionId, mentorId }) {
  return request(`/mentor-sessions/${mentorSessionId}/close`, {
    method: 'POST',
    body: JSON.stringify({ mentorId }),
  });
}

export async function uploadAudio({ audio, turnId, sessionId, speakerId, questionId, durationMs }) {
  const extension = getAudioFileExtension(audio?.type);
  if (!extension) {
    throw new Error('Trình duyệt đã tạo định dạng audio không được hỗ trợ');
  }

  const formData = new FormData();
  formData.append('audio', audio, `${turnId}.${extension}`);
  formData.append('turnId', turnId);
  formData.append('sessionId', sessionId);
  formData.append('speakerId', speakerId);
  formData.append('questionId', questionId);
  formData.append('durationMs', String(durationMs));

  const response = await fetch(`${BASE_URL}/api/audio/upload`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  const responseText = await response.text();
  let data = {};

  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { error: responseText };
    }
  }

  if (!response.ok) {
    throw new Error(data.error || 'Tải audio lên thất bại');
  }

  return data;
}

export async function submitPeerNotes({ sessionId, listenerId, notes }) {
  return request('/peer-notes/batch', {
    method: 'POST',
    body: JSON.stringify({ sessionId, listenerId, notes }),
  });
}

export async function completeReview({ sessionId, userId }) {
  return request('/review/complete', {
    method: 'POST',
    body: JSON.stringify({ sessionId, userId }),
  });
}

export async function getResults(sessionId, userId) {
  return request(`/results/${sessionId}?userId=${userId}`);
}

async function readAudioError(response) {
  try {
    const data = await response.json();
    return data.error || 'Không thể tải bản ghi âm';
  } catch {
    return 'Không thể tải bản ghi âm';
  }
}

// Media elements normally send the same-origin auth cookie themselves. Safari
// can still fail a protected Range request after a long session, especially
// around an access-token refresh. The player uses this full-file request as a
// fallback, refreshes the cookie once on 401, then plays a local Blob URL.
export async function fetchAudioBlob(path) {
  const url = getBackendFileUrl(path);
  let response = await fetch(url, { credentials: 'include' });

  if (response.status === 401) {
    await refreshSession();
    response = await fetch(url, { credentials: 'include' });
  }

  if (!response.ok) {
    throw new Error(await readAudioError(response));
  }

  return await response.blob();
}

export async function submitMentorReview(payload) {
  return request('/mentor-reviews', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function retryResults({ sessionId, userId, turnId }) {
  return request(`/results/${sessionId}/retry`, {
    method: 'POST',
    body: JSON.stringify({ userId, turnId }),
  });
}
