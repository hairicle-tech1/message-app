import { Pool } from 'pg';
import { env } from './env.js';

export const db = new Pool({
  connectionString: env.databaseUrl,
  // NeonDB (and any TLS-enforcing Postgres) requires SSL
  ssl: env.databaseUrl.includes('neon.tech') || env.databaseUrl.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined,
});
