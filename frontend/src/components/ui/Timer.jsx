import { useEffect, useState } from 'react';

export function Timer({ durationMs, onEnd, className = '' }) {
  const [remaining, setRemaining] = useState(Math.ceil(durationMs / 1000));

  useEffect(() => {
    setRemaining(Math.ceil(durationMs / 1000));
  }, [durationMs]);

  useEffect(() => {
    if (remaining <= 0) {
      if (onEnd) onEnd();
      return;
    }

    const id = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining, onEnd]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const timerClass = remaining <= 0
    ? 'danger'
    : remaining <= 10
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
