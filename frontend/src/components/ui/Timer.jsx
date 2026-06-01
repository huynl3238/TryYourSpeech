import { useEffect, useRef, useState } from 'react';

function getRemainingSeconds(durationMs, startedAtMs) {
  const elapsedMs = Math.max(0, performance.now() - startedAtMs);
  return Math.max(0, Math.ceil((durationMs - elapsedMs) / 1000));
}

export function Timer({ durationMs, onEnd, className = '', startedAtMs }) {
  const startTimeRef = useRef(startedAtMs ?? performance.now());
  const [remaining, setRemaining] = useState(() => getRemainingSeconds(durationMs, startTimeRef.current));
  const hasEndedRef = useRef(false);
  const onEndRef = useRef(onEnd);

  useEffect(() => {
    onEndRef.current = onEnd;
  }, [onEnd]);

  useEffect(() => {
    startTimeRef.current = startedAtMs ?? performance.now();
    hasEndedRef.current = false;
    setRemaining(getRemainingSeconds(durationMs, startTimeRef.current));
  }, [durationMs, startedAtMs]);

  useEffect(() => {
    function updateRemaining() {
      const nextRemaining = getRemainingSeconds(durationMs, startTimeRef.current);
      setRemaining(nextRemaining);

      if (nextRemaining <= 0 && !hasEndedRef.current) {
        hasEndedRef.current = true;
        onEndRef.current?.();
      }
    }

    updateRemaining();

    const id = setInterval(updateRemaining, 250);
    document.addEventListener('visibilitychange', updateRemaining);
    window.addEventListener('focus', updateRemaining);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', updateRemaining);
      window.removeEventListener('focus', updateRemaining);
    };
  }, [durationMs, startedAtMs]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const timerClass = remaining <= 10
    ? 'danger'
    : remaining <= 30
    ? 'warning'
    : '';

  return (
    <span className={`timer ${timerClass} ${className}`}>
      {display}
    </span>
  );
}
