import { Pool } from 'pg';
import { env } from './env.js';

// The pg module drops the project-ref suffix from Supabase usernames
// (e.g. postgres.lwmzhfvoaqnqoszyrwki becomes just "postgres").
// Parsing with the WHATWG URL API and passing params individually avoids this.
function makePool(url: string): Pool {
  const u = new URL(url);
  const needsSsl =
    url.includes('supabase.com') ||
    url.includes('neon.tech') ||
    url.includes('sslmode=require');

  return new Pool({
    host: u.hostname,
    port: u.port ? parseInt(u.port) : 5432,
    database: u.pathname.replace(/^\//, ''),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });
}

export const db = makePool(env.databaseUrl);
