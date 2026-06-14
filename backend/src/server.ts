import http from 'node:http';
import { app } from './app.js';
import { db } from './config/db.js';
import { env } from './config/env.js';
import { redis } from './config/redis.js';
import { setupRealtime } from './realtime/socket.js';

async function main() {
  await db.query('SELECT 1');
  await redis.ping();

  const httpServer = http.createServer(app);
  setupRealtime(httpServer);

  httpServer.listen(env.port, () => {
    console.log(`Server listening on port ${env.port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
