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
