// Node mặc định nghe trên MỌI card mạng khi `listen()` không nhận địa chỉ. Trên
// VPS điều đó nghĩa là cổng 3001 vào được thẳng từ Internet: bỏ qua nginx, và bỏ
// qua cả HTTPS — token trong cookie đi qua đường đó là đi dưới dạng chữ thường.
// Nó cũng làm hỏng luôn cơ chế giới hạn tần suất, vì `rateLimit` tin header
// `X-Forwarded-For`, mà header đó chỉ đáng tin khi duy nhất nginx gọi tới được.
//
// Nên mặc định là chỉ nghe trên localhost. Nginx đã proxy tới 127.0.0.1:3001.
export const DEFAULT_BIND_HOST = '127.0.0.1';

// Đặt HOST=0.0.0.0 khi cần mở ra mạng LAN — ví dụ thử trên điện thoại thật trong
// lúc phát triển. Đó là quyết định phải nói ra thành lời, không phải mặc định.
export function resolveBindHost(env = process.env) {
  const host = typeof env.HOST === 'string' ? env.HOST.trim() : '';
  return host || DEFAULT_BIND_HOST;
}

// Nghe trên mọi card mạng là thứ đáng để lại một dòng log, để lần sau có ai mở nó
// ra thì còn thấy được trong log PM2 thay vì phải đi đọc code.
export function isPubliclyBound(host) {
  return host === '0.0.0.0' || host === '::' || host === '';
}
