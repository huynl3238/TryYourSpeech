// Ghép một đường dẫn tương đối với địa chỉ máy chủ — nhưng chỉ khi nó đúng là
// đường dẫn tương đối.
//
// `blob:` và `data:` đã là địa chỉ hoàn chỉnh do chính trình duyệt cấp. Bản trước
// chỉ nhận ra `http://` và `https://`, nên một blob URL rơi xuống nhánh cuối và bị
// ghép thêm địa chỉ máy chủ vào đầu:
//
//   blob:https://try-your-speech.../8f2c   ->   https://try-your-speech...blob:https://...
//
// Chuỗi đó không trỏ tới đâu cả. Đúng lỗi làm màn Review không phát được audio của
// đối tác: bản ghi nằm sẵn trong bộ nhớ tab, chỉ có đường dẫn tới nó bị hỏng.
const ABSOLUTE_URL_SCHEME = /^(?:https?|blob|data):/i;

export function isAbsoluteFileUrl(path) {
  return typeof path === 'string' && ABSOLUTE_URL_SCHEME.test(path);
}

export function resolveBackendFileUrl(baseUrl, path) {
  if (!path) return '';
  if (isAbsoluteFileUrl(path)) return path;
  return `${baseUrl}${path}`;
}
