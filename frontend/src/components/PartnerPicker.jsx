import { useEffect, useState } from 'react';

// Màn hình chờ ở chế độ "Lựa chọn ghép cặp". Danh sách do server dựng sẵn, chia
// ba nhóm theo band; ở đây chỉ hiển thị đúng nhóm đó.
//
// Chia nhóm có tiêu đề rõ ràng thay vì một danh sách xáo trộn là có chủ đích:
// server cố ý trộn band (4 chỗ ngang, 3 cao hơn, 3 thấp hơn) và nếu đổ hết vào
// một danh sách phẳng thì người dùng chỉ thấy thứ tự lộn xộn không hiểu vì sao.
//
// Đây là màn hình người dùng nhìn lâu nhất trong cả ứng dụng, nên nó phải trả lời
// được ba câu mà một khung chờ đứng im không trả lời nổi: hệ thống còn chạy không,
// tôi đã chờ bao lâu rồi, và tôi còn bao nhiêu giây để bấm.

const SAME_BAND_THRESHOLD = 0.5;
// Sau chừng này mà chưa ai trong danh sách thì gợi ý chuyển chế độ. Chỉ gợi ý —
// người dùng đã chọn "tự chọn" thì máy không được tự lật ngược quyết định đó.
const EMPTY_HINT_AFTER_MS = 20000;
const TIP_ROTATE_MS = 9000;

// Thời gian chờ là thời gian chết. Đổi nó thành thứ đọc được thì người dùng ngồi
// lâu cũng không thấy sốt ruột. Toàn bộ nội dung nói về đúng cách ứng dụng này
// chạy, không phải mẹo IELTS chung chung.
const WAITING_TIPS = [
  {
    icon: 'keyboard',
    title: 'Khi làm người nghe, dùng phím TAB',
    text: 'Nghe bạn cùng luyện nói và nhấn TAB ngay lúc phát hiện lỗi, rồi chọn loại lỗi bằng số. Mốc thời gian được ghi lại để lát nữa nghe lại đúng chỗ đó.',
  },
  {
    icon: 'timer',
    title: 'Part 2 có một phút chuẩn bị',
    text: 'Đừng viết thành câu. Ghi 4–5 từ khoá theo đúng thứ tự bạn sẽ nói, rồi trình bày lần lượt để bài nói có mở đầu, thân và kết.',
  },
  {
    icon: 'record_voice_over',
    title: 'Nói dài hơn bạn nghĩ là đủ',
    text: 'Part 1 nên khoảng 2–3 câu cho mỗi câu hỏi. Trả lời một câu rồi im là mất điểm Fluency, dù câu đó đúng ngữ pháp.',
  },
  {
    icon: 'lightbulb',
    title: 'Không biết thì nói thật ra',
    text: '"I have never really thought about it, but I suppose…" vẫn được tính điểm. Ngồi im vài giây thì không.',
  },
  {
    icon: 'graphic_eq',
    title: 'Ghi âm sẽ được chấm sau khi cả hai nhận xét xong',
    text: 'Bài nói của bạn được tải lên trong lúc bạn nhận xét bạn cùng luyện. AI cần cả ghi chú của người nghe nên nó chỉ chạy sau bước đó.',
  },
];

