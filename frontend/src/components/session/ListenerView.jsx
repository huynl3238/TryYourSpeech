import { useCallback, useEffect, useRef, useState } from 'react';
import { Timer } from '../ui/Timer';
import { useSession } from '../../context/SessionContext';
import { QuestionSupportPanel } from './QuestionSupportPanel';
import { SessionCallControls } from './SessionCallControls';

const MARKER_GROUPS = [
  {
    title: 'Cần chú ý',
    helper: 'Đánh dấu những điểm có thể làm giảm band.',
    items: [
      { key: 'grammar_error', label: 'Grammar error', description: 'Sai thì, mạo từ, verb form, clause', icon: 'spellcheck', shortcut: '1', tone: 'issue' },
      { key: 'collocation_issue', label: 'Collocation / word choice', description: 'Dùng từ chưa tự nhiên hoặc sai cụm', icon: 'menu_book', shortcut: '2', tone: 'issue' },
      { key: 'pause_filler', label: 'Pause / filler', description: 'Ngập ngừng, uh/um, dừng quá lâu', icon: 'more_horiz', shortcut: '3', tone: 'issue' },
      { key: 'false_start', label: 'False start', description: 'Bắt đầu câu rồi sửa/ngắt lại', icon: 'restart_alt', shortcut: '4', tone: 'issue' },
      { key: 'pronunciation_issue', label: 'Pronunciation issue', description: 'Từ không rõ, stress/intonation sai', icon: 'record_voice_over', shortcut: '5', tone: 'issue' },
    ],
  },
  {
    title: 'Điểm tốt',
    helper: 'Gắn cờ điểm tốt để nhận xét không chỉ toàn lỗi.',
    items: [
      { key: 'advanced_vocab', label: 'Advanced vocab', description: 'Từ vựng chủ đề hoặc cụm hay', icon: 'auto_awesome', shortcut: '6', tone: 'positive' },
      { key: 'good_connector', label: 'Good connector', description: 'Nối ý tốt, mạch nói rõ hơn', icon: 'link', shortcut: '7', tone: 'positive' },
      { key: 'idea_development', label: 'Strong idea', description: 'Ý phát triển sâu, ví dụ tốt', icon: 'psychology', shortcut: '8', tone: 'positive' },
    ],
  },
];

const MARKER_TYPES = MARKER_GROUPS.flatMap((group) => group.items);

function getMarkerConfig(errorType) {
  return MARKER_TYPES.find((item) => item.key === errorType) || {
    key: errorType,
    label: errorType,
    description: '',
    icon: 'flag',
    shortcut: '',
    tone: 'issue',
  };
}

function getMarkerLabel(errorType) {
  return getMarkerConfig(errorType).label;
}

function getMarkerBadgeClass(errorType) {
  const config = getMarkerConfig(errorType);
  if (config.tone === 'positive') return 'badge-success';
  if (errorType === 'grammar_error' || errorType === 'pause_filler' || errorType === 'false_start') return 'badge-warning';
  return 'badge-error';
}

