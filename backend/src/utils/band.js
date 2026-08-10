// Band IELTS chỉ nhận các mức nửa điểm: 0, 0.5, 1.0 … 9.0.
//
// Giao diện dùng thanh trượt `step=0.5` nên người dùng bình thường không gửi được
// giá trị lệch. Nhưng backend không được tin phía gọi: gọi thẳng API thì band=6.3
// hay band=null đều vào được, và band là đầu vào của ghép cặp.
//
// Trước file này có BA bản kiểm band độc lập — `socket/index.js`, `createIdentity`
// và `updateUserProfile` — không bản nào chặn bước 0.5. `updateUserProfile` còn
// tệ hơn: `Number(null)` bằng 0, nên band không khai lặng lẽ thành band 0.

export const BAND_MIN = 0;
export const BAND_MAX = 9;
export const BAND_STEP = 0.5;

// "Chưa khai band" là trạng thái hợp lệ (cột `band` trong database cho phép NULL),
// khác hẳn với "khai một giá trị sai".
export function isBandOmitted(value) {
  if (value === null || value === undefined) return true;
  return typeof value === 'string' && value.trim().length === 0;
}

// Trả về một trong ba dạng: `{ omitted: true }`, `{ band: <số> }`, `{ error: <câu> }`.
//
// Cố ý KHÔNG ném lỗi: hai nơi dùng cần hai cách xử lý khác nhau. Cập nhật hồ sơ
// thì phải báo lỗi cho người dùng thấy; còn ghép cặp qua socket thì coi như chưa
// khai, để một payload rác không làm rơi kết nối của người đang chờ.
export function parseBand(value) {
  if (isBandOmitted(value)) {
    return { omitted: true };
  }

  // `Number([])` bằng 0 và `Number(false)` cũng bằng 0. Chặn thẳng những kiểu
  // không phải số hay chuỗi, thay vì để chúng lặng lẽ biến thành band 0.
  if (typeof value !== 'number' && typeof value !== 'string') {
    return { error: 'band phải là một số' };
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return { error: 'band phải là một số' };
  }

  if (parsed < BAND_MIN || parsed > BAND_MAX) {
    return { error: `band phải nằm trong khoảng ${BAND_MIN}–${BAND_MAX}` };
  }

  // Nhân 2 rồi xét số nguyên, thay vì lấy dư cho 0.5: phép dư trên số thực nhị
  // phân không cho kết quả chính xác, còn mọi mức x.0 và x.5 đều biểu diễn được
  // chính xác nên nhân 2 là an toàn tuyệt đối.
  if (!Number.isInteger(parsed * 2)) {
    return { error: 'band chỉ nhận các mức 0.5 (ví dụ 6.0, 6.5, 7.0)' };
  }

  return { band: parsed };
}

// Dùng ở những nơi band sai không được phép đi tiếp âm thầm.
export function parseBandOrThrow(value, { required = false } = {}) {
  const result = parseBand(value);

  if (result.error) {
    throw new Error(result.error);
  }

  if (result.omitted) {
    if (required) {
      throw new Error('band là bắt buộc');
    }
    return null;
  }

  return result.band;
}
