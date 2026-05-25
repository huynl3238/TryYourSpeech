import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { retryResults } from '../services/api';

const CRITERIA_LABELS = {
  fluency_coherence: { label: 'Fluency & Coherence', icon: 'speed', color: 'var(--color-primary)' },
  lexical_resource:  { label: 'Lexical Resource',    icon: 'menu_book', color: 'var(--color-success)' },
  grammatical_range: { label: 'Grammatical Range & Accuracy', icon: 'spellcheck', color: 'var(--color-warning)' },
  pronunciation:     { label: 'Pronunciation',       icon: 'record_voice_over', color: 'var(--color-error)' },
};

const ERROR_TYPE_LABELS = {
  pronunciation: { label: 'Phát âm', color: 'var(--color-error)' },
  grammar:       { label: 'Ngữ pháp', color: 'var(--color-warning)' },
  vocabulary:    { label: 'Từ vựng',  color: 'var(--color-success)' },
  fluency:       { label: 'Trôi chảy', color: 'var(--color-speaker)' },
};

function ScoreRing({ score, maxScore = 9, color = 'var(--color-primary)', size = 80 }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = score != null ? Math.min(score / maxScore, 1) : 0;
  const dashOffset = circumference * (1 - pct);

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--color-border)" strokeWidth={8} />
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={circumference} strokeDashoffset={dashOffset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1s ease' }}
      />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        style={{ fill: 'var(--color-text)', fontSize: 18, fontWeight: 700, transform: 'rotate(90deg)', transformOrigin: `${size/2}px ${size/2}px` }}>
        {score != null ? score.toFixed(1) : '—'}
      </text>
    </svg>
  );
}

