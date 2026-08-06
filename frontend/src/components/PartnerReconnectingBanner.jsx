import { useSession } from '../context/SessionContext';

// Shown while the partner's socket is gone but the server is still holding their
// room open. Deliberately a banner and not a screen: WebRTC runs browser to
// browser, so their picture and sound are usually still coming through and the
// practice can carry on. Replacing the page here would end a session that never
// actually broke.
//
// Mounted once at the top of the app rather than inside a page, because the drop
// can happen on the device check or mid-practice, and both render through many
// separate return branches.
export function PartnerReconnectingBanner() {
  const { state } = useSession();

  if (!state.partnerReconnecting) return null;

  return (
    <div
      role="status"
      className="fixed left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#1C1917] px-4 py-2 text-[13px] text-white shadow-lg"
    >
      <span className="material-symbols-rounded animate-spin text-[18px]">progress_activity</span>
      Đối tác đang kết nối lại…
    </div>
  );
}
