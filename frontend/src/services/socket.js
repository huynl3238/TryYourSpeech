import { io } from 'socket.io-client';

const URL = import.meta.env.VITE_BACKEND_WS_URL;

// withCredentials makes the browser attach the auth cookie to the handshake,
// which is how the server identifies this socket. Without it a cross-origin
// deployment would be rejected as unauthenticated.
export const socket = io(URL || undefined, {
  autoConnect: false,
  transports: ['websocket'],
  withCredentials: true,
});

// Cho bộ kiểm thử đầu-cuối (e2e/) đọc được các sự kiện realtime. `partner_reconnecting`
// và `session_resumed` không luôn để lại dấu vết nhìn thấy trên màn hình, nên khẳng
// định chúng qua giao diện là không đáng tin.
// Chỉ tồn tại ở bản dev — `import.meta.env.DEV` bị Vite thay bằng false khi build,
// nên cả khối này bị loại khỏi bản chạy thật.
if (import.meta.env.DEV) {
  window.__tysSocket = socket;
}
