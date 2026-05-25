import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { uploadAudio, submitPeerNotes, completeReview } from '../services/api';
import { ErrorScreen } from '../components/ui/ErrorScreen';

const ERROR_TYPE_LABELS = {
  pronunciation: { label: 'Phát âm', color: 'var(--color-error)' },
  grammar:       { label: 'Ngữ pháp', color: 'var(--color-warning)' },
  vocabulary:    { label: 'Từ vựng',  color: 'var(--color-success)' },
  fluency:       { label: 'Trôi chảy', color: 'var(--color-speaker)' },
};

export default function ReviewPage() {
  const { state, dispatch } = useSession();
  const navigate = useNavigate();

  const [selectedTurnId, setSelectedTurnId] = useState(null);
  const [noteEdits, setNoteEdits] = useState({});
  const [uploadStatuses, setUploadStatuses] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef(null);
  const audioUrlsRef = useRef({});
  const hasStartedUploads = useRef(false);

  // Partner turns (turns where partner was speaking = my listening turns)
  const partnerTurns = state.turns.filter(
    (t) => t.speakerRole !== state.role
  );

  // My turns (to upload for AI)
  const myTurns = state.turns.filter(
    (t) => t.speakerRole === state.role
  );

  const selectedTurn = state.turns.find((t) => t.id === selectedTurnId);

  // Select first partner turn by default
  useEffect(() => {
    if (partnerTurns.length > 0 && !selectedTurnId) {
      setSelectedTurnId(partnerTurns[0].id);
    }
  }, [partnerTurns.length]);

  // Background upload my audio turns
  useEffect(() => {
    if (hasStartedUploads.current) return;
    hasStartedUploads.current = true;

    async function uploadTurn(turn) {
      const blob = state.localAudioByTurnId[turn.id];
      if (!blob) {
        setUploadStatuses((prev) => ({ ...prev, [turn.id]: 'no_audio' }));
        return;
      }

      setUploadStatuses((prev) => ({ ...prev, [turn.id]: 'uploading' }));
      dispatch({ type: 'SET_UPLOAD_STATUS', payload: { turnId: turn.id, status: 'uploading' } });

      try {
        await uploadAudio({
          audio: blob,
          turnId: turn.id,
          sessionId: state.sessionId,
          speakerId: state.userId,
          questionId: turn.questionId,
          durationMs: turn.durationMs,
        });
        setUploadStatuses((prev) => ({ ...prev, [turn.id]: 'done' }));
        dispatch({ type: 'SET_UPLOAD_STATUS', payload: { turnId: turn.id, status: 'done' } });
      } catch (err) {
        console.error(`[Review] Upload failed for turn ${turn.id}:`, err.message);
        setUploadStatuses((prev) => ({ ...prev, [turn.id]: 'error' }));
        dispatch({ type: 'SET_UPLOAD_STATUS', payload: { turnId: turn.id, status: 'error' } });
      }
    }

    myTurns.forEach((turn) => uploadTurn(turn));
  }, []);

  // Create blob URL for review playback
  useEffect(() => {
    if (!selectedTurnId) return;
    const blob = state.remoteAudioByTurnId[selectedTurnId];
    if (blob && !audioUrlsRef.current[selectedTurnId]) {
      audioUrlsRef.current[selectedTurnId] = URL.createObjectURL(blob);
    }
  }, [selectedTurnId, state.remoteAudioByTurnId]);

  // Get notes for the selected turn
  const notesForSelectedTurn = state.peerNotes.filter(
    (n) => n.turnId === selectedTurnId
  );

  function handleMarkerClick(timestampMs) {
    if (audioRef.current) {
      audioRef.current.currentTime = timestampMs / 1000;
      audioRef.current.play();
    }
  }

  function handleNoteEdit(clientNoteId, newText) {
    setNoteEdits((prev) => ({ ...prev, [clientNoteId]: newText }));
    dispatch({
      type: 'UPDATE_PEER_NOTE',
      payload: { clientNoteId, noteText: newText },
    });
  }

  async function handleRetryUpload(turn) {
    const blob = state.localAudioByTurnId[turn.id];
    if (!blob) return;

    setUploadStatuses((prev) => ({ ...prev, [turn.id]: 'uploading' }));
    try {
      await uploadAudio({
        audio: blob,
        turnId: turn.id,
        sessionId: state.sessionId,
        speakerId: state.userId,
        questionId: turn.questionId,
        durationMs: turn.durationMs,
      });
      setUploadStatuses((prev) => ({ ...prev, [turn.id]: 'done' }));
      dispatch({ type: 'SET_UPLOAD_STATUS', payload: { turnId: turn.id, status: 'done' } });
    } catch (err) {
      setUploadStatuses((prev) => ({ ...prev, [turn.id]: 'error' }));
    }
  }

  async function handleCompleteReview() {
    setIsSubmitting(true);
    try {
      // Submit all peer notes
      const notes = state.peerNotes.map((n) => ({
        ...n,
        noteText: noteEdits[n.clientNoteId] !== undefined ? noteEdits[n.clientNoteId] : n.noteText,
      }));

      if (notes.length > 0) {
        await submitPeerNotes({
          sessionId: state.sessionId,
          listenerId: state.userId,
          notes,
        });
      }

      // Mark review as complete
      await completeReview({
        sessionId: state.sessionId,
        userId: state.userId,
      });

      dispatch({ type: 'SET_PHASE', payload: 'waiting_review' });
      navigate('/waiting-review');
    } catch (err) {
      console.error('[Review] Complete review failed:', err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const failedUploads = myTurns.filter((t) => uploadStatuses[t.id] === 'error');
  const pendingUploads = myTurns.filter((t) => uploadStatuses[t.id] === 'uploading' || uploadStatuses[t.id] === 'pending' || !uploadStatuses[t.id]);

  const partLabel = (turn) => {
    if (turn.partNumber === 1) return `Part 1 · Câu ${turn.turnIndex + 1}`;
    if (turn.partNumber === 2) return `Part 2 · Cue Card`;
    return `Part 3 · Câu ${turn.turnIndex + 1}`;
  };

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
          <span className="material-symbols-rounded" style={{ color: 'var(--color-primary)' }}>rate_review</span>
          <div>
            <h1 style={{ fontSize: 'var(--font-size-base)', fontWeight: 700 }}>Review phiên luyện</h1>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              Nghe lại và bổ sung ghi chú cho {state.partnerName}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)' }}>
          {/* Upload status summary */}
          {pendingUploads.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              <div className="spinner spinner-sm" />
              Đang tải audio của bạn lên... ({myTurns.length - pendingUploads.length}/{myTurns.length})
            </div>
          )}
          {failedUploads.length > 0 && (
            <span className="badge badge-error">
              {failedUploads.length} lượt tải thất bại
            </span>
          )}
          {pendingUploads.length === 0 && failedUploads.length === 0 && (
            <span className="badge badge-success">
              <span className="material-symbols-rounded" style={{ fontSize: 12 }}>cloud_done</span>
              Đã tải audio
            </span>
          )}

          <button
            id="complete-review-btn"
            className="btn btn-primary"
            onClick={handleCompleteReview}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <><div className="spinner spinner-sm" /> Đang gửi...</>
            ) : (
              <>
                <span className="material-symbols-rounded">check</span>
                Hoàn tất review
              </>
            )}
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: Turn list */}
        <div style={{
          width: 260,
          flexShrink: 0,
          borderRight: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
          overflowY: 'auto',
          padding: 'var(--spacing-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacing-2)',
        }}>
          <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--spacing-2)' }}>
            Lượt nói của {state.partnerName}
          </p>
          {partnerTurns.map((turn) => {
            const hasAudio = !!state.remoteAudioByTurnId[turn.id];
            const turnNotes = state.peerNotes.filter((n) => n.turnId === turn.id);
            const isSelected = turn.id === selectedTurnId;

            return (
              <button
                key={turn.id}
                onClick={() => setSelectedTurnId(turn.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: 'var(--spacing-3)',
                  borderRadius: 'var(--radius-md)',
                  border: `1.5px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  background: isSelected ? 'var(--color-primary-subtle)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                }}
              >
                <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: isSelected ? 'var(--color-primary)' : 'var(--color-text)' }}>
                  {partLabel(turn)}
                </p>
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {turn.questionText}
                </p>
                <div style={{ display: 'flex', gap: 'var(--spacing-1)', marginTop: 'var(--spacing-2)', flexWrap: 'wrap' }}>
                  {turnNotes.length > 0 && (
                    <span className="badge badge-primary" style={{ fontSize: 10 }}>
                      {turnNotes.length} lỗi
                    </span>
                  )}
                  {!hasAudio && (
                    <span className="badge badge-warning" style={{ fontSize: 10 }}>
                      Mất audio
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Right: Review panel */}
        <div style={{ flex: 1, overflow: 'auto', padding: 'var(--spacing-6)' }}>
          {selectedTurn ? (
            <div style={{ maxWidth: 700, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-5)' }}>
              {/* Turn info */}
              <div>
                <span className="badge badge-neutral" style={{ marginBottom: 'var(--spacing-3)' }}>
                  {partLabel(selectedTurn)}
                </span>
                <p style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>
                  {selectedTurn.questionText}
                </p>
              </div>

              {/* Audio player */}
              <div className="card">
                <div className="card-body">
                  <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 'var(--spacing-3)' }}>
                    Audio đối tác
                  </p>

                  {state.remoteAudioByTurnId[selectedTurnId] ? (
                    <>
                      <audio
                        ref={audioRef}
                        src={audioUrlsRef.current[selectedTurnId]}
                        controls
                        style={{ width: '100%' }}
                        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime * 1000 || 0)}
                      />

                      {/* Marker timeline */}
                      {notesForSelectedTurn.length > 0 && (
                        <div style={{ marginTop: 'var(--spacing-4)' }}>
                          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--spacing-2)' }}>
                            Nhấn marker để nhảy đến vị trí lỗi:
                          </p>
                          <div style={{ display: 'flex', gap: 'var(--spacing-2)', flexWrap: 'wrap' }}>
                            {notesForSelectedTurn.sort((a, b) => a.timestampMs - b.timestampMs).map((note) => {
                              const { color } = ERROR_TYPE_LABELS[note.errorType] || {};
                              return (
                                <button
                                  key={note.clientNoteId}
                                  onClick={() => handleMarkerClick(note.timestampMs)}
                                  style={{
                                    padding: '4px 10px',
                                    borderRadius: 'var(--radius-full)',
                                    background: color + '15',
                                    border: `1px solid ${color}40`,
                                    color,
                                    fontSize: 'var(--font-size-xs)',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                  }}
                                >
                                  {Math.round(note.timestampMs / 1000)}s · {ERROR_TYPE_LABELS[note.errorType]?.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="alert alert-warning">
                      <span className="material-symbols-rounded" style={{ fontSize: 18 }}>audio_file</span>
                      <div>
                        <p style={{ fontWeight: 600 }}>Không tìm thấy audio đối tác</p>
                        <p style={{ fontSize: 'var(--font-size-xs)', marginTop: 4 }}>
                          Audio đối tác chỉ được lưu tạm trên trình duyệt này. Nếu trang bị tải lại hoặc kết nối bị gián đoạn, audio có thể không còn. Bạn vẫn có thể bổ sung ghi chú dựa trên trí nhớ.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes for this turn */}
              <div className="card">
                <div className="card-header">
                  <p style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                    Ghi chú lỗi ({notesForSelectedTurn.length})
                  </p>
                </div>
                <div className="card-body">
                  {notesForSelectedTurn.length === 0 ? (
                    <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', textAlign: 'center', padding: 'var(--spacing-4)' }}>
                      Chưa có lỗi nào được đánh dấu cho lượt này
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
                      {notesForSelectedTurn.sort((a, b) => a.timestampMs - b.timestampMs).map((note) => {
                        const { label, color } = ERROR_TYPE_LABELS[note.errorType] || {};
                        return (
                          <div key={note.clientNoteId} style={{
                            padding: 'var(--spacing-3)',
                            border: '1px solid var(--color-border)',
                            borderLeft: `3px solid ${color}`,
                            borderRadius: 'var(--radius-md)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', marginBottom: 'var(--spacing-2)' }}>
                              <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color }}>
                                {label}
                              </span>
                              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                                · lúc {Math.round(note.timestampMs / 1000)}s
                              </span>
                              <button
                                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color }}
                                onClick={() => handleMarkerClick(note.timestampMs)}
                                title="Nhảy đến vị trí này"
                              >
                                <span className="material-symbols-rounded" style={{ fontSize: 16 }}>play_circle</span>
                              </button>
                            </div>
                            <input
                              className="form-input"
                              style={{ fontSize: 'var(--font-size-sm)' }}
                              value={noteEdits[note.clientNoteId] !== undefined ? noteEdits[note.clientNoteId] : (note.noteText || '')}
                              onChange={(e) => handleNoteEdit(note.clientNoteId, e.target.value)}
                              placeholder="Thêm ghi chú chi tiết, không bắt buộc..."
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Failed uploads warning */}
              {failedUploads.length > 0 && (
                <div className="alert alert-error">
                  <span className="material-symbols-rounded" style={{ fontSize: 18 }}>cloud_off</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 600 }}>Một số lượt nói của bạn chưa tải lên được</p>
                    <p style={{ fontSize: 'var(--font-size-xs)', marginTop: 4 }}>
                      AI sẽ không thể chấm điểm các lượt này nếu chưa upload thành công.
                    </p>
                    <div style={{ display: 'flex', gap: 'var(--spacing-2)', marginTop: 'var(--spacing-3)', flexWrap: 'wrap' }}>
                      {failedUploads.map((turn) => (
                        <button
                          key={turn.id}
                          className="btn btn-sm btn-danger"
                          onClick={() => handleRetryUpload(turn)}
                        >
                          <span className="material-symbols-rounded" style={{ fontSize: 12 }}>refresh</span>
                          Tải lại {partLabel(turn)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)' }}>
              Chọn một lượt nói để xem
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
