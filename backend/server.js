import { createServer } from 'http';
import { Server } from 'socket.io';
import 'dotenv/config';
import app from './src/app.js';
import { testDbConnection } from './src/config/db.js';
import { testRedisConnection } from './src/config/redis.js';
import { corsOptions } from './src/config/cors.js';
import { setupSocket } from './src/socket/index.js';

const PORT = process.env.PORT || 3001;

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: corsOptions,
});

setupSocket(io);

testDbConnection();
testRedisConnection();

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
