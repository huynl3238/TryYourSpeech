import { io } from 'socket.io-client';

const URL = import.meta.env.VITE_BACKEND_WS_URL;

export const socket = io(URL || undefined, {
  autoConnect: false,
  transports: ['websocket'],
});
