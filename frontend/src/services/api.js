const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export function getBackendFileUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${BASE_URL}${path}`;
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
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

export async function getSession(sessionId) {
  return request(`/sessions/${sessionId}`, { cache: 'no-store' });
}

export async function uploadAudio({ audio, turnId, sessionId, speakerId, questionId, durationMs }) {
  const formData = new FormData();
  formData.append('audio', audio, `${turnId}.webm`);
  formData.append('turnId', turnId);
  formData.append('sessionId', sessionId);
  formData.append('speakerId', speakerId);
  formData.append('questionId', questionId);
  formData.append('durationMs', String(durationMs));

  const response = await fetch(`${BASE_URL}/api/audio/upload`, {
    method: 'POST',
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

export async function retryResults({ sessionId, userId, turnId }) {
  return request(`/results/${sessionId}/retry`, {
    method: 'POST',
    body: JSON.stringify({ userId, turnId }),
  });
}
