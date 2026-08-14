import { useEffect } from 'react';
import { useSession } from '../context/SessionContext';

// Server giữ phòng 15 giây rồi mới kết luận là đối tác đi hẳn. Quá mốc đó mà vẫn
// còn "đang kết nối lại" nghĩa là tin kết thúc chờ không tới được — socket của
// mình đã đóng, phòng đã bị xoá, hay bất cứ lỗi nào sau này. Dải chờ này không
// được phép sống lâu hơn lý do của nó, nên nó tự tắt. Để dư 5 giây so với server
// để tin thật vẫn kịp về trước và hiện đúng câu chữ của nó.
const RECONNECT_NOTICE_MAX_MS = 20000;
const LEFT_NOTICE_MS = 6000;

// Shown while the partner's socket is gone but the server is still holding their
// room open. Deliberately a banner and not a screen: WebRTC runs browser to
// browser, so their picture and sound are usually still coming through and the
// practice can carry on. Replacing the page here would end a session that never
// actually broke.
//
// Mounted once at the top of the app rather than inside a page, because the drop
// can happen on the device check or mid-practice, and both render through many
// separate return branches. Chính vì vậy nó phải tự biết lúc nào nên tắt: không
// trang nào "sở hữu" nó để dọn hộ, và nó nổi trên cả trang chủ nếu bị bỏ quên.
export function PartnerReconnectingBanner() {
  const { state, dispatch } = useSession();
  const { partnerReconnecting, partnerLeftNotice } = state;

  useEffect(() => {
    if (!partnerReconnecting) return undefined;

    const id = setTimeout(() => {
      dispatch({ type: 'SET_PARTNER_RECONNECTING', payload: false });
    }, RECONNECT_NOTICE_MAX_MS);

    return () => clearTimeout(id);
  }, [partnerReconnecting, dispatch]);

  useEffect(() => {
    if (!partnerLeftNotice) return undefined;

    const id = setTimeout(() => {
      dispatch({ type: 'SET_PARTNER_LEFT_NOTICE', payload: false });
    }, LEFT_NOTICE_MS);

    return () => clearTimeout(id);
  }, [partnerLeftNotice, dispatch]);

  if (partnerReconnecting) {
    return (
      <Banner icon="progress_activity" spinning>
        Đối tác đang kết nối lại…
      </Banner>
    );
  }

  if (partnerLeftNotice) {
    return (
      <Banner icon="logout">
        Đối tác đã rời phiên. Bạn vẫn hoàn tất được phần của mình.
      </Banner>
    );
  }

  return null;
}

function Banner({ icon, spinning = false, children }) {
  return (
    <div
      role="status"
      className="fixed left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#1C1917] px-4 py-2 text-[13px] text-white shadow-lg"
    >
      <span className={`material-symbols-rounded text-[18px] ${spinning ? 'animate-spin' : ''}`}>
        {icon}
      </span>
      {children}
    </div>
  );
}
