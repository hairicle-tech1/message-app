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
  const result = await db.query<{
    id: string; name: string; description: string | null; created_at: string;
  }>(
    `INSERT INTO departments (name, description)
     VALUES ($1, $2)
     RETURNING id, name, description, created_at`,
    [name, description ?? null],
  );
  const r = result.rows[0];
  return { id: r.id, name: r.name, description: r.description, createdAt: r.created_at };
}

export async function updateDepartment(
  id: string,
  fields: { name?: string; description?: string | null },
): Promise<Department> {
  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (fields.name !== undefined) {
    params.push(fields.name);
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
  return { id: r.id, name: r.name, description: r.description, createdAt: r.created_at };
}

export async function deleteDepartment(id: string): Promise<void> {
  const result = await db.query('DELETE FROM departments WHERE id = $1', [id]);
  if (result.rowCount === 0) throw new HttpError(404, 'Department not found');
}
