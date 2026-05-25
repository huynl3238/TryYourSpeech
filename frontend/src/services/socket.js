import { io } from 'socket.io-client';

const URL = import.meta.env.VITE_BACKEND_WS_URL || 'ws://localhost:3001';

export const socket = io(URL, {
  autoConnect: false,
  transports: ['websocket'],
});