function formatClock(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Dưới một phút thì "12s" đọc tự nhiên hơn "0:12"; từ một phút trở lên mới cần
// dạng phút:giây.
function formatWaited(totalSeconds) {
  return totalSeconds < 60 ? `${totalSeconds}s` : formatClock(totalSeconds);
}

// Đếm từ lúc màn chờ hiện ra. Đổi chế độ không làm mất số này vì component không
// bị tháo ra dựng lại — và đúng là người dùng vẫn đang chờ liên tục.
function useElapsedSeconds() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const startedAt = performance.now();
    const timer = setInterval(() => {
      setSeconds(Math.floor((performance.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return seconds;
}

// `waitingSeconds` chỉ được server gửi lại khi hàng đợi thay đổi. Không tự đếm
// thêm thì con số "chờ 12s" đứng im hàng phút và người dùng tưởng danh sách treo.
function useSecondsSinceListArrived(partners) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    setSeconds(0);
    const arrivedAt = performance.now();
    const timer = setInterval(() => {
      setSeconds(Math.floor((performance.now() - arrivedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [partners]);

  return seconds;
}

// Lời mời chỉ sống 30 giây rồi tự hết. Trước đây người dùng không thấy điều đó ở
// đâu cả, nên vừa không biết mình phải bấm nhanh, vừa bị lời mời biến mất không
// hiểu vì sao. Server đã gửi kèm `expiresInMs` — chỉ cần đếm ngược nó.
function useInviteCountdown(inviteId, expiresInMs) {
  const [remainingMs, setRemainingMs] = useState(expiresInMs ?? null);

  useEffect(() => {
    if (!expiresInMs) {
      setRemainingMs(null);
      return undefined;
    }

    const deadline = performance.now() + expiresInMs;
    setRemainingMs(expiresInMs);

    const timer = setInterval(() => {
      setRemainingMs(Math.max(0, deadline - performance.now()));
    }, 250);
    return () => clearInterval(timer);
  }, [inviteId, expiresInMs]);

  if (remainingMs == null || !expiresInMs) return null;

  return {
    seconds: Math.ceil(remainingMs / 1000),
    ratio: Math.max(0, Math.min(1, remainingMs / expiresInMs)),
  };
}

// Server cố ý trộn band (4 chỗ ngang, 3 cao hơn, 3 thấp hơn). Giữ đúng thứ tự
// tương đương → cao hơn → thấp hơn để danh sách không trông như xáo trộn, nhưng
// KHÔNG chia mục có tiêu đề nữa: nhãn chênh lệch trên từng dòng đã nói đủ, ba
// tiêu đề nữa chỉ làm danh sách dài ra mà không thêm thông tin gì.
function sortPartners(partners, myBand) {
  const gapOf = (partner) => (partner.band ?? 0) - (myBand ?? 0);
  const rankOf = (partner) => {
    const gap = gapOf(partner);
    if (Math.abs(gap) < SAME_BAND_THRESHOLD) return 0;
    return gap > 0 ? 1 : 2;
  };

  return [...partners].sort(
    (a, b) => rankOf(a) - rankOf(b) || Math.abs(gapOf(a)) - Math.abs(gapOf(b))
  );
}

// Màu nhãn chênh lệch mang đúng ý nghĩa cũ của ba tiêu đề đã bỏ: xanh là ngang
// trình độ, xanh dương là người giỏi hơn, nâu là người kém hơn mình.
function gapAccent(gap) {
  if (Math.abs(gap) < SAME_BAND_THRESHOLD) return '#059669';
  return gap > 0 ? '#2563EB' : '#B45309';
}

// Vòng tròn đếm ngược. Dùng conic-gradient thay vì SVG cho gọn: một hình tròn
// nền, một hình tròn trắng nhỏ hơn đè lên, số nằm giữa.
function CountdownDial({ countdown, accent }) {
  const urgent = countdown.seconds <= 10;
  const color = urgent ? '#DC2626' : accent;

  return (
    <div
      className="relative grid h-11 w-11 flex-shrink-0 place-items-center rounded-full"
      style={{ background: `conic-gradient(${color} ${countdown.ratio * 360}deg, #EFEAE5 0deg)` }}
      aria-hidden="true"
    >
      <div className="grid h-[34px] w-[34px] place-items-center rounded-full bg-white">
        <span
          className="text-[13px] font-bold tabular-nums"
          style={{ color }}
        >
          {countdown.seconds}
        </span>
      </div>
    </div>
  );
}

// Trung tâm màn hình chờ: band của mình nằm giữa, các vòng sóng lan ra ngoài.
// Ba vòng lệch pha nhau để thành một nhịp liên tục chứ không phải ba cú nhảy.
function WaitingBeacon({ myBand, autoMatch }) {
  return (
    <div className="relative mx-auto h-[104px] w-[104px]">
      {[0, 0.93, 1.86].map((delay) => (
        <span
          key={delay}
          className="wait-radar-ring"
          style={{ animationDelay: `${delay}s` }}
        />
      ))}

      <div className="wait-medallion absolute inset-[18px] grid place-items-center rounded-full bg-[#D97757] shadow-[0_10px_26px_-8px_rgba(217,119,87,.65)]">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-white/80">Band</span>
        <span className="-mt-0.5 text-[21px] font-extrabold leading-none tabular-nums text-white">
          {myBand != null ? myBand.toFixed(1) : '-'}
        </span>
      </div>

      <span
        className="absolute -right-1 -top-1 grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-white shadow-sm"
        aria-hidden="true"
      >
        <span
          className="material-symbols-rounded icon-fill text-[#D97757]"
          style={{ fontSize: 16 }}
        >
          {autoMatch ? 'bolt' : 'touch_app'}
        </span>
      </span>
    </div>
  );
}

function WaitingTip() {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * WAITING_TIPS.length));

  // setTimeout đặt lại theo `index` chứ không phải setInterval một lần: nhờ vậy
  // khi người dùng tự bấm chọn một mẩu thì 9 giây được tính lại từ đầu, thay vì
  // mẩu họ vừa chọn bị đẩy đi ngay sau một giây còn sót của nhịp cũ.
  useEffect(() => {
    const timer = setTimeout(() => {
      setIndex((current) => (current + 1) % WAITING_TIPS.length);
    }, TIP_ROTATE_MS);
    return () => clearTimeout(timer);
  }, [index]);

  const tip = WAITING_TIPS[index];

  return (
    <section className="rounded-2xl border border-[#EAE7E3] bg-white px-4 py-3.5">
      <div className="flex items-center gap-2">
        <span
          className="material-symbols-rounded icon-fill text-[#D97757]"
          style={{ fontSize: 17 }}
          aria-hidden="true"
        >
          lightbulb
        </span>
        <h3 className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-[#78716C]">
          Trong lúc chờ
        </h3>
        {/* Bấm được để nhảy tới mẩu bất kỳ, không phải chờ nó tự xoay. Vạch màu
            chỉ cao 6px nên vùng bấm nằm ở thẻ button bọc ngoài — bấm vào một mục
            tiêu 6px là bất khả thi trên điện thoại. */}
        <div className="ml-auto flex items-center">
          {WAITING_TIPS.map((item, dotIndex) => (
            <button
              key={item.icon}
              type="button"
              onClick={() => setIndex(dotIndex)}
              aria-label={`Xem mẹo ${dotIndex + 1}: ${item.title}`}
              aria-current={dotIndex === index ? 'true' : undefined}
              className="group grid h-6 place-items-center px-[3px]"
            >
              <span
                className="h-1.5 rounded-full transition-all duration-300 group-hover:opacity-60"
                style={{
                  width: dotIndex === index ? 14 : 6,
                  background: dotIndex === index ? '#D97757' : '#EAE7E3',
                }}
              />
            </button>
          ))}
        </div>
      </div>

      {/* `key` đổi theo mẹo nên mỗi lần xoay là một lần hiện lại từ đầu, có hiệu
          ứng mờ dần vào thay vì chữ nhảy đột ngột. */}
      <div key={tip.icon} className="animate-fade-in mt-2.5 flex gap-3">
        <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-[#F7ECE6]">
          <span
            className="material-symbols-rounded text-[#8A4A33]"
            style={{ fontSize: 19 }}
            aria-hidden="true"
          >
            {tip.icon}
          </span>
        </span>
        <div className="min-w-0">
          <div className="text-[13.5px] font-bold text-[#1C1917]">{tip.title}</div>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#57534E]">{tip.text}</p>
        </div>
      </div>
    </section>
  );
}

function IncomingInviteCard({ invite, onRespondInvite }) {
  const countdown = useInviteCountdown(invite.inviteId, invite.expiresInMs);

  return (
    <div className="animate-scale-in overflow-hidden rounded-2xl border-2 border-[#E3A187] bg-[#FDF6F2] shadow-[0_10px_30px_-12px_rgba(217,119,87,.45)]">
      <div className="flex items-center gap-3 px-4 pt-4">
        <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full bg-[#D97757] text-[16px] font-bold text-white">
          {invite.displayName?.charAt(0)?.toUpperCase() || '?'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#8A4A33]">
            Lời mời luyện tập
          </div>
          <div className="truncate text-[15px] text-[#1C1917]">
            <strong>{invite.displayName}</strong>
            {invite.band != null && (
              <span className="text-[#78716C]"> · Band {invite.band.toFixed(1)}</span>
            )}
          </div>
        </div>
        {countdown && <CountdownDial countdown={countdown} accent="#D97757" />}
      </div>

      <div className="flex gap-2 px-4 py-3.5">
        <button
          type="button"
          onClick={() => onRespondInvite(invite.inviteId, true)}
          className="flex-1 rounded-full bg-[#D97757] py-2.5 text-[13.5px] font-bold text-white shadow-[0_6px_16px_-6px_rgba(217,119,87,.7)] transition-transform hover:-translate-y-px"
        >
          Đồng ý
        </button>
        <button
          type="button"
          onClick={() => onRespondInvite(invite.inviteId, false)}
          className="rounded-full border border-[#EAE7E3] bg-white px-5 py-2.5 text-[13.5px] font-semibold text-[#57534E] transition-colors hover:bg-[#FAFAF8]"
        >
          Từ chối
        </button>
      </div>

      {countdown && (
        <div className="px-4 pb-3 text-[11.5px] text-[#A8A29E]">
          Lời mời tự hết sau {countdown.seconds} giây nếu bạn không trả lời.
        </div>
      )}
    </div>
  );
}

function OutgoingInviteRow({ invite, onCancelInvite }) {
  const countdown = useInviteCountdown(invite.inviteId, invite.expiresInMs);

  return (
    <div className="animate-fade-in flex items-center gap-3 rounded-2xl border border-[#EAE7E3] bg-[#FAFAF8] px-4 py-3">
      {countdown ? (
        <CountdownDial countdown={countdown} accent="#78716C" />
      ) : (
        <div className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-[#E3A187] border-t-transparent" />
      )}
      <span className="flex-1 text-[13px] text-[#57534E]">
        Đang chờ <strong className="text-[#1C1917]">{invite.displayName}</strong> trả lời…
      </span>
      <button
        type="button"
        onClick={onCancelInvite}
        className="text-[12.5px] font-semibold text-[#8A4A33] underline underline-offset-2"
      >
        Huỷ
      </button>
    </div>
  );
}

function PartnerRow({ partner, myBand, extraWaitSeconds, disabled, onInvite }) {
  const gap = (partner.band ?? 0) - (myBand ?? 0);
  const gapLabel = gap === 0 ? 'cùng band' : `${gap > 0 ? '+' : ''}${gap.toFixed(1)}`;
  const accent = gapAccent(gap);
  const waitingSeconds = (partner.waitingSeconds ?? 0) + extraWaitSeconds;

  return (
    <li className="group flex items-center gap-3 rounded-xl border border-[#EAE7E3] bg-white px-3.5 py-3 transition-all hover:-translate-y-px hover:border-[#EAC7B9] hover:shadow-[0_8px_20px_-10px_rgba(28,25,23,.2)]">
      <div className="relative flex-shrink-0">
        <div className="grid h-11 w-11 place-items-center rounded-full bg-[#F7ECE6] text-[15px] font-bold text-[#8A4A33]">
          {partner.displayName?.charAt(0)?.toUpperCase() || '?'}
        </div>
        {/* Chấm xanh: người này đang online trong hàng chờ ngay lúc này. */}
        <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#22C55E]" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14.5px] font-semibold text-[#1C1917]">
            {partner.displayName}
          </span>
          <span
            className="flex-shrink-0 rounded-md px-1.5 py-[1px] text-[10.5px] font-bold leading-none tabular-nums"
            style={{ color: accent, background: `${accent}14` }}
          >
            {gapLabel}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-[#A8A29E]">
          <span className="font-semibold text-[#78716C]">Band {partner.band?.toFixed(1) ?? '-'}</span>
          <span>·</span>
          <span className="tabular-nums">chờ {formatWaited(waitingSeconds)}</span>
          {/* Người này đang được máy ghép hộ nên có thể biến mất bất cứ lúc nào.
              Nói trước còn hơn để họ mời rồi ngơ ngác khi lời mời hỏng. */}
          {partner.autoMatch && (
            <>
              <span>·</span>
              <span className="font-medium text-[#B45309]">đang tìm ghép nhanh</span>
            </>
          )}
        </div>
      </div>

      {partner.declined ? (
        <span className="flex-shrink-0 text-[12px] text-[#A8A29E]">Đã từ chối</span>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onInvite(partner.userId)}
          className="flex-shrink-0 rounded-full bg-[#D97757] px-4 py-2 text-[13px] font-bold text-white shadow-[0_6px_16px_-8px_rgba(217,119,87,.8)] transition-transform hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
        >
          Mời
        </button>
      )}
    </li>
  );
}

function EmptyQueue() {
  return (
    <div className="rounded-2xl border border-dashed border-[#EAC7B9] bg-white px-4 py-6 text-center">
      {/* Ba dòng giả có vệt sáng chạy qua: nói "đang chờ người vào" sinh động hơn
          một ô trống, và nó cho thấy trước danh sách sẽ trông như thế nào. */}
      <div className="mx-auto flex max-w-[380px] flex-col gap-2" aria-hidden="true">
        {[0, 1, 2].map((row) => (
          <div
            key={row}
            className="wait-skeleton flex items-center gap-3 rounded-xl border border-[#F1EEEA] bg-[#FAFAF8] px-3 py-2.5"
            style={{ opacity: 1 - row * 0.25 }}
          >
            <span className="h-9 w-9 flex-shrink-0 rounded-full bg-[#F1EEEA]" />
            <span className="flex flex-1 flex-col gap-1.5">
              <span className="h-2.5 w-1/2 rounded-full bg-[#F1EEEA]" />
              <span className="h-2 w-1/3 rounded-full bg-[#F4F1ED]" />
            </span>
            <span className="h-7 w-14 flex-shrink-0 rounded-full bg-[#F1EEEA]" />
          </div>
        ))}
      </div>

      <p className="mt-4 text-[14px] font-semibold text-[#57534E]">Chưa có ai đang chờ</p>
      <p className="mt-1 text-[12.5px] text-[#A8A29E]">
        Danh sách tự cập nhật khi có người vào, bạn không cần tải lại trang.
      </p>
    </div>
  );
}

export function PartnerPicker({
  myBand,
  partners,
  autoMatch,
  outgoingInvite,
  incomingInvites,
  inviteError,
  onInvite,
  onCancelInvite,
  onRespondInvite,
  onSwitchToRandom,
  onCancel,
  focusLabel,
}) {
  const [waitedLongEnough, setWaitedLongEnough] = useState(false);
  const elapsedSeconds = useElapsedSeconds();
  const extraWaitSeconds = useSecondsSinceListArrived(partners);

  useEffect(() => {
    setWaitedLongEnough(false);
    const timer = setTimeout(() => setWaitedLongEnough(true), EMPTY_HINT_AFTER_MS);
    return () => clearTimeout(timer);
  }, [autoMatch]);

  const sorted = sortPartners(partners, myBand);
  // Server chỉ gửi tối đa 10 chỗ, nên đủ 10 thì nói "10+" chứ không khẳng định
  // đó là toàn bộ hàng chờ.
  const countLabel = partners.length >= 10 ? '10+' : String(partners.length);

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4 py-6">
      <header className="text-center">
        <WaitingBeacon myBand={myBand} autoMatch={autoMatch} />

        <h2 className="mt-4 text-[19px] font-bold tracking-[-0.01em] text-[#1C1917]">
          {autoMatch ? 'Đang tìm người phù hợp…' : 'Chọn bạn luyện'}
        </h2>
        <p className="mx-auto mt-1 max-w-[400px] text-[13px] leading-relaxed text-[#78716C]">
          {autoMatch
            ? 'Hệ thống sẽ tự ghép bạn với người có band chênh tối đa 1.0 ngay khi có.'
            : 'Mời một người trong danh sách, hoặc chờ người khác mời bạn.'}
        </p>

        {/* Danh sách chỉ có người chọn cùng phần, nên phải nói rõ đang chờ ai —
            không thì hàng chờ trống trông như hệ thống hỏng. */}
        {focusLabel && (
          <p className="mt-2 text-[12.5px] text-[#78716C]">
            Chỉ hiện người cũng đang luyện{' '}
            <b className="font-semibold text-[#8A4A33]">{focusLabel}</b>
          </p>
        )}

        <div className="mt-3 inline-flex items-center gap-2.5 rounded-full border border-[#EAE7E3] bg-white px-3.5 py-1.5 text-[12.5px] shadow-sm">
          <span className="inline-flex items-center gap-1.5 text-[#57534E]">
            <span
              className="material-symbols-rounded text-[#A8A29E]"
              style={{ fontSize: 15 }}
              aria-hidden="true"
            >
              schedule
            </span>
            Đã chờ
            <b className="font-bold tabular-nums text-[#1C1917]">{formatClock(elapsedSeconds)}</b>
          </span>
          {/* Rỗng thì không hiện "0 người đang chờ" kèm đèn xanh nhấp nháy — khối
              trống bên dưới đã nói điều đó rõ hơn mà không tự mâu thuẫn. */}
          {partners.length > 0 && (
            <>
              <span className="h-3 w-px bg-[#EAE7E3]" />
              <span className="inline-flex items-center gap-1.5 text-[#57534E]">
                <span className="recording-dot" style={{ background: '#22C55E' }} />
                <b className="font-bold tabular-nums text-[#1C1917]">{countLabel}</b>
                người đang chờ
              </span>
            </>
          )}
        </div>
      </header>

      {/* Lời mời đến — đặt trên cùng vì nó cần trả lời ngay, và lời mời chỉ sống
          30 giây. */}
      {incomingInvites.map((invite) => (
        <IncomingInviteCard
          key={invite.inviteId}
          invite={invite}
          onRespondInvite={onRespondInvite}
        />
      ))}

      {outgoingInvite && (
        <OutgoingInviteRow invite={outgoingInvite} onCancelInvite={onCancelInvite} />
      )}

      {inviteError && (
        <div className="flex items-center gap-2 rounded-xl border border-[#EAE7E3] bg-white px-4 py-2.5 text-[12.5px] text-[#B45309]">
          <span
            className="material-symbols-rounded"
            style={{ fontSize: 16 }}
            aria-hidden="true"
          >
            info
          </span>
          {inviteError}
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyQueue />
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((partner) => (
            <PartnerRow
              key={partner.userId}
              partner={partner}
              myBand={myBand}
              extraWaitSeconds={extraWaitSeconds}
              // Một lời mời gửi ra tại một thời điểm — chốt này có ở server,
              // đây chỉ là để nút không mời gọi một việc chắc chắn hỏng.
              disabled={Boolean(outgoingInvite)}
              onInvite={onInvite}
            />
          ))}
        </ul>
      )}

      <WaitingTip />

      {/* Đường thoát. Bấm "Bắt đầu ghép" mà không có gì xảy ra là cách nhanh nhất
          để người dùng tưởng app hỏng — nhất là khi chỉ có vài tài khoản. */}
      {!autoMatch && (waitedLongEnough || sorted.length === 0) && (
        <div className="animate-fade-in rounded-2xl border border-[#EAC7B9] bg-[#F7ECE6] px-4 py-3.5 text-center">
          <p className="text-[13px] text-[#57534E]">
            Chờ lâu quá? Để hệ thống tự tìm người phù hợp cho bạn.
          </p>
          <button
            type="button"
            onClick={onSwitchToRandom}
            className="mt-2.5 rounded-full bg-[#1C1917] px-5 py-2 text-[13px] font-bold text-white transition-transform hover:-translate-y-px"
          >
            Chuyển sang ghép ngẫu nhiên
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={onCancel}
        className="mx-auto mt-1 text-[12.5px] font-semibold text-[#8A4A33] underline underline-offset-2"
      >
        Huỷ tìm kiếm
      </button>
    </div>
  );
}
