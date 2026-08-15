import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { uploadAudio, submitPeerNotes, completeReview } from '../services/api';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { ErrorScreen } from '../components/ui/ErrorScreen';

const ERROR_TYPE_CONFIG = {
  grammar_error:        { label: 'Grammar error',              badgeClass: 'bg-amber-100 text-amber-700',  borderColor: '#f59e0b' },
  collocation_issue:    { label: 'Collocation / word choice',  badgeClass: 'bg-red-100 text-red-700',      borderColor: '#ef4444' },
  pause_filler:         { label: 'Pause / filler',             badgeClass: 'bg-amber-100 text-amber-700',  borderColor: '#f59e0b' },
  false_start:          { label: 'False start',                badgeClass: 'bg-[#EAC7B9] text-[#B5674A]', borderColor: '#D97757' },
  pronunciation_issue:  { label: 'Pronunciation issue',        badgeClass: 'bg-red-100 text-red-700',      borderColor: '#ef4444' },
  advanced_vocab:       { label: 'Advanced vocab',             badgeClass: 'bg-emerald-100 text-emerald-700', borderColor: '#10b981' },
  good_connector:       { label: 'Good connector',             badgeClass: 'bg-emerald-100 text-emerald-700', borderColor: '#10b981' },
  idea_development:     { label: 'Strong idea',                badgeClass: 'bg-emerald-100 text-emerald-700', borderColor: '#10b981' },
  pronunciation:        { label: 'Phát âm',                    badgeClass: 'bg-red-100 text-red-700',      borderColor: '#ef4444' },
  grammar:              { label: 'Ngữ pháp',                   badgeClass: 'bg-amber-100 text-amber-700',  borderColor: '#f59e0b' },
  vocabulary:           { label: 'Từ vựng',                    badgeClass: 'bg-emerald-100 text-emerald-700', borderColor: '#10b981' },
  fluency:              { label: 'Trôi chảy',                  badgeClass: 'bg-violet-100 text-violet-700', borderColor: '#7c3aed' },
};

// Enabled in production so each user's audio is uploaded and the AI pipeline
// runs. Set VITE_AI_AUDIO_UPLOAD_ENABLED=false to test the video-call flow
// without AI (keeps the old "Kết thúc test" behaviour).
const AI_AUDIO_UPLOAD_ENABLED = import.meta.env.VITE_AI_AUDIO_UPLOAD_ENABLED !== 'false';

