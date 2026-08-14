// Rung phản hồi, CHỈ dành cho thiết bị cảm ứng.
//
// Hỏi `navigator.vibrate` có tồn tại không là KHÔNG đủ để biết đây có phải điện
// thoại: Chrome trên máy tính vẫn có hàm đó và vẫn trả về true — nó chỉ lặng lẽ
// không làm gì, vì máy không có mô-tơ rung. Nếu chỉ dựa vào đó thì code sẽ "gọi
// rung" trên cả máy bàn, và không có cách nào nhìn ra là mình đã gọi nhầm.
//
// Nên hỏi thẳng thiết bị: đầu vào chính là ngón tay hay con trỏ chuột?
//
//   hover: none     — không rê chuột lên được, tức là không có con trỏ
//   pointer: coarse — đầu vào thô, tức là ngón tay chứ không phải chuột
//
// Dùng cách này thay vì đọc chuỗi User-Agent, vì đó mới là câu hỏi đúng, và
// không phải sửa lại mỗi khi có dòng máy mới ra đời. Laptop có màn cảm ứng vẫn
// có chuột nên vẫn là `hover: hover` — tức là không rung, đúng như mong muốn.
export function isTouchPrimaryDevice() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

// Rung một nhịp rất ngắn. Người nghe đang phải nhìn vào mặt người nói và nghe
// họ nói — họ cần biết thao tác đã được ghi nhận mà không phải liếc xuống màn.
//
// Trả về false khi không rung, để chỗ gọi kiểm chứng được. Lưu ý Safari trên
// iPhone không hỗ trợ rung ở web, nên ở đó hàm này luôn trả về false — không
// phải lỗi, chỉ là giới hạn của hệ điều hành đó.
export function vibrateOnTouchDevice(pattern = 15) {
  if (!isTouchPrimaryDevice()) {
    return false;
  }

  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return false;
  }

  try {
    return navigator.vibrate(pattern) === true;
  } catch {
    // Một số trình duyệt ném lỗi khi trang chưa được người dùng tương tác. Rung
    // hỏng thì không được phép làm hỏng việc đánh dấu.
    return false;
  }
}
