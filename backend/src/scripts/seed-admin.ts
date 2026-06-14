import bcrypt from 'bcrypt';
import { db } from '../config/db.js';

const EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@company.local';
const USERNAME = process.env.SEED_ADMIN_USERNAME ?? 'admin';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const result = await db.query(
    `INSERT INTO users (email, username, display_name, password_hash, role)
     VALUES ($1, $2, 'Admin', $3, 'admin')
     ON CONFLICT (email) DO NOTHING
     RETURNING id, email`,
    [EMAIL, USERNAME, passwordHash],
  );

  if (result.rows[0]) {
    console.log(`Created admin user: ${EMAIL} / ${PASSWORD}`);
  } else {
    console.log(`Admin user ${EMAIL} already exists, skipping.`);
  }

  await db.end();
}

main().catch((err) => {
  console.error('Failed to seed admin user', err);
  process.exit(1);
});
