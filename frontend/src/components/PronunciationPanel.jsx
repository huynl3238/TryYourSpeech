// Phần phát âm trên màn hình kết quả.
//
// CỐ Ý không hiện band IELTS nào. Trước đây có một bảng ngưỡng tự đặt để quy điểm
// 0–100 của Azure sang band; đo trên 5 bài mẫu thì nó cho cả người band 4.5 lẫn
// người band 9.0 cùng ra 7.0–7.5, tức không phân biệt được gì. Bỏ bảng đó đi thì
// mọi con số ở đây đều là số Azure ĐO ĐƯỢC, không phải số mình nghĩ ra.
//
// Đổi lại, hiển thị thứ Azure thật sự giỏi và trước đây bị bỏ không: danh sách
// từng từ phát âm chưa đạt. Với người học, biết mình sai từ nào có ích hơn nhiều
// so với một con band.

const ERROR_LABELS = {
  Mispronunciation: 'phát âm sai',
  Omission: 'bỏ mất',
  Insertion: 'thêm thừa',
  UnexpectedBreak: 'ngắt sai chỗ',
  MissingBreak: 'thiếu chỗ ngắt',
  Monotone: 'đọc đều, thiếu nhấn',
};

// Dưới mức này coi như chưa đạt. Ngưỡng của Azure, không phải thang band IELTS.
const ACCURACY_THRESHOLD = 70;

const METRICS = [
  { key: 'accuracyScore', label: 'Độ chính xác âm', hint: 'phát âm từng âm gần với chuẩn đến đâu' },
  { key: 'fluencyScore', label: 'Độ trôi chảy', hint: 'nhịp nói, quãng ngắt' },
  { key: 'prosodyScore', label: 'Ngữ điệu & trọng âm', hint: 'lên xuống giọng, nhấn từ' },
];

function ScoreBar({ label, hint, value }) {
  const has = typeof value === 'number' && Number.isFinite(value);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-zinc-700">{label}</span>
        <span className="text-[13px] font-bold tabular-nums text-zinc-900">
          {has ? `${Math.round(value)}/100` : 'chưa đo được'}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full rounded-full bg-violet-500"
          style={{ width: has ? `${Math.min(Math.max(value, 0), 100)}%` : 0 }}
        />
      </div>
      <p className="mt-0.5 text-[11.5px] text-zinc-400">{hint}</p>
    </div>
  );
}

// `words` là pronunciationDetail gộp từ mọi lượt nói của người này.
function weakWords(words) {
  const seen = new Map();

  for (const item of words) {
    const failed =
      (item.errorType && item.errorType !== 'None') ||
      (typeof item.accuracyScore === 'number' && item.accuracyScore < ACCURACY_THRESHOLD);
    if (!failed || !item.word) continue;

    const key = String(item.word).toLowerCase();
    const previous = seen.get(key);
    // Cùng một từ nói nhiều lần thì giữ lần tệ nhất — đó là lần cần luyện.
    if (!previous || (item.accuracyScore ?? 100) < (previous.accuracyScore ?? 100)) {
      seen.set(key, item);
    }
  }

  return [...seen.values()].sort((a, b) => (a.accuracyScore ?? 100) - (b.accuracyScore ?? 100));
}

export function PronunciationPanel({ pronunciation, words }) {
  const detail = Array.isArray(words) ? words : [];
  const weak = weakWords(detail);
  const hasScores = pronunciation && METRICS.some((m) => typeof pronunciation[m.key] === 'number');

  if (!hasScores && detail.length === 0) return null;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900">Phát âm</h3>
        <span className="text-[11.5px] text-zinc-400">Azure đo · {detail.length} từ</span>
      </div>
      {/* Nói rõ vì sao không có band ở đây, để không ai tưởng là thiếu sót. */}
      <p className="mb-4 text-[12px] leading-relaxed text-zinc-500">
        Đây là số đo âm học, <strong className="font-semibold text-zinc-600">không quy thành band IELTS</strong>:
        phép quy đổi đó không phân biệt được trình độ nên đã được bỏ. Band tổng tính trên ba tiêu chí ngôn ngữ.
      </p>

      {hasScores && (
        <div className="space-y-3">
          {METRICS.map((metric) => (
            <ScoreBar key={metric.key} label={metric.label} hint={metric.hint} value={pronunciation[metric.key]} />
          ))}
        </div>
      )}

      {weak.length > 0 ? (
        <div className="mt-4 border-t border-zinc-100 pt-3">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-zinc-500">
            Những từ nên luyện lại ({weak.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {weak.slice(0, 40).map((item) => (
              <span
                key={item.word}
                title={
                  ERROR_LABELS[item.errorType] ||
                  (typeof item.accuracyScore === 'number' ? `độ chính xác ${Math.round(item.accuracyScore)}/100` : '')
                }
                className="inline-flex items-baseline gap-1 rounded-md border border-red-100 bg-red-50 px-2 py-1 text-[12.5px] text-red-700"
              >
                <strong className="font-semibold">{item.word}</strong>
                {typeof item.accuracyScore === 'number' && (
                  <span className="tabular-nums text-[11px] text-red-400">{Math.round(item.accuracyScore)}</span>
                )}
              </span>
            ))}
          </div>
          {weak.length > 40 && (
            <p className="mt-2 text-[11.5px] text-zinc-400">…và {weak.length - 40} từ nữa.</p>
          )}
        </div>
      ) : (
        detail.length > 0 && (
          <p className="mt-4 border-t border-zinc-100 pt-3 text-[12.5px] text-emerald-600">
            Không có từ nào dưới ngưỡng {ACCURACY_THRESHOLD}/100. Phát âm từng từ đều ổn.
          </p>
        )
      )}
    </div>
  );
}
