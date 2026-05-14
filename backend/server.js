import { createServer } from 'http';
import { Server } from 'socket.io';
import 'dotenv/config';
import app from './src/app.js';
import { setupSocket } from './src/socket/index.js';

const PORT = process.env.PORT || 3001;

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173' }
});

setupSocket(io);

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});