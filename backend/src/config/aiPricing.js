// Đơn giá của các API tính tiền, tính bằng USD.
//
// CẢNH BÁO: giá do OpenAI và Azure công bố và họ đổi lúc nào cũng được. Những con
// số mặc định dưới đây là giá niêm yết tại thời điểm viết code, KHÔNG phải hoá đơn
// thật của bạn. Hãy đối chiếu với trang giá của nhà cung cấp; nếu lệch thì đổi
// bằng biến môi trường, không cần sửa file này.
//
// Dashboard quản trị hiển thị đúng bảng giá đang áp dụng, để con số tiền luôn
// kiểm chứng được thay vì là một số bí ẩn.
const DEFAULT_PRICING = {
  // gpt-4o-mini-transcribe: tính theo phút audio gửi lên.
  transcriptionPerMinuteUsd: 0.003,
  // gpt-4.1-mini: tính theo triệu token vào/ra.
  feedbackInputPerMillionTokensUsd: 0.4,
  feedbackOutputPerMillionTokensUsd: 1.6,
  // Azure Speech (bậc standard S0): tính theo giờ audio.
  pronunciationPerAudioHourUsd: 1.0,
};

const ENV_NAMES = {
  transcriptionPerMinuteUsd: 'AI_PRICE_TRANSCRIPTION_PER_MINUTE_USD',
  feedbackInputPerMillionTokensUsd: 'AI_PRICE_FEEDBACK_INPUT_PER_MILLION_USD',
  feedbackOutputPerMillionTokensUsd: 'AI_PRICE_FEEDBACK_OUTPUT_PER_MILLION_USD',
  pronunciationPerAudioHourUsd: 'AI_PRICE_PRONUNCIATION_PER_HOUR_USD',
};

// A malformed or negative override falls back to the default rather than
// silently pricing everything at zero — a dashboard reading $0.00 because of a
// typo in .env is worse than one showing a slightly stale rate.
function readRate(key) {
  const raw = process.env[ENV_NAMES[key]];
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return DEFAULT_PRICING[key];
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    console.warn(`${ENV_NAMES[key]} không phải số hợp lệ, dùng giá mặc định.`);
    return DEFAULT_PRICING[key];
  }

  return parsed;
}

export function getAiPricing() {
  return {
    transcriptionPerMinuteUsd: readRate('transcriptionPerMinuteUsd'),
    feedbackInputPerMillionTokensUsd: readRate('feedbackInputPerMillionTokensUsd'),
    feedbackOutputPerMillionTokensUsd: readRate('feedbackOutputPerMillionTokensUsd'),
    pronunciationPerAudioHourUsd: readRate('pronunciationPerAudioHourUsd'),
  };
}

// Cost of a single API call. `operation` decides which unit is billed: the two
// audio operations are priced by how long the recording is, the feedback call by
// how many tokens it consumed.
export function calculateUsageCostUsd({ operation, audioSeconds = 0, inputTokens = 0, outputTokens = 0 }) {
  const pricing = getAiPricing();
  const seconds = Number(audioSeconds) || 0;

  if (operation === 'transcription') {
    return (seconds / 60) * pricing.transcriptionPerMinuteUsd;
  }

  if (operation === 'pronunciation') {
    return (seconds / 3600) * pricing.pronunciationPerAudioHourUsd;
  }

  if (operation === 'feedback') {
    return (
      ((Number(inputTokens) || 0) / 1_000_000) * pricing.feedbackInputPerMillionTokensUsd +
      ((Number(outputTokens) || 0) / 1_000_000) * pricing.feedbackOutputPerMillionTokensUsd
    );
  }

  return 0;
}
