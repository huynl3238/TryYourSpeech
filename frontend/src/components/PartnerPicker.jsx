import { useEffect, useState } from 'react';

// Màn hình chờ ở chế độ "Lựa chọn ghép cặp". Danh sách do server dựng sẵn, chia
// ba nhóm theo band; ở đây chỉ hiển thị đúng nhóm đó.
//
// Chia nhóm có tiêu đề rõ ràng thay vì một danh sách xáo trộn là có chủ đích:
// server cố ý trộn band (4 chỗ ngang, 3 cao hơn, 3 thấp hơn) và nếu đổ hết vào
// một danh sách phẳng thì người dùng chỉ thấy thứ tự lộn xộn không hiểu vì sao.

const SAME_BAND_THRESHOLD = 0.5;
// Sau chừng này mà chưa ai trong danh sách thì gợi ý chuyển chế độ. Chỉ gợi ý —
// người dùng đã chọn "tự chọn" thì máy không được tự lật ngược quyết định đó.
const EMPTY_HINT_AFTER_MS = 20000;

function groupPartners(partners, myBand) {
  const gap = (partner) => (partner.band ?? 0) - (myBand ?? 0);

  return [
    {
      key: 'same',
      label: 'Band tương đương',
      hint: 'Cùng trình độ, dễ giữ nhịp hội thoại',
      items: partners.filter((p) => Math.abs(gap(p)) < SAME_BAND_THRESHOLD),
    },
    {
      key: 'higher',
      label: 'Band cao hơn',
      hint: 'Nghe người giỏi hơn nói để học cách diễn đạt',
      items: partners.filter((p) => gap(p) >= SAME_BAND_THRESHOLD),
    },
    {
      key: 'lower',
      label: 'Band thấp hơn',
      hint: 'Bạn sẽ là người dẫn dắt hội thoại',
      items: partners.filter((p) => gap(p) <= -SAME_BAND_THRESHOLD),
    },
  ].filter((group) => group.items.length > 0);
}