export default function ReviewPage() {
  const { state, dispatch } = useSession();
  const navigate = useNavigate();
  // Bấm "Hoàn tất review" là rời trang có chủ đích, nên lúc đó phải tắt lời cảnh
  // báo `beforeunload` — nếu không thì chính hành động đúng lại bị trình duyệt hỏi
  // "bạn có chắc muốn rời trang".
  const isCompletingRef = useRef(false);

  const [selectedTurnId, setSelectedTurnId] = useState(null);
  const [noteEdits, setNoteEdits] = useState({});
  const [uploadStatuses, setUploadStatuses] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [audioUrls, setAudioUrls] = useState({});
  const audioRef = useRef(null);
  const uploadInFlightRef = useRef(new Set());

  const partnerTurns = state.turns.filter((t) => t.speakerRole !== state.role);
  const myTurns = state.turns.filter((t) => t.speakerRole === state.role);
  const selectedTurn = state.turns.find((t) => t.id === selectedTurnId);

  useEffect(() => {
    if (partnerTurns.length > 0 && !selectedTurnId) {
      setSelectedTurnId(partnerTurns[0].id);
    }
  }, [partnerTurns.length]);

  // Toàn bộ dữ liệu của bước này nằm trong bộ nhớ của tab: ghi chú vừa đánh dấu,
  // và ghi âm các lượt mình nói đang được tải lên nền. Tải lại trang là mất hết và
  // KHÔNG lấy lại được — nên phải hỏi trước, thay vì để người dùng mất 15 phút
  // luyện tập vì một lần bấm F5.
  useEffect(() => {
    if (!state.sessionId) return undefined;

    function handleBeforeUnload(event) {
      if (isCompletingRef.current) return;
      event.preventDefault();
      // Trình duyệt hiện câu chữ của riêng nó, không dùng chuỗi này; nhưng vẫn
      // phải gán để Chrome và Safari chịu hiện hộp thoại.
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [state.sessionId]);

  useEffect(() => {
    if (!AI_AUDIO_UPLOAD_ENABLED) {
      const disabledStatuses = {};
      state.turns
        .filter((t) => t.speakerRole === state.role)
        .forEach((turn) => {
          disabledStatuses[turn.id] = 'disabled';
        });
      setUploadStatuses(disabledStatuses);
      return;
    }

    async function uploadTurn(turn) {
      const blob = state.localAudioByTurnId[turn.id];
      if (!blob) {
        setUploadStatuses((prev) => { if (prev[turn.id]) return prev; return { ...prev, [turn.id]: 'pending' }; });
        return;
      }
      if (uploadInFlightRef.current.has(turn.id)) return;
      if (['done','uploading','error'].includes(uploadStatuses[turn.id])) return;

      uploadInFlightRef.current.add(turn.id);
      setUploadStatuses((prev) => ({ ...prev, [turn.id]: 'uploading' }));
      dispatch({ type: 'SET_UPLOAD_STATUS', payload: { turnId: turn.id, status: 'uploading' } });

      try {
        await uploadAudio({ audio: blob, turnId: turn.id, sessionId: state.sessionId, speakerId: state.userId, questionId: turn.questionId, durationMs: turn.durationMs });
        setUploadStatuses((prev) => ({ ...prev, [turn.id]: 'done' }));
        dispatch({ type: 'SET_UPLOAD_STATUS', payload: { turnId: turn.id, status: 'done' } });
      } catch (err) {
        console.error(`[Review] Upload failed for turn ${turn.id}:`, err.message);
        setUploadStatuses((prev) => ({ ...prev, [turn.id]: 'error' }));
        dispatch({ type: 'SET_UPLOAD_STATUS', payload: { turnId: turn.id, status: 'error' } });
      } finally {
        uploadInFlightRef.current.delete(turn.id);
      }
    }
    state.turns.filter((t) => t.speakerRole === state.role).forEach((t) => uploadTurn(t));
  }, [state.turns, state.role, state.localAudioByTurnId, state.sessionId, state.userId, uploadStatuses, dispatch]);

  useEffect(() => {
    const nextUrls = {};
    Object.entries(state.remoteAudioByTurnId).forEach(([turnId, blob]) => {
      if (blob) {
        nextUrls[turnId] = URL.createObjectURL(blob);
      }
    });
    setAudioUrls(nextUrls);

    return () => {
      Object.values(nextUrls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [state.remoteAudioByTurnId]);

  const notesForSelectedTurn = state.peerNotes.filter((n) => n.turnId === selectedTurnId);

  function handleMarkerClick(timestampMs) {
    if (audioRef.current) {
      audioRef.current.currentTime = timestampMs / 1000;
      audioRef.current.play();
    }
  }

  function handleNoteEdit(clientNoteId, newText) {
    setNoteEdits((prev) => ({ ...prev, [clientNoteId]: newText }));
    dispatch({ type: 'UPDATE_PEER_NOTE', payload: { clientNoteId, noteText: newText } });
  }

  async function handleRetryUpload(turn) {
    if (!AI_AUDIO_UPLOAD_ENABLED) return;

    const blob = state.localAudioByTurnId[turn.id];
    if (!blob) return;
    setUploadStatuses((prev) => ({ ...prev, [turn.id]: 'uploading' }));
    dispatch({ type: 'SET_UPLOAD_STATUS', payload: { turnId: turn.id, status: 'uploading' } });
    try {
      await uploadAudio({ audio: blob, turnId: turn.id, sessionId: state.sessionId, speakerId: state.userId, questionId: turn.questionId, durationMs: turn.durationMs });
      setUploadStatuses((prev) => ({ ...prev, [turn.id]: 'done' }));
      dispatch({ type: 'SET_UPLOAD_STATUS', payload: { turnId: turn.id, status: 'done' } });
    } catch (err) {
      setUploadStatuses((prev) => ({ ...prev, [turn.id]: 'error' }));
      dispatch({ type: 'SET_UPLOAD_STATUS', payload: { turnId: turn.id, status: 'error' } });
    }
  }

  async function handleCompleteReview() {
    isCompletingRef.current = true;
    // We no longer hard-block completion when a turn's audio failed to upload:
    // the backend marks any un-uploaded turns as failed so the AI pipeline still
    // runs on the audio that made it, and the partner isn't blocked from getting
    // results. The button stays disabled only while an upload is in flight.
    setIsSubmitting(true);
    try {
      const notes = state.peerNotes.map((n) => ({ ...n, noteText: noteEdits[n.clientNoteId] !== undefined ? noteEdits[n.clientNoteId] : n.noteText }));
      if (notes.length > 0) await submitPeerNotes({ sessionId: state.sessionId, listenerId: state.userId, notes });

      if (AI_AUDIO_UPLOAD_ENABLED) {
        // Peer notes are saved above. They are NOT an input to the AI — the
        // holistic grader never sees them; they are shown next to the results as
        // the partner's own feedback. What they do gate is *when* the AI runs, so
        // flag this user's review as done. The backend starts the AI pipeline
        // once BOTH peers have completed. That request runs the pipeline
        // synchronously and can take 1-3 min, so fire it without awaiting and go
        // to the waiting screen, which polls for results. Do NOT RESET here —
        // WaitingAI/Results still need sessionId, userId, turns and partnerName.
        completeReview({ sessionId: state.sessionId, userId: state.userId })
          .catch((err) => console.error('[Review] completeReview failed:', err.message));
        navigate('/waiting-review');
      } else {
        dispatch({ type: 'RESET' });
        navigate('/');
      }
    } catch (err) {
      console.error('[Review] Complete review failed:', err.message);
      // Gửi không được thì người dùng còn ở lại trang với ghi chú chưa lưu, nên
      // lời cảnh báo trước khi tải lại trang phải bật lại.
      isCompletingRef.current = false;
      setIsSubmitting(false);
    }
  }

  const failedUploads = myTurns.filter((t) => ['error','no_audio'].includes(uploadStatuses[t.id]));
  const pendingUploads = myTurns.filter((t) => ['uploading','pending',undefined,null].includes(uploadStatuses[t.id]) && uploadStatuses[t.id] !== 'done');

  const partLabel = (turn) => {
    if (turn.partNumber === 1) return `Part 1 · Câu ${turn.turnIndex + 1}`;
    if (turn.partNumber === 2) return `Part 2 · Cue Card`;
    return `Part 3 · Câu ${turn.turnIndex + 1}`;
  };

  // Tải lại trang hoặc vào thẳng /review là mất sạch state trong bộ nhớ tab. Bản
  // trước vẫn dựng nguyên giao diện: danh sách lượt rỗng, tên đối tác là
  // "undefined", badge xanh "Đã tải audio" (vì không còn lượt nào để chờ), và nút
  // "Hoàn tất review" BẤM ĐƯỢC — bấm vào thì gọi completeReview với sessionId
  // null, thất bại im lặng, rồi vẫn nhảy sang màn chờ AI và ngồi đó mãi.
  //
  // Ba trang cùng luồng (Session, WaitingAI, Results) đều đã chặn trường hợp này.
  // Ở đây cố ý KHÔNG lặng lẽ đẩy về trang chủ như chúng: người dùng vừa mất công
  // đánh dấu lỗi cả phiên, họ cần biết vì sao mất chứ không phải bị bật về đầu.
  if (!state.sessionId) {
    return (
      <ErrorScreen
        icon="history_toggle_off"
        title="Không còn dữ liệu của phiên luyện này"
        description="Bước nhận xét chỉ giữ dữ liệu trong tab đang mở. Trang vừa được tải lại
          hoặc mở trực tiếp, nên các ghi chú bạn đã đánh dấu không còn nữa và không lấy lại được."
        detail={(
          <ul className="space-y-1.5 list-disc pl-4">
            <li>Ghi chú của bạn cho phiên này đã mất, nên bạn cùng luyện sẽ không nhận được chúng.</li>
            <li>
              Ghi âm phần bạn nói được tải lên trong lúc nhận xét. Nếu nó đã tải xong trước đó
              thì vẫn còn trên máy chủ; nếu chưa thì AI sẽ không chấm được phần đó.
            </li>
            <li>Các phiên đã hoàn tất trước đây vẫn xem lại được ở mục Lịch sử luyện tập.</li>
          </ul>
        )}
        actions={(
          <Button onClick={() => { dispatch({ type: 'RESET' }); navigate('/', { replace: true }); }}>
            Về trang chủ
          </Button>
        )}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-50">

      {/* Header */}
      {/* `flex-wrap` để trên điện thoại phần trạng thái và nút xuống hàng, thay vì
          bị nén cùng hàng với tiêu đề. */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 px-4 py-3 sm:px-5 bg-white border-b border-zinc-200 flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="material-symbols-rounded text-zinc-500" style={{ fontSize: 20 }}>rate_review</span>
          <div>
            <h1 className="text-sm font-semibold text-zinc-900">Review phiên luyện</h1>
            <p className="truncate text-xs text-zinc-400">Nghe lại và bổ sung ghi chú cho {state.partnerName}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 ml-auto">
          {!AI_AUDIO_UPLOAD_ENABLED && (
            <Badge variant="secondary">
              <span className="material-symbols-rounded" style={{ fontSize: 12 }}>block</span>
              AI/audio upload đang tắt
            </Badge>
          )}
          {AI_AUDIO_UPLOAD_ENABLED && pendingUploads.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <div className="w-3.5 h-3.5 rounded-full border-2 border-zinc-200 border-t-[#D97757] animate-spin-slow" />
              Đang tải audio... ({myTurns.length - pendingUploads.length}/{myTurns.length})
            </div>
          )}
          {AI_AUDIO_UPLOAD_ENABLED && failedUploads.length > 0 && (
            <Badge variant="destructive">{failedUploads.length} lượt thất bại</Badge>
          )}
          {/* `myTurns.length > 0` là bắt buộc: không có lượt nào thì cũng không có
              gì đang chờ, và badge xanh "Đã tải audio" sẽ hiện ra trong đúng lúc
              chẳng có audio nào được tải lên cả. */}
          {AI_AUDIO_UPLOAD_ENABLED && myTurns.length > 0 && pendingUploads.length === 0 && failedUploads.length === 0 && (
            <Badge variant="success">
              <span className="material-symbols-rounded icon-fill" style={{ fontSize: 11 }}>cloud_done</span>
              Đã tải audio
            </Badge>
          )}
          <Button
            id="complete-review-btn"
            onClick={handleCompleteReview}
            disabled={isSubmitting || myTurns.some((t) => uploadStatuses[t.id] === 'uploading')}
            size="sm"
          >
            {isSubmitting ? (
              <><div className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin-slow" /> Đang gửi...</>
            ) : (
              <><span className="material-symbols-rounded" style={{ fontSize: 15 }}>check</span> {AI_AUDIO_UPLOAD_ENABLED ? 'Hoàn tất review' : 'Kết thúc test'}</>
            )}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 overflow-hidden md:flex-row">

        {/* Danh sách lượt nói. Trên điện thoại là một dải cuộn NGANG ở trên, trên
            máy tính là cột dọc bên trái.
            Bản trước là `w-64 flex-shrink-0` — 256px cứng — nên trên màn 390px thì
            vùng nội dung chính chỉ còn khoảng 130px, không gõ nổi ghi chú. Nặng hơn
            màn kiểm tra thiết bị vì bước này phải nhập chữ, không chỉ đọc. */}
        <div className="flex flex-shrink-0 gap-2 overflow-x-auto border-b border-zinc-200 bg-white p-3 md:w-64 md:flex-col md:gap-1 md:overflow-y-auto md:overflow-x-visible md:border-b-0 md:border-r">
          <p className="hidden text-xs font-medium text-zinc-400 uppercase tracking-wide px-1 mb-1 md:block">
            Lượt của {state.partnerName}
          </p>
          {partnerTurns.map((turn) => {
            const hasAudio = !!state.remoteAudioByTurnId[turn.id];
            const turnNotes = state.peerNotes.filter((n) => n.turnId === turn.id);
            const isSelected = turn.id === selectedTurnId;
            return (
              <button
                key={turn.id}
                onClick={() => setSelectedTurnId(turn.id)}
                // Trên điện thoại mỗi thẻ là một ô rộng cố định trong dải cuộn ngang;
                // từ md trở lên nó trở lại thành một hàng chiếm hết chiều rộng cột.
                className={`w-[180px] flex-shrink-0 text-left px-3 py-2.5 rounded-lg border text-sm transition-colors md:w-full ${
                  isSelected
                    ? 'border-[#EAC7B9] bg-[#F7ECE6] text-[#8A4A33]'
                    : 'border-zinc-200 hover:bg-zinc-50 text-zinc-700 md:border-transparent'
                }`}
              >
                <p className={`text-xs font-medium mb-0.5 ${isSelected ? 'text-[#D97757]' : 'text-zinc-500'}`}>
                  {partLabel(turn)}
                </p>
                <p className="text-xs text-zinc-500 truncate">{turn.questionText}</p>
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {turnNotes.length > 0 && (
                    <Badge variant="default" className="text-[10px] px-1.5 py-0">{turnNotes.length} lỗi</Badge>
                  )}
                  {!hasAudio && (
                    <Badge variant="warning" className="text-[10px] px-1.5 py-0">Mất audio</Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Main panel */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {selectedTurn ? (
            <div className="max-w-2xl mx-auto space-y-5">

              {/* Turn heading */}
              <div>
                <Badge variant="secondary" className="mb-2">{partLabel(selectedTurn)}</Badge>
                <p className="text-base font-semibold text-zinc-900 leading-snug">{selectedTurn.questionText}</p>
              </div>

              {/* Audio */}
              <Card>
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-sm font-medium text-zinc-600">Audio đối tác</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {state.remoteAudioByTurnId[selectedTurnId] ? (
                    <>
                      <audio ref={audioRef} src={audioUrls[selectedTurnId]} controls className="w-full" />
                      {notesForSelectedTurn.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs text-zinc-400 mb-2">Nhấn để nhảy đến lỗi:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {notesForSelectedTurn
                              .sort((a, b) => a.timestampMs - b.timestampMs)
                              .map((note) => {
                                const cfg = ERROR_TYPE_CONFIG[note.errorType] || {};
                                return (
                                  <button
                                    key={note.clientNoteId}
                                    onClick={() => handleMarkerClick(note.timestampMs)}
                                    className={`text-xs font-medium px-2.5 py-1 rounded-full ${cfg.badgeClass} hover:opacity-80 transition-opacity`}
                                  >
                                    {Math.round(note.timestampMs / 1000)}s · {cfg.label}
                                  </button>
                                );
                              })}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="rounded-lg bg-amber-50 border border-amber-100 px-4 py-3">
                      <p className="text-sm font-medium text-amber-800">Không tìm thấy audio đối tác</p>
                      <p className="text-xs text-amber-700 mt-1">
                        Audio đối tác chỉ lưu tạm trên trình duyệt. Bạn vẫn có thể bổ sung ghi chú dựa trên trí nhớ.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Notes */}
              <Card>
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-sm font-medium text-zinc-600">
                    Marker đã đánh dấu ({notesForSelectedTurn.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {notesForSelectedTurn.length === 0 ? (
                    <p className="text-sm text-zinc-400 text-center py-4">Chưa có marker nào được đánh dấu</p>
                  ) : (
                    <div className="space-y-3">
                      {notesForSelectedTurn
                        .sort((a, b) => a.timestampMs - b.timestampMs)
                        .map((note) => {
                          const cfg = ERROR_TYPE_CONFIG[note.errorType] || {};
                          return (
                            <div
                              key={note.clientNoteId}
                              className="rounded-lg border border-zinc-100 p-3"
                              style={{ borderLeft: `3px solid ${cfg.borderColor}` }}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badgeClass}`}>
                                  {cfg.label}
                                </span>
                                <span className="text-xs text-zinc-400">lúc {Math.round(note.timestampMs / 1000)}s</span>
                                <button
                                  onClick={() => handleMarkerClick(note.timestampMs)}
                                  className="ml-auto text-zinc-400 hover:text-zinc-700 transition-colors"
                                  title="Nhảy đến"
                                >
                                  <span className="material-symbols-rounded icon-fill" style={{ fontSize: 16 }}>play_circle</span>
                                </button>
                              </div>
                              <Input
                                value={noteEdits[note.clientNoteId] !== undefined ? noteEdits[note.clientNoteId] : (note.noteText || '')}
                                onChange={(e) => handleNoteEdit(note.clientNoteId, e.target.value)}
                                placeholder="Thêm ghi chú chi tiết..."
                                className="text-xs h-8"
                              />
                            </div>
                          );
                        })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Failed uploads */}
              {failedUploads.length > 0 && (
                <div className="rounded-lg bg-red-50 border border-red-100 p-4">
                  <p className="text-sm font-medium text-red-800 mb-1">Một số lượt nói chưa tải lên được</p>
                  <p className="text-xs text-red-700 mb-3">AI sẽ không chấm điểm các lượt này nếu chưa upload.</p>
                  <div className="flex flex-wrap gap-2">
                    {failedUploads.map((turn) => (
                      <Button
                        key={turn.id}
                        variant="destructive"
                        size="sm"
                        onClick={() => handleRetryUpload(turn)}
                        disabled={uploadStatuses[turn.id] === 'no_audio'}
                      >
                        <span className="material-symbols-rounded" style={{ fontSize: 12 }}>refresh</span>
                        {uploadStatuses[turn.id] === 'no_audio' ? 'Thiếu audio' : 'Tải lại'} {partLabel(turn)}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-zinc-400">
              Chọn một lượt nói để xem
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
