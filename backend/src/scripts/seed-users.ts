import bcrypt from 'bcrypt';
import { db } from '../config/db.js';

const PASSWORD = process.env.SEED_USER_PASSWORD ?? 'ChangeMe123!';

const USERS = [
  { email: 'bob@company.local', username: 'bob', displayName: 'Bob Smith', department: 'Engineering' },
  { email: 'carol@company.local', username: 'carol', displayName: 'Carol Nguyen', department: 'Design' },
  { email: 'david@company.local', username: 'david', displayName: 'David Lee', department: 'Sales' },
  { email: 'emma@company.local', username: 'emma', displayName: 'Emma Patel', department: 'Marketing' },
  { email: 'frank@company.local', username: 'frank', displayName: 'Frank Garcia', department: 'Support' },
];

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  for (const user of USERS) {
    const result = await db.query(
      `INSERT INTO users (email, username, display_name, department, password_hash, role)
       VALUES ($1, $2, $3, $4, $5, 'employee')
       ON CONFLICT (email) DO NOTHING
       RETURNING id, email`,
      [user.email, user.username, user.displayName, user.department, passwordHash],
    );

    if (result.rows[0]) {
      console.log(`Created user: ${user.email} / ${PASSWORD}`);
    } else {
      console.log(`User ${user.email} already exists, skipping.`);
    }
  }

  await db.end();
}

main().catch((err) => {
  console.error('Failed to seed users', err);
  process.exit(1);
});
