// Ai đang nói, ai đang nhận xét — nói thẳng ra bằng tên, ở mọi màn hình trong
// lúc luyện.
//
// Từ khi mỗi người nói hết cả part mới đổi lượt, việc này quan trọng hơn trước
// nhiều: người nghe ngồi im 3 phút liền, đủ lâu để quên mất mình đang ở vai
// nào, và khi đổi vai thì cái đổi không còn diễn ra mỗi 45 giây để mà đoán
// theo nhịp. Con số "Lượt 6/16" cũ cũng hết nghĩa — người nói cần biết mình
// đang ở câu thứ mấy trong phần của mình, không phải thứ tự trong cả buổi.
export function TurnRoleBar({ partNumber, blockPosition, speakerName, listenerName, iAmSpeaker }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-[12px]">
      <span className="rounded-full bg-zinc-800 px-3 py-1 font-medium text-zinc-300">
        Part {partNumber}
        {blockPosition && blockPosition.total > 1
          ? ` · Câu ${blockPosition.position}/${blockPosition.total}`
          : ''}
      </span>

      <RoleChip
        icon="mic"
        name={speakerName}
        action="đang nói"
        // Vai của chính mình được tô đậm, vì câu hỏi người dùng cần trả lời
        // trong một phần tư giây là "tôi đang phải làm gì", không phải "ai
        // đang làm gì".
        highlighted={iAmSpeaker}
      />
      <RoleChip
        icon="edit_note"
        name={listenerName}
        action="đang nhận xét"
        highlighted={!iAmSpeaker}
      />
    </div>
  );
}

function RoleChip({ icon, name, action, highlighted }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ${
        highlighted
          ? 'bg-white font-semibold text-zinc-900'
          : 'bg-zinc-800/80 text-zinc-400'
      }`}
    >
      <span className="material-symbols-rounded text-[15px]">{icon}</span>
      {name} {action}
    </span>
  );
}
