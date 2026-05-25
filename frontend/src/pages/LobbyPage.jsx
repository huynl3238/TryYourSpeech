import { useState } from 'react';
import { useSocket } from '../hooks/useSocket';
import { useSession } from '../context/SessionContext';
import { useNavigate } from 'react-router-dom';
import { ErrorScreen } from '../components/ui/ErrorScreen';

const BAND_OPTIONS = [
  { value: 0, label: '0.0' }, { value: 1, label: '1.0' }, { value: 2, label: '2.0' },
  { value: 3, label: '3.0' }, { value: 3.5, label: '3.5' }, { value: 4, label: '4.0' },
  { value: 4.5, label: '4.5' }, { value: 5, label: '5.0' }, { value: 5.5, label: '5.5' },
  { value: 6, label: '6.0' }, { value: 6.5, label: '6.5' }, { value: 7, label: '7.0' },
  { value: 7.5, label: '7.5' }, { value: 8, label: '8.0' }, { value: 8.5, label: '8.5' },
  { value: 9, label: '9.0' },
];

export default function LobbyPage() {
  const [displayName, setDisplayName] = useState('');
  const [band, setBand] = useState(5);
  const [nameError, setNameError] = useState('');
  const { state, dispatch } = useSession();
  const { findMatch, cancelMatch } = useSocket();
  const navigate = useNavigate();

  const isSearching = state.phase === 'searching';
  const isMatched = state.phase === 'matched';

  // When matched, navigate to device check
  if (isMatched) {
    navigate('/device-check');
  }

  function handleSubmit(e) {
    e.preventDefault();
    const name = displayName.trim();
    if (!name) {
      setNameError('Vui lòng nhập tên hiển thị');
      return;
    }
    if (name.length > 100) {
      setNameError('Tên không được vượt quá 100 ký tự');
      return;
    }
    setNameError('');
    findMatch(name, band);
  }

  if (state.error?.type === 'match_error') {
    return (
      <ErrorScreen
        icon="group_off"
        title="Không thể tìm đối tác"
        description={state.error.message}
        actions={
          <button
            className="btn btn-primary"
            onClick={() => {
              dispatch({ type: 'CLEAR_ERROR' });
              dispatch({ type: 'SET_PHASE', payload: 'lobby' });
            }}
          >
            Thử lại
          </button>
        }
      />
    );
  }

  return (
    <div className="page-center" style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>
      <div className="animate-slide-up" style={{ width: '100%', maxWidth: 460 }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 'var(--spacing-8)' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 56,
            height: 56,
            borderRadius: 'var(--radius-lg)',
            background: 'var(--color-primary)',
            marginBottom: 'var(--spacing-4)',
          }}>
            <span className="material-symbols-rounded icon-fill" style={{ fontSize: 28, color: 'white' }}>
              record_voice_over
            </span>
          </div>
          <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginBottom: 'var(--spacing-2)' }}>
            Try Your Speech
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Luyện IELTS Speaking cùng người thật · Nhận phản hồi từ AI
          </p>
        </div>

        {/* Form card */}
        <div className="card">
          <div className="card-body" style={{ padding: 'var(--spacing-8)' }}>
            {!isSearching ? (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-5)' }}>
                {/* Name */}
                <div className="form-group">
                  <label className="form-label" htmlFor="display-name">
                    Tên hiển thị
                  </label>
                  <input
                    id="display-name"
                    className={`form-input ${nameError ? 'error' : ''}`}
                    type="text"
                    placeholder="Ví dụ: Minh Anh"
                    value={displayName}
                    onChange={(e) => { setDisplayName(e.target.value); setNameError(''); }}
                    autoFocus
                    maxLength={100}
                  />
                  {nameError && (
                    <span className="form-error">
                      <span className="material-symbols-rounded" style={{ fontSize: 14 }}>error</span>
                      {nameError}
                    </span>
                  )}
                </div>

                {/* Band selector */}
                <div className="form-group">
                  <label className="form-label" htmlFor="band-select">
                    Band hiện tại <span>(tự khai báo)</span>
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-4)' }}>
                    <input
                      id="band-select"
                      type="range"
                      min={0}
                      max={9}
                      step={0.5}
                      value={band}
                      onChange={(e) => setBand(Number(e.target.value))}
                      style={{ flex: 1, accentColor: 'var(--color-primary)' }}
                    />
                    <span style={{
                      minWidth: 40,
                      textAlign: 'center',
                      fontWeight: 700,
                      fontSize: 'var(--font-size-lg)',
                      color: 'var(--color-primary)',
                    }}>
                      {band}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                    <span>Mới học</span>
                    <span>Band 9</span>
                  </div>
                </div>

                <button id="find-partner-btn" type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }}>
                  <span className="material-symbols-rounded">search</span>
                  Tìm đối tác luyện tập
                </button>

                <p style={{ textAlign: 'center', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                  Hệ thống chỉ ghép nếu chênh lệch band không quá 1.0
                </p>
              </form>
            ) : (
              /* Searching state */
              <div style={{ textAlign: 'center', padding: 'var(--spacing-6) 0' }}>
                <div style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: 'var(--color-primary-light)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto var(--spacing-5)',
                  position: 'relative',
                }}>
                  <span className="material-symbols-rounded" style={{ fontSize: 28, color: 'var(--color-primary)' }}>
                    person_search
                  </span>
                  <div style={{
                    position: 'absolute',
                    inset: -6,
                    borderRadius: '50%',
                    border: '2px solid var(--color-primary)',
                    borderTopColor: 'transparent',
                    animation: 'spin 1s linear infinite',
                  }} />
                </div>

                <h2 style={{ fontWeight: 700, fontSize: 'var(--font-size-xl)', marginBottom: 'var(--spacing-2)' }}>
                  Đang tìm đối tác...
                </h2>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--spacing-5)' }}>
                  Xin chào <strong>{displayName}</strong>! Hệ thống đang tìm người có Band {band} ± 1.0 để luyện tập cùng bạn.
                </p>

                <div style={{
                  background: 'var(--color-surface-raised)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--spacing-3)',
                  marginBottom: 'var(--spacing-5)',
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-muted)',
                }}>
                  💡 Trong lúc chờ, hãy chuẩn bị sẵn mic và camera
                </div>

                <button
                  className="btn btn-secondary"
                  onClick={cancelMatch}
                >
                  <span className="material-symbols-rounded">close</span>
                  Huỷ tìm kiếm
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <p style={{ textAlign: 'center', marginTop: 'var(--spacing-5)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
          Không lưu tài khoản · Không cần đăng ký
        </p>
      </div>
    </div>
  );
}