export default function ResultsPage() {
  const { state, dispatch } = useSession();
  const navigate = useNavigate();
  const results = state.results;

  const [selectedTurnId, setSelectedTurnId] = useState(results?.turns?.[0]?.turnId || null);
  const [retryingTurns, setRetryingTurns] = useState({});

  if (!results) {
    return (
      <div className="page-center">
        <div style={{ textAlign: 'center' }}>
          <div className="spinner spinner-lg" style={{ margin: '0 auto var(--spacing-4)' }} />
          <p>Đang tải kết quả...</p>
        </div>
      </div>
    );
  }

  const selectedTurnResult = results.turns?.find((t) => t.turnId === selectedTurnId);
  const failedTurns = results.turns?.filter((t) => t.aiStatus === 'failed') || [];

  const partLabel = (turn) => {
    if (turn.partNumber === 1) return `Part 1 · Câu ${turn.turnIndex + 1}`;
    if (turn.partNumber === 2) return `Part 2 · Cue Card`;
    return `Part 3 · Câu ${turn.turnIndex + 1}`;
  };

  async function handleRetryTurn(turnId) {
    setRetryingTurns((prev) => ({ ...prev, [turnId]: true }));
    try {
      await retryResults({ sessionId: state.sessionId, userId: state.userId, turnId });
      // After retry, re-navigate to waiting page to poll
      navigate('/waiting-review');
    } catch (err) {
      console.error('[Results] Retry failed:', err.message);
    } finally {
      setRetryingTurns((prev) => ({ ...prev, [turnId]: false }));
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--color-bg)' }}>
      {/* Header */}
      <div style={{
        padding: 'var(--spacing-4) var(--spacing-6)',
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)' }}>
          <span className="material-symbols-rounded icon-fill" style={{ color: 'var(--color-primary)', fontSize: 24 }}>
            emoji_events
          </span>
          <div>
            <h1 style={{ fontSize: 'var(--font-size-base)', fontWeight: 700 }}>Kết quả phiên luyện</h1>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              Điểm ước lượng · Không phải điểm IELTS chính thức
            </p>
          </div>
        </div>
        <button className="btn btn-secondary" onClick={() => { dispatch({ type: 'RESET' }); navigate('/'); }}>
          <span className="material-symbols-rounded">home</span>
          Phiên mới
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: Turn list */}
        <div style={{
          width: 240,
          flexShrink: 0,
          borderRight: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
          overflowY: 'auto',
          padding: 'var(--spacing-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacing-2)',
        }}>
          {/* Overall score summary */}
          <div style={{
            padding: 'var(--spacing-4)',
            background: 'var(--color-primary-subtle)',
            borderRadius: 'var(--radius-md)',
            textAlign: 'center',
            marginBottom: 'var(--spacing-3)',
          }}>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)', fontWeight: 600, marginBottom: 4 }}>
              Band ước lượng
            </p>
            <p style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 700, color: 'var(--color-primary)' }}>
              {results.overallBand ?? '—'}
            </p>
            <p style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 4 }}>
              Ước lượng để luyện tập
            </p>
          </div>

          <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--spacing-1)' }}>
            Các lượt nói
          </p>
          {results.turns?.map((turn) => {
            const isSelected = turn.turnId === selectedTurnId;
            const hasFailed = turn.aiStatus === 'failed';
            return (
              <button
                key={turn.turnId}
                onClick={() => setSelectedTurnId(turn.turnId)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: 'var(--spacing-3)',
                  borderRadius: 'var(--radius-md)',
                  border: `1.5px solid ${isSelected ? 'var(--color-primary)' : hasFailed ? 'var(--color-error)' : 'var(--color-border)'}`,
                  background: isSelected ? 'var(--color-primary-subtle)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: isSelected ? 'var(--color-primary)' : hasFailed ? 'var(--color-error)' : 'var(--color-text)' }}>
                  {partLabel(turn)}
                </p>
                {hasFailed ? (
                  <span className="badge badge-error" style={{ fontSize: 10, marginTop: 4 }}>AI lỗi</span>
                ) : turn.bandEstimate != null ? (
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                    Band ≈ {turn.bandEstimate}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Right: Detail panel */}
        <div style={{ flex: 1, overflow: 'auto', padding: 'var(--spacing-6)' }}>
          {selectedTurnResult ? (
            <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-5)' }}>
              {/* Turn header */}
              <div>
                <span className="badge badge-neutral" style={{ marginBottom: 'var(--spacing-2)' }}>
                  {partLabel(selectedTurnResult)}
                </span>
                <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>
                  {selectedTurnResult.questionText}
                </h2>
              </div>

              {/* AI Failed state */}
              {selectedTurnResult.aiStatus === 'failed' && (
                <div className="alert alert-error">
                  <span className="material-symbols-rounded" style={{ fontSize: 18 }}>error</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 600 }}>Dịch vụ AI chưa xử lý được lượt này</p>
                    <p style={{ fontSize: 'var(--font-size-xs)', marginTop: 4 }}>
                      Dịch vụ AI chưa được cấu hình hoặc tạm thời gặp lỗi. Bạn có thể thử lại.
                    </p>
                    <button
                      className="btn btn-sm btn-danger"
                      style={{ marginTop: 'var(--spacing-3)' }}
                      disabled={retryingTurns[selectedTurnResult.turnId]}
                      onClick={() => handleRetryTurn(selectedTurnResult.turnId)}
                    >
                      {retryingTurns[selectedTurnResult.turnId] ? (
                        <><div className="spinner spinner-sm" /> Đang thử lại...</>
                      ) : (
                        <><span className="material-symbols-rounded" style={{ fontSize: 14 }}>refresh</span> Thử lại</>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Score criteria */}
              {selectedTurnResult.scores && (
                <div className="card">
                  <div className="card-header">
                    <p style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>Điểm 4 tiêu chí IELTS</p>
                  </div>
                  <div className="card-body" style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 'var(--spacing-4)',
                  }}>
                    {Object.entries(CRITERIA_LABELS).map(([key, { label, icon, color }]) => {
                      const score = selectedTurnResult.scores?.[key];
                      return (
                        <div key={key} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--spacing-3)',
                          padding: 'var(--spacing-3)',
                          background: 'var(--color-surface-raised)',
                          borderRadius: 'var(--radius-md)',
                        }}>
                          <ScoreRing score={score} color={color} size={64} />
                          <div>
                            <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color }}>{label}</p>
                            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>
                              {score != null ? `Ước lượng ${score}/9` : 'Chưa có dữ liệu'}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="card-footer">
                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                      ⚠️ Đây là điểm ước lượng để luyện tập, không phải điểm IELTS chính thức.
                    </p>
                  </div>
                </div>
              )}

              {/* Audio playback */}
              <div className="card">
                <div className="card-header">
                  <p style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>Nghe lại câu trả lời của bạn</p>
                </div>
                <div className="card-body">
                  {selectedTurnResult.audioUrl ? (
                    <audio src={selectedTurnResult.audioUrl} controls style={{ width: '100%' }} />
                  ) : (
                    <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
                      Audio chưa khả dụng
                    </p>
                  )}
                </div>
              </div>

              {/* Transcript */}
              {selectedTurnResult.transcript && (
                <div className="card">
                  <div className="card-header">
                    <p style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>Transcript</p>
                  </div>
                  <div className="card-body">
                    <p style={{ fontSize: 'var(--font-size-sm)', lineHeight: 2, color: 'var(--color-text)' }}>
                      {selectedTurnResult.transcript}
                    </p>
                  </div>
                </div>
              )}

              {/* AI Feedback */}
              {selectedTurnResult.feedback && (
                <div className="card">
                  <div className="card-header">
                    <p style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>Nhận xét từ AI</p>
                  </div>
                  <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
                    {selectedTurnResult.feedback.grammar && (
                      <div>
                        <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-warning)', marginBottom: 4 }}>
                          Ngữ pháp
                        </p>
                        <p style={{ fontSize: 'var(--font-size-sm)', lineHeight: 1.7 }}>{selectedTurnResult.feedback.grammar}</p>
                      </div>
                    )}
                    {selectedTurnResult.feedback.vocabulary && (
                      <div>
                        <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-success)', marginBottom: 4 }}>
                          Từ vựng
                        </p>
                        <p style={{ fontSize: 'var(--font-size-sm)', lineHeight: 1.7 }}>{selectedTurnResult.feedback.vocabulary}</p>
                      </div>
                    )}
                    {selectedTurnResult.feedback.pronunciation && (
                      <div>
                        <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-error)', marginBottom: 4 }}>
                          Phát âm
                        </p>
                        <p style={{ fontSize: 'var(--font-size-sm)', lineHeight: 1.7 }}>{selectedTurnResult.feedback.pronunciation}</p>
                      </div>
                    )}
                    {selectedTurnResult.feedback.suggestions && (
                      <div>
                        <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-primary)', marginBottom: 4 }}>
                          Gợi ý cải thiện
                        </p>
                        <p style={{ fontSize: 'var(--font-size-sm)', lineHeight: 1.7 }}>{selectedTurnResult.feedback.suggestions}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Peer notes */}
              {selectedTurnResult.peerNotes?.length > 0 && (
                <div className="card">
                  <div className="card-header">
                    <p style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                      Ghi chú từ {state.partnerName} ({selectedTurnResult.peerNotes.length} lỗi)
                    </p>
                  </div>
                  <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
                    {selectedTurnResult.peerNotes.sort((a, b) => a.timestampMs - b.timestampMs).map((note, i) => {
                      const { label, color } = ERROR_TYPE_LABELS[note.errorType] || {};
                      return (
                        <div key={i} style={{
                          padding: 'var(--spacing-3)',
                          borderLeft: `3px solid ${color}`,
                          background: 'var(--color-surface-raised)',
                          borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                        }}>
                          <div style={{ display: 'flex', gap: 'var(--spacing-2)', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color }}>{label}</span>
                            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                              · lúc {Math.round(note.timestampMs / 1000)}s
                            </span>
                          </div>
                          {note.noteText && (
                            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text)' }}>
                              {note.noteText}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)' }}>
              Chọn một lượt nói để xem kết quả
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
