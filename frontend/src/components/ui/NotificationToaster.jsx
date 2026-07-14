import { useEffect, useState } from 'react';
import { startNotificationsRealtime, onNotification } from '../../services/notificationsRealtime';
import { getIdentity } from '../../utils/identity';

const AUTO_DISMISS_MS = 6000;

// App-wide toaster: pops a floating card whenever a realtime "notification:new"
// ping arrives, so users notice consent/mentor events without watching the
// sidebar badge. Purely visual — the authoritative list still lives in the
// Notifications panel.
export function NotificationToaster() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    if (!getIdentity()?.userId) return undefined;

    startNotificationsRealtime();

    return onNotification((payload) => {
      const toast = {
        key: `${payload?.id || 'n'}-${Date.now()}`,
        title: payload?.title || 'Bạn có thông báo mới',
      };
      setToasts((current) => [...current, toast].slice(-3));
      setTimeout(() => {
        setToasts((current) => current.filter((t) => t.key !== toast.key));
      }, AUTO_DISMISS_MS);
    });
  }, []);

  function dismiss(key) {
    setToasts((current) => current.filter((t) => t.key !== key));
  }

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2.5 w-[min(360px,calc(100vw-2.5rem))]">
      {toasts.map((toast) => (
        <div
          key={toast.key}
          className="flex items-start gap-3 p-3.5 rounded-xl bg-white border border-[#EAC7B9] shadow-[0_10px_30px_-8px_rgba(217,119,87,0.45)] animate-[toastIn_0.25s_ease-out]"
        >
          <span
            className="material-symbols-rounded shrink-0 mt-0.5 text-[20px] w-9 h-9 flex items-center justify-center rounded-lg text-white"
            style={{ background: '#D97757' }}
          >
            notifications_active
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-[#8A4A33] uppercase tracking-wide">Thông báo mới</p>
            <p className="text-sm text-[#3F3B38] leading-snug mt-0.5 break-words">{toast.title}</p>
          </div>
          <button
            type="button"
            onClick={() => dismiss(toast.key)}
            aria-label="Đóng"
            className="shrink-0 text-[#B5674A] hover:text-[#8A4A33]"
          >
            <span className="material-symbols-rounded text-[18px]">close</span>
          </button>
        </div>
      ))}
    </div>
  );
}
