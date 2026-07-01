import http from 'node:http';
import { app } from './app.js';
import { db } from './config/db.js';
import { env } from './config/env.js';
import { redis } from './config/redis.js';
import { setupRealtime } from './realtime/socket.js';

async function main() {
  await db.query('SELECT 1');

  // Redis ping — non-fatal so the server still starts if Redis is slow to connect
  redis.ping().catch((err: Error) => {
    console.warn('[redis] ping failed on startup:', err.message);
  });

  const httpServer = http.createServer(app);
  const realtime = setupRealtime(httpServer);

  app.locals.disconnectUser = realtime.disconnectUser;

  // Bind to 0.0.0.0 so Render can detect the open port
  httpServer.listen(env.port, '0.0.0.0', () => {
    console.log(`Server listening on 0.0.0.0:${env.port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
