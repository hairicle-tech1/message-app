import { db } from '../../config/db.js';
import { HttpError } from '../../middleware/error.middleware.js';

export interface Department {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

export async function listDepartments(): Promise<Department[]> {
  const result = await db.query<{
    id: string; name: string; description: string | null; created_at: string;
  }>('SELECT id, name, description, created_at FROM departments ORDER BY name');

  return result.rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    createdAt: r.created_at,
  }));
}

export async function createDepartment(name: string, description?: string): Promise<Department> {
  const trimmed = name.trim();

  // Case-insensitive duplicate check
  const existing = await db.query<{ id: string; name: string }>(
    'SELECT id, name FROM departments WHERE LOWER(name) = LOWER($1) LIMIT 1',
    [trimmed],
  );
  if (existing.rows[0]) {
    throw new HttpError(409, `Department "${existing.rows[0].name}" already exists`);
  }

  const result = await db.query<{
    id: string; name: string; description: string | null; created_at: string;
  }>(
    `INSERT INTO departments (name, description)
     VALUES ($1, $2)
     RETURNING id, name, description, created_at`,
    [trimmed, description?.trim() ?? null],
  );
  const r = result.rows[0];
  return { id: r.id, name: r.name, description: r.description, createdAt: r.created_at };
}

export async function updateDepartment(
  id: string,
  fields: { name?: string; description?: string | null },
): Promise<Department> {
  // Fetch old name first so we can cascade the rename
  const oldResult = await db.query<{ name: string }>(
    'SELECT name FROM departments WHERE id = $1',
    [id],
  );
  const oldName = oldResult.rows[0]?.name;
  if (!oldName) throw new HttpError(404, 'Department not found');

  const setClauses: string[] = [];
  const params: unknown[] = [];

  const newName = fields.name?.trim();
  if (newName !== undefined) {
    params.push(newName);
    setClauses.push(`name = $${params.length}`);
  }
  if (fields.description !== undefined) {
    params.push(fields.description);
    setClauses.push(`description = $${params.length}`);
  }
  if (setClauses.length === 0) throw new HttpError(400, 'Nothing to update');

  params.push(id);
  const result = await db.query<{
    id: string; name: string; description: string | null; created_at: string;
  }>(
    `UPDATE departments SET ${setClauses.join(', ')} WHERE id = $${params.length}
     RETURNING id, name, description, created_at`,
    params,
  );
  const r = result.rows[0];
  if (!r) throw new HttpError(404, 'Department not found');

  // Cascade rename to users and teams when the name actually changed
  if (newName && newName.toLowerCase() !== oldName.toLowerCase()) {
    // Update all users whose department was the old name
    await db.query(
      `UPDATE users SET department = $1 WHERE LOWER(department) = LOWER($2)`,
      [newName, oldName],
    );
    // Rename the auto-created team that matches the old department name
    await db.query(
      `UPDATE teams SET name = $1 WHERE LOWER(name) = LOWER($2)`,
      [newName, oldName],
    );
  }

  return { id: r.id, name: r.name, description: r.description, createdAt: r.created_at };
}

export async function deleteDepartment(id: string): Promise<void> {
  const result = await db.query('DELETE FROM departments WHERE id = $1', [id]);
  if (result.rowCount === 0) throw new HttpError(404, 'Department not found');
}
