import { useEffect } from 'react';

export function TurnTransition({ message, subMessage, onDone, delayMs = 3000 }) {
  useEffect(() => {
    const id = setTimeout(() => {
      if (onDone) onDone();
    }, delayMs);
    return () => clearTimeout(id);
  }, [onDone, delayMs]);

  return (
    <div className="overlay" style={{ zIndex: 200, background: 'rgba(0,0,0,0.85)' }}>
      <div className="animate-scale-in" style={{ textAlign: 'center', color: 'white' }}>
        <div style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: 'var(--color-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto var(--spacing-5)',
          boxShadow: '0 0 0 16px rgba(37,99,235,0.15)',
        }}>
          <span className="material-symbols-rounded" style={{ fontSize: 40, color: 'white' }}>
            swap_horiz
          </span>
        </div>

        <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginBottom: 'var(--spacing-2)' }}>
          {message}
        </h2>

        {subMessage && (
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 'var(--font-size-base)' }}>
            {subMessage}
          </p>
        )}

        <div style={{ marginTop: 'var(--spacing-6)', display: 'flex', gap: 4, justifyContent: 'center' }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.4)',
              animation: `blink 1.2s ${i * 0.2}s ease infinite`,
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}
