import { Component } from 'react';

// App-wide safety net: any render error in the tree below is caught here and
// shown as a friendly fallback instead of a blank white screen. Uses inline
// styles so the fallback itself never depends on anything that might be broken.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Uncaught render error:', error?.message, info?.componentStack);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#FAFAF9',
          padding: 24,
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: '#FEF2F2',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <span className="material-symbols-rounded" style={{ fontSize: 28, color: '#EF4444' }}>
              error
            </span>
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#1C1917', marginBottom: 8 }}>
            Đã có lỗi xảy ra
          </h1>
          <p style={{ fontSize: 14, color: '#78716C', marginBottom: 20, lineHeight: 1.5 }}>
            Rất tiếc, trang gặp sự cố ngoài dự kiến. Bạn thử tải lại trang hoặc quay về trang chủ nhé.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                fontSize: 14,
                fontWeight: 600,
                padding: '9px 18px',
                borderRadius: 10,
                border: '1px solid #E7E5E4',
                background: '#FFFFFF',
                color: '#44403C',
                cursor: 'pointer',
              }}
            >
              Tải lại trang
            </button>
            <button
              type="button"
              onClick={() => { window.location.href = '/'; }}
              style={{
                fontSize: 14,
                fontWeight: 600,
                padding: '9px 18px',
                borderRadius: 10,
                border: 'none',
                background: '#D97757',
                color: '#FFFFFF',
                cursor: 'pointer',
              }}
            >
              Về trang chủ
            </button>
          </div>
        </div>
      </div>
    );
  }
}