function PartnerRow({ partner, myBand, disabled, onInvite }) {
  const gap = (partner.band ?? 0) - (myBand ?? 0);
  const gapLabel = gap === 0 ? 'cùng band' : `${gap > 0 ? '+' : ''}${gap.toFixed(1)}`;

  return (
    <li className="flex items-center gap-3 rounded-xl border border-[#EAE7E3] bg-white px-3.5 py-3">
      <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-[#F7ECE6] text-[14px] font-bold text-[#8A4A33]">
        {partner.displayName?.charAt(0)?.toUpperCase() || '?'}
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold text-[#1C1917]">{partner.displayName}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-[#A8A29E]">
          <span className="font-semibold text-[#78716C]">Band {partner.band?.toFixed(1) ?? '—'}</span>
          <span>·</span>
          <span>{gapLabel}</span>
          <span>·</span>
          <span>chờ {partner.waitingSeconds}s</span>
          {/* Người này đang được máy ghép hộ nên có thể biến mất bất cứ lúc nào.
              Nói trước còn hơn để họ mời rồi ngơ ngác khi lời mời hỏng. */}
          {partner.autoMatch && (
            <>
              <span>·</span>
              <span className="text-[#B45309]">đang tìm ghép nhanh</span>
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
          className="flex-shrink-0 rounded-full bg-[#D97757] px-4 py-2 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Mời
        </button>
      )}
    </li>
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
}) {
  const [waitedLongEnough, setWaitedLongEnough] = useState(false);

  useEffect(() => {
    setWaitedLongEnough(false);
    const timer = setTimeout(() => setWaitedLongEnough(true), EMPTY_HINT_AFTER_MS);
    return () => clearTimeout(timer);
  }, [autoMatch]);

  const groups = groupPartners(partners, myBand);

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4 py-6">
      <div className="text-center">
        <h2 className="text-lg font-bold text-[#1C1917]">
          {autoMatch ? 'Đang ghép ngẫu nhiên…' : 'Chọn bạn luyện'}
        </h2>
        <p className="mt-1 text-[13px] text-[#78716C]">
          {autoMatch
            ? 'Hệ thống sẽ tự ghép bạn với người phù hợp ngay khi có.'
            : 'Mời một người trong danh sách, hoặc chờ người khác mời bạn.'}
        </p>
      </div>

      {/* Lời mời đến — đặt trên cùng vì nó cần trả lời ngay, và lời mời chỉ sống
          30 giây. */}
      {incomingInvites.map((invite) => (
        <div
          key={invite.inviteId}
          className="rounded-xl border border-[#E3A187] bg-[#FDF6F2] px-4 py-3.5"
        >
          <div className="text-[14px] text-[#1C1917]">
            <strong>{invite.displayName}</strong>
            {invite.band != null && <span className="text-[#78716C]"> (Band {invite.band.toFixed(1)})</span>}
            {' '}muốn luyện cùng bạn
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => onRespondInvite(invite.inviteId, true)}
              className="rounded-full bg-[#D97757] px-4 py-2 text-[13px] font-bold text-white"
            >
              Đồng ý
            </button>
            <button
              type="button"
              onClick={() => onRespondInvite(invite.inviteId, false)}
              className="rounded-full border border-[#EAE7E3] bg-white px-4 py-2 text-[13px] font-semibold text-[#57534E]"
            >
              Từ chối
            </button>
          </div>
        </div>
      ))}

      {outgoingInvite && (
        <div className="flex items-center gap-3 rounded-xl border border-[#EAE7E3] bg-[#FAFAF8] px-4 py-3">
          <div className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-[#E3A187] border-t-transparent" />
          <span className="flex-1 text-[13px] text-[#57534E]">
            Đang chờ <strong className="text-[#1C1917]">{outgoingInvite.displayName}</strong> trả lời…
          </span>
          <button
            type="button"
            onClick={onCancelInvite}
            className="text-[12.5px] font-semibold text-[#8A4A33] underline underline-offset-2"
          >
            Huỷ
          </button>
        </div>
      )}

      {inviteError && (
        <div className="rounded-xl border border-[#EAE7E3] bg-white px-4 py-2.5 text-[12.5px] text-[#B45309]">
          {inviteError}
        </div>
      )}

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#EAE7E3] bg-white px-4 py-8 text-center">
          <p className="text-[14px] font-semibold text-[#57534E]">Chưa có ai đang chờ</p>
          <p className="mt-1 text-[12.5px] text-[#A8A29E]">
            Danh sách sẽ tự cập nhật khi có người vào.
          </p>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.key}>
            <div className="mb-2 flex items-baseline gap-2">
              <h3 className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#78716C]">
                {group.label}
              </h3>
              <span className="text-[11.5px] text-[#A8A29E]">{group.hint}</span>
            </div>
            <ul className="flex flex-col gap-2">
              {group.items.map((partner) => (
                <PartnerRow
                  key={partner.userId}
                  partner={partner}
                  myBand={myBand}
                  // Một lời mời gửi ra tại một thời điểm — chốt này có ở server,
                  // đây chỉ là để nút không mời gọi một việc chắc chắn hỏng.
                  disabled={Boolean(outgoingInvite)}
                  onInvite={onInvite}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {/* Đường thoát. Bấm "Bắt đầu ghép" mà không có gì xảy ra là cách nhanh nhất
          để người dùng tưởng app hỏng — nhất là khi chỉ có vài tài khoản. */}
      {!autoMatch && (waitedLongEnough || groups.length === 0) && (
        <div className="rounded-xl border border-[#EAC7B9] bg-[#F7ECE6] px-4 py-3.5 text-center">
          <p className="text-[13px] text-[#57534E]">
            Chờ lâu quá? Để hệ thống tự tìm người phù hợp cho bạn.
          </p>
          <button
            type="button"
            onClick={onSwitchToRandom}
            className="mt-2.5 rounded-full bg-[#1C1917] px-5 py-2 text-[13px] font-bold text-white"
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