export function ListenerView({
  remoteVideoRef,
  localVideoRef,
  turn,
  totalTurns,
  turnStartTime,
  onTurnEnd,
  onEndCall,
}) {
  const { state, dispatch } = useSession();
  const [markerState, setMarkerState] = useState(null);
  const [pendingTimestamp, setPendingTimestamp] = useState(0);
  const [pendingType, setPendingType] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [markers, setMarkers] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const noteInputRef = useRef(null);
  const elapsedRef = useRef(0);

  const totalMs = turn?.durationMs || 45000;

  useEffect(() => {
    setMarkerState(null);
    setPendingTimestamp(0);
    setPendingType(null);
    setNoteText('');
    setMarkers([]);
    setElapsed(0);
    elapsedRef.current = 0;
  }, [turn?.id]);

  useEffect(() => {
    const start = turnStartTime || performance.now();
    const id = setInterval(() => {
      const nextElapsed = performance.now() - start;
      setElapsed(nextElapsed);
      elapsedRef.current = nextElapsed;
    }, 200);

    return () => clearInterval(id);
  }, [turnStartTime]);

  const saveMarker = useCallback(() => {
    if (!pendingType || !turn?.id) return;

    const note = {
      clientNoteId: crypto.randomUUID(),
      turnId: turn.id,
      timestampMs: Math.round(pendingTimestamp),
      errorType: pendingType,
      noteText: noteText.trim() || null,
    };

    setMarkers((prev) => [...prev, note]);
    dispatch({ type: 'ADD_PEER_NOTE', payload: note });
    setMarkerState(null);
    setPendingType(null);
    setNoteText('');
  }, [pendingType, pendingTimestamp, noteText, turn, dispatch]);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Tab' && markerState === null) {
        e.preventDefault();
        setPendingTimestamp(elapsedRef.current);
        setMarkerState('choosing');
        return;
      }

      if (markerState === 'choosing' && MARKER_TYPES.some((item) => item.shortcut === e.key)) {
        e.preventDefault();
        const type = MARKER_TYPES.find((item) => item.shortcut === e.key).key;
        setPendingType(type);
        setMarkerState('noting');
        setTimeout(() => noteInputRef.current?.focus(), 50);
        return;
      }

      if (e.key === 'Escape' && markerState !== null) {
        setMarkerState(null);
        setPendingType(null);
        setNoteText('');
        return;
      }

      if (e.key === 'Enter' && markerState === 'noting') {
        e.preventDefault();
        saveMarker();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [markerState, saveMarker]);

  const progressPct = Math.min((elapsed / totalMs) * 100, 100);

  return (
    <div className="session-layout">
      <div className="session-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)', minWidth: 0 }}>
          <span className="badge badge-listener" style={{ gap: 4 }}>
            <span className="material-symbols-rounded" style={{ fontSize: 14 }}>hearing</span>
            Bạn đang nghe
          </span>
          <span style={{ color: '#5f6368', fontSize: 'var(--font-size-xs)' }}>
            Part {turn?.partNumber} · Lượt {turn?.turnIndex}/{totalTurns}
          </span>
        </div>

        <div className="session-timer-block compact">
          <span>Thời gian lượt nói</span>
          <Timer durationMs={totalMs} startedAtMs={turnStartTime} onEnd={onTurnEnd} />
        </div>

        <SessionCallControls remoteVideoRef={remoteVideoRef} onEndCall={onEndCall} compact />
      </div>

      <div className="session-main">
        <div className="video-primary">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />

          <div className="video-label">
            <span className="material-symbols-rounded" style={{ fontSize: 12, marginRight: 4 }}>person</span>
            {state.partnerName || 'Đối tác luyện tập'}
          </div>

          <div className="video-self-preview">
            <video ref={localVideoRef} autoPlay playsInline muted />
            <div className="video-label" style={{ fontSize: 10 }}>Bạn</div>
          </div>
        </div>

        <QuestionSupportPanel turn={turn} totalTurns={totalTurns} isSpeaker={false} />
      </div>

      <div className="session-footer listener-note-footer">
        <div style={{ marginBottom: 'var(--spacing-3)', position: 'relative' }}>
          <div className="timeline-bar">
            <div className="timeline-progress" style={{ width: `${progressPct}%` }} />
            {markers.map((marker) => (
              <div
                key={marker.clientNoteId}
                className={`timeline-marker ${marker.errorType}`}
                style={{ left: `${(marker.timestampMs / totalMs) * 100}%` }}
                title={`${getMarkerLabel(marker.errorType)} · ${Math.round(marker.timestampMs / 1000)}s${marker.noteText ? ` · ${marker.noteText}` : ''}`}
              />
            ))}
          </div>
        </div>

        {markerState === null && (
          <div className="listener-footer-row">
            <div className="listener-tab-hint">
              <kbd>TAB</kbd>
              <span>Đánh dấu nhanh · {markers.length} marker đã ghi · Mic của bạn tắt trong lượt nghe</span>
            </div>
            <div className="listener-recent-markers">
              {markers.slice(-3).map((marker) => (
                <span key={marker.clientNoteId} className={`badge ${getMarkerBadgeClass(marker.errorType)}`}>
                  {getMarkerLabel(marker.errorType)} · {Math.round(marker.timestampMs / 1000)}s
                </span>
              ))}
            </div>
          </div>
        )}

        {markerState === 'choosing' && (
          <div className="marker-popup animate-slide-up">
            <p>
              <span className="material-symbols-rounded">flag</span>
              Marker lúc {Math.round(pendingTimestamp / 1000)}s · Chọn loại để gửi cho bạn học:
            </p>
            <div className="marker-choice-groups">
              {MARKER_GROUPS.map((group) => (
                <div className="marker-choice-group" key={group.title}>
                  <div className="marker-choice-heading">
                    <strong>{group.title}</strong>
                    <span>{group.helper}</span>
                  </div>
                  <div className="marker-choice-grid">
                    {group.items.map((markerType) => (
                      <button
                        key={markerType.key}
                        className={`error-type-btn ${markerType.key} marker-tone-${markerType.tone}`}
                        onClick={() => {
                          setPendingType(markerType.key);
                          setMarkerState('noting');
                          setTimeout(() => noteInputRef.current?.focus(), 50);
                        }}
                      >
                        <span className="material-symbols-rounded" style={{ fontSize: 18 }}>{markerType.icon}</span>
                        <span>
                          <span className="marker-choice-label"><kbd>{markerType.shortcut}</kbd>{markerType.label}</span>
                          <small>{markerType.description}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <button className="btn btn-ghost btn-sm marker-cancel-btn" onClick={() => setMarkerState(null)}>
                Hủy
              </button>
            </div>
          </div>
        )}

        {markerState === 'noting' && (
          <div className="marker-popup animate-slide-up">
            <div className="marker-note-header">
              <span className={`badge ${getMarkerBadgeClass(pendingType)}`}>
                {getMarkerLabel(pendingType)}
              </span>
              <span>lúc {Math.round(pendingTimestamp / 1000)}s</span>
            </div>
            <div className="marker-note-row">
              <textarea
                ref={noteInputRef}
                className="form-input marker-note-input"
                rows={3}
                placeholder="Ghi chú ngắn nếu cần. Có thể bấm Enter để lưu nhanh, bổ sung sau ở phần Review..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    saveMarker();
                  }
                  if (e.key === 'Escape') {
                    setMarkerState(null);
                    setPendingType(null);
                    setNoteText('');
                  }
                }}
              />
              <button className="btn btn-primary btn-sm" onClick={saveMarker}>
                <span className="material-symbols-rounded" style={{ fontSize: 14 }}>check</span>
                Lưu
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setMarkerState(null); setPendingType(null); setNoteText(''); }}>
                Hủy
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
