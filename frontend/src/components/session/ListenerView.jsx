import { useState, useEffect, useCallback, useRef } from 'react';
import { Timer } from '../ui/Timer';
import { useSession } from '../../context/SessionContext';

const ERROR_TYPES = [
  { key: 'pronunciation', label: 'Phát âm', icon: 'record_voice_over', shortcut: '1' },
  { key: 'grammar',       label: 'Ngữ pháp', icon: 'spellcheck',        shortcut: '2' },
  { key: 'vocabulary',    label: 'Từ vựng',  icon: 'menu_book',          shortcut: '3' },
  { key: 'fluency',       label: 'Trôi chảy', icon: 'speed',             shortcut: '4' },
];

export function ListenerView({
  remoteVideoRef,
  localVideoRef,
  turn,
  turnStartTime,
  onTurnEnd,
}) {
  const { state, dispatch } = useSession();
  const [markerState, setMarkerState] = useState(null); // null | 'choosing' | 'noting'
  const [pendingTimestamp, setPendingTimestamp] = useState(0);
  const [pendingType, setPendingType] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [markers, setMarkers] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const noteInputRef = useRef(null);
  const elapsedRef = useRef(0);

  const totalMs = turn?.durationMs || 45000;

  // Track elapsed time
  useEffect(() => {
    const start = turnStartTime || Date.now();
    const id = setInterval(() => {
      const e = Date.now() - start;
      setElapsed(e);
      elapsedRef.current = e;
    }, 200);
    return () => clearInterval(id);
  }, [turnStartTime]);

  // TAB key handler
  useEffect(() => {
    function handleKeyDown(e) {
      // TAB → open marker chooser
      if (e.key === 'Tab' && markerState === null) {
        e.preventDefault();
        const ts = elapsedRef.current;
        setPendingTimestamp(ts);
        setMarkerState('choosing');
        return;
      }
      // 1-4 → select error type shortcut
      if (markerState === 'choosing' && ['1','2','3','4'].includes(e.key)) {
        e.preventDefault();
        const type = ERROR_TYPES[parseInt(e.key) - 1].key;
        setPendingType(type);
        setMarkerState('noting');
        setTimeout(() => noteInputRef.current?.focus(), 50);
        return;
      }
      // Escape → cancel
      if (e.key === 'Escape' && markerState !== null) {
        setMarkerState(null);
        setPendingType(null);
        setNoteText('');
        return;
      }
      // Enter → save note
      if (e.key === 'Enter' && markerState === 'noting') {
        e.preventDefault();
        saveMarker();
        return;
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [markerState, pendingType, noteText]);

  const saveMarker = useCallback(() => {
    if (!pendingType) return;
    const note = {
      clientNoteId: crypto.randomUUID(),
      turnId: turn.id,
      timestampMs: pendingTimestamp,
      errorType: pendingType,
      noteText: noteText.trim() || null,
    };
    setMarkers((prev) => [...prev, note]);
    dispatch({ type: 'ADD_PEER_NOTE', payload: note });
    setMarkerState(null);
    setPendingType(null);
    setNoteText('');
  }, [pendingType, pendingTimestamp, noteText, turn, dispatch]);

  const progressPct = Math.min((elapsed / totalMs) * 100, 100);

  return (
    <div className="session-layout">
      {/* Header */}
      <div className="session-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)' }}>
          <span className="badge badge-listener" style={{ gap: 4 }}>
            <span className="material-symbols-rounded" style={{ fontSize: 14 }}>hearing</span>
            Bạn đang nghe
          </span>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 'var(--font-size-xs)' }}>
            Part {turn?.partNumber} · Câu {turn?.turnIndex}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-4)' }}>
          <Timer durationMs={totalMs} onEnd={onTurnEnd} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', color: 'rgba(255,255,255,0.7)', fontSize: 'var(--font-size-xs)' }}>
          <span className="material-symbols-rounded" style={{ fontSize: 16 }}>mic_off</span>
          Mic đang tắt
        </div>
      </div>

      {/* Main video */}
      <div className="session-main">
        <div className="video-primary">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />

          {/* Partner label */}
          <div className="video-label">
            <span className="material-symbols-rounded" style={{ fontSize: 12, marginRight: 4 }}>person</span>
            {state.partnerName || 'Đối tác luyện tập'}
          </div>

          {/* Self preview */}
          <div className="video-self-preview">
            <video ref={localVideoRef} autoPlay playsInline muted />
            <div className="video-label" style={{ fontSize: 10 }}>Bạn</div>
          </div>
        </div>
      </div>

      {/* Question strip */}
      <div style={{
        background: '#1e293b',
        borderTop: '1px solid #334155',
        padding: 'var(--spacing-3) var(--spacing-5)',
      }}>
        <p style={{
          color: 'rgba(255,255,255,0.9)',
          fontSize: 'var(--font-size-sm)',
          fontWeight: 500,
          textAlign: 'center',
        }}>
          {turn?.questionText || 'Đang tải câu hỏi...'}
        </p>
      </div>

      {/* Timeline & Marker controls */}
      <div className="session-footer" style={{ paddingBottom: 'var(--spacing-4)' }}>
        {/* Timeline */}
        <div style={{ marginBottom: 'var(--spacing-3)', position: 'relative' }}>
          <div className="timeline-bar">
            <div className="timeline-progress" style={{ width: `${progressPct}%` }} />
            {markers.map((m) => (
              <div
                key={m.clientNoteId}
                className={`timeline-marker ${m.errorType}`}
                style={{ left: `${(m.timestampMs / totalMs) * 100}%` }}
                title={`${m.errorType} · ${Math.round(m.timestampMs / 1000)}s${m.noteText ? ` · ${m.noteText}` : ''}`}
              />
            ))}
          </div>
        </div>

        {/* TAB hint / Marker popup */}
        {markerState === null && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-2)',
              color: 'rgba(255,255,255,0.5)',
              fontSize: 'var(--font-size-xs)',
            }}>
              <kbd style={{
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 4,
                padding: '2px 6px',
                fontFamily: 'monospace',
                fontSize: 11,
                color: 'rgba(255,255,255,0.8)',
              }}>TAB</kbd>
              <span>Đánh dấu lỗi · {markers.length} lỗi đã ghi</span>
            </div>
            <div style={{ display: 'flex', gap: 'var(--spacing-2)' }}>
              {markers.slice(-3).map((m) => (
                <span key={m.clientNoteId} className={`badge badge-${m.errorType === 'pronunciation' ? 'error' : m.errorType === 'grammar' ? 'warning' : m.errorType === 'vocabulary' ? 'success' : 'speaker'}`}
                  style={{ fontSize: 10 }}>
                  {m.errorType === 'pronunciation' ? 'Phát âm' : m.errorType === 'grammar' ? 'Ngữ pháp' : m.errorType === 'vocabulary' ? 'Từ vựng' : 'Trôi chảy'}
                  {' · '}{Math.round(m.timestampMs / 1000)}s
                </span>
              ))}
            </div>
          </div>
        )}

        {markerState === 'choosing' && (
          <div className="animate-slide-up" style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--spacing-3)',
          }}>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 'var(--font-size-xs)', marginBottom: 'var(--spacing-2)' }}>
              Lỗi lúc {Math.round(pendingTimestamp / 1000)}s — Chọn loại lỗi:
            </p>
            <div style={{ display: 'flex', gap: 'var(--spacing-2)', flexWrap: 'wrap' }}>
              {ERROR_TYPES.map((et) => (
                <button
                  key={et.key}
                  className={`error-type-btn ${et.key}`}
                  style={{ color: 'rgba(255,255,255,0.8)', borderColor: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)' }}
                  onClick={() => {
                    setPendingType(et.key);
                    setMarkerState('noting');
                    setTimeout(() => noteInputRef.current?.focus(), 50);
                  }}
                >
                  <span className="material-symbols-rounded" style={{ fontSize: 14 }}>{et.icon}</span>
                  <kbd style={{ opacity: 0.5, fontSize: 10 }}>{et.shortcut}</kbd>
                  {et.label}
                </button>
              ))}
              <button className="btn btn-ghost btn-sm" style={{ color: 'rgba(255,255,255,0.4)' }}
                onClick={() => setMarkerState(null)}>
                Huỷ
              </button>
            </div>
          </div>
        )}

        {markerState === 'noting' && (
          <div className="animate-slide-up" style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--spacing-3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)', marginBottom: 'var(--spacing-2)' }}>
              <span className={`badge ${pendingType === 'pronunciation' ? 'badge-error' : pendingType === 'grammar' ? 'badge-warning' : pendingType === 'vocabulary' ? 'badge-success' : 'badge-speaker'}`}>
                {ERROR_TYPES.find(e => e.key === pendingType)?.label}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 'var(--font-size-xs)' }}>
                lúc {Math.round(pendingTimestamp / 1000)}s
              </span>
            </div>
            <div style={{ display: 'flex', gap: 'var(--spacing-2)' }}>
              <input
                ref={noteInputRef}
                className="form-input"
                style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.15)', color: 'white', flex: 1 }}
                placeholder="Ghi chú ngắn, không bắt buộc..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); saveMarker(); }
                  if (e.key === 'Escape') { setMarkerState(null); setPendingType(null); setNoteText(''); }
                }}
              />
              <button className="btn btn-primary btn-sm" onClick={saveMarker}>
                <span className="material-symbols-rounded" style={{ fontSize: 14 }}>check</span>
                Lưu
              </button>
              <button className="btn btn-ghost btn-sm" style={{ color: 'rgba(255,255,255,0.5)' }}
                onClick={() => { setMarkerState(null); setPendingType(null); setNoteText(''); }}>
                Huỷ
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
