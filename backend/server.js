import { createServer } from 'http';
import { Server } from 'socket.io';
import 'dotenv/config';
import app from './src/app.js';
import { testDbConnection } from './src/config/db.js';
import { testRedisConnection } from './src/config/redis.js';
import { corsOptions } from './src/config/cors.js';
import { setupSocket } from './src/socket/index.js';
import { startAiRecoverySweep } from './src/models/aiRecoveryModel.js';
import { isPubliclyBound, resolveBindHost } from './src/config/network.js';

const PORT = process.env.PORT || 3001;
const HOST = resolveBindHost();

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: corsOptions,
});

setupSocket(io);

testDbConnection();
testRedisConnection();

// AI grading runs in the background, so a restart can interrupt one. This picks
// any interrupted session back up instead of leaving it stuck at 'processing'.
startAiRecoverySweep();

httpServer.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
  if (isPubliclyBound(HOST)) {
    console.warn(
      `[Network] Đang nghe trên mọi card mạng (HOST=${HOST}). Trên máy chủ thật thì`
      + ' cổng này vào được thẳng từ Internet, bỏ qua nginx và HTTPS.'
    );
  }
});
