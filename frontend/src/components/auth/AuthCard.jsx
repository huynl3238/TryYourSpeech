// Shared shell and form bits for the sign-in / sign-up / verify / reset screens,
// so all four look like the same product rather than four separate pages.

export function AuthCard({ title, subtitle, children }) {
  return (
    <div className="min-h-screen grid place-items-center bg-[#FAFAF8] p-6">
      <div className="w-full max-w-md bg-white border border-[#EAE7E3] rounded-2xl shadow-sm p-8">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-[#F7ECE6] text-[#D97757] grid place-items-center mx-auto mb-4">
            <span className="material-symbols-rounded" style={{ fontSize: 30 }}>record_voice_over</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#1C1917]">{title}</h1>
          {subtitle && <p className="text-sm text-[#78716C] mt-1.5">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function AuthField({ id, label, hint, value, onChange, type = 'text', ...rest }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-[#57534E] mb-1.5">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full h-11 px-3 rounded-lg border border-[#EAE7E3] text-sm text-[#1C1917] focus:outline-none focus:border-[#D97757] focus:ring-2 focus:ring-[#F7ECE6]"
        {...rest}
      />
      {hint && <p className="text-[11.5px] text-[#A8A29E] mt-1.5 leading-relaxed">{hint}</p>}
    </div>
  );
}

export function FormMessage({ tone = 'error', children }) {
  const styles = tone === 'success'
    ? 'text-[#065F46] bg-[#ECFDF5] border-[#A7F3D0]'
    : 'text-[#991B1B] bg-[#FEF2F2] border-[#FECACA]';

  return (
    <p className={`text-[13px] leading-relaxed border rounded-lg px-3 py-2.5 ${styles}`}>
      {children}
    </p>
  );
}

export function AuthSubmitButton({ submitting, children }) {
  return (
    <button
      type="submit"
      disabled={submitting}
      className="w-full h-11 mt-1 rounded-xl bg-[#D97757] text-white text-sm font-semibold hover:brightness-105 disabled:opacity-60"
    >
      {submitting ? 'Đang xử lý…' : children}
    </button>
  );
}
