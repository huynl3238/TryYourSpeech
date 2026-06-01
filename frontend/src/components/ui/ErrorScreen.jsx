import { Button } from './button';

export function ErrorScreen({ icon = 'error', title, description, actions, detail }) {
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
      <div className="animate-slide-up max-w-md w-full text-center">

        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-50 border border-red-100 mb-5">
          <span className="material-symbols-rounded text-red-500" style={{ fontSize: 32 }}>
            {icon}
          </span>
        </div>

        <h1 className="text-xl font-semibold text-zinc-900 mb-2">{title}</h1>

        <p className="text-sm text-zinc-500 mb-6 leading-relaxed">{description}</p>

        {detail && (
          <div className="text-left bg-white border border-zinc-200 rounded-lg p-4 mb-6 text-xs text-zinc-600">
            {detail}
          </div>
        )}

        {actions && (
          <div className="flex gap-3 justify-center flex-wrap">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
