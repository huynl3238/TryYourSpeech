export function ErrorScreen({ icon = 'error', title, description, actions, detail }) {
  return (
    <div className="page-center">
      <div className="animate-slide-up" style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
        <div style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          background: 'var(--color-error-light)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto var(--spacing-5)',
        }}>
          <span className="material-symbols-rounded" style={{ fontSize: 36, color: 'var(--color-error)' }}>
            {icon}
          </span>
        </div>

        <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, marginBottom: 'var(--spacing-3)' }}>
          {title}
        </h1>

        <p style={{
          color: 'var(--color-text-secondary)',
          fontSize: 'var(--font-size-sm)',
          marginBottom: 'var(--spacing-6)',
          lineHeight: 1.7,
        }}>
          {description}
        </p>

        {detail && (
          <div style={{
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--spacing-4)',
            marginBottom: 'var(--spacing-6)',
            textAlign: 'left',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-secondary)',
          }}>
            {detail}
          </div>
        )}

        {actions && (
          <div style={{ display: 'flex', gap: 'var(--spacing-3)', justifyContent: 'center', flexWrap: 'wrap' }}>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
