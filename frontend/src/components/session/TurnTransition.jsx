import { useEffect } from 'react';

export function TurnTransition({ message, subMessage, onDone, delayMs = 3000 }) {
  useEffect(() => {
    const id = setTimeout(() => { if (onDone) onDone(); }, delayMs);
    return () => clearTimeout(id);
  }, [onDone, delayMs]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(9, 9, 11, 0.92)', backdropFilter: 'blur(12px)' }}
    >
      <div className="animate-scale-in text-center px-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-zinc-800 border border-zinc-700 mb-5">
          <span className="material-symbols-rounded text-zinc-300" style={{ fontSize: 26 }}>
            swap_horiz
          </span>
        </div>
        <h2 className="text-lg font-semibold text-white mb-1.5">{message}</h2>
        {subMessage && <p className="text-sm text-zinc-400">{subMessage}</p>}
        <div className="flex gap-1.5 justify-center mt-5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-zinc-500"
              style={{ animation: `blink 1.2s ${i * 0.2}s ease infinite` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
