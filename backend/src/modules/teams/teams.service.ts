import { db } from '../../config/db.js';
import { HttpError } from '../../middleware/error.middleware.js';

export type TeamRole = 'owner' | 'admin' | 'member';

export interface Team {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  createdBy: string;
  createdAt: string;
  memberCount: number;
  myRole: TeamRole;
}

export interface TeamMember {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  department: string | null;
  role: TeamRole;
  joinedAt: string;
}

// ── Guards ────────────────────────────────────────────────────────────────────

export async function assertTeamMember(teamId: string, userId: string): Promise<void> {
  const result = await db.query(
    'SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2',
    [teamId, userId],
  );
  if (!result.rows[0]) throw new HttpError(403, 'Not a member of this team');
}

async function requireTeamOwnerOrAdmin(teamId: string, userId: string): Promise<void> {
  const result = await db.query<{ role: string }>(
    'SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2',
    [teamId, userId],
  );
  const role = result.rows[0]?.role;
  if (role !== 'owner' && role !== 'admin') throw new HttpError(403, 'Requires team owner or admin role');
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function createTeam(
  creatorId: string,
  input: { name: string; description?: string },
): Promise<Team> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO teams (name, description, created_by) VALUES ($1, $2, $3) RETURNING id`,
    [input.name, input.description ?? null, creatorId],
  );
  const teamId = result.rows[0].id;

  await db.query(
    `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [teamId, creatorId],
  );

  return getTeamById(teamId, creatorId);
}

export async function listMyTeams(userId: string): Promise<Team[]> {
  const result = await db.query<{
    id: string; name: string; description: string | null; avatar_url: string | null;
    created_by: string; created_at: string; member_count: string; my_role: TeamRole;
  }>(
    `SELECT t.id, t.name, t.description, t.avatar_url, t.created_by, t.created_at,
            COUNT(tm2.user_id) AS member_count,
            (SELECT role FROM team_members WHERE team_id = t.id AND user_id = $1) AS my_role
     FROM teams t
     JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = $1
     LEFT JOIN team_members tm2 ON tm2.team_id = t.id
     GROUP BY t.id
     ORDER BY t.name`,
    [userId],
  );

  return result.rows.map(toTeam);
}

export async function getTeamById(teamId: string, userId: string): Promise<Team> {
  const result = await db.query<{
    id: string; name: string; description: string | null; avatar_url: string | null;
    created_by: string; created_at: string; member_count: string; my_role: TeamRole;
  }>(
    `SELECT t.id, t.name, t.description, t.avatar_url, t.created_by, t.created_at,
            COUNT(tm.user_id) AS member_count,
            (SELECT role FROM team_members WHERE team_id = t.id AND user_id = $2) AS my_role
     FROM teams t
     LEFT JOIN team_members tm ON tm.team_id = t.id
     WHERE t.id = $1
     GROUP BY t.id`,
    [teamId, userId],
  );

  const row = result.rows[0];
  if (!row) throw new HttpError(404, 'Team not found');
  if (!row.my_role) throw new HttpError(403, 'Not a member of this team');

  return toTeam(row);
}

export async function updateTeam(
  teamId: string,
  userId: string,
  input: { name?: string; description?: string | null },
): Promise<Team> {
  await requireTeamOwnerOrAdmin(teamId, userId);

  const setClauses: string[] = ['updated_at = now()'];
  const params: unknown[] = [];

  if (input.name !== undefined) {
    params.push(input.name);
    setClauses.push(`name = $${params.length}`);
  }
  if (input.description !== undefined) {
    params.push(input.description);
    setClauses.push(`description = $${params.length}`);
  }

  params.push(teamId);
  await db.query(`UPDATE teams SET ${setClauses.join(', ')} WHERE id = $${params.length}`, params);

  return getTeamById(teamId, userId);
}

export async function deleteTeam(teamId: string, userId: string): Promise<void> {
  const result = await db.query<{ role: string }>(
    'SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2',
    [teamId, userId],
  );
  if (result.rows[0]?.role !== 'owner') throw new HttpError(403, 'Only the team owner can delete the team');

  await db.query('DELETE FROM teams WHERE id = $1', [teamId]);
}

// ── Members ───────────────────────────────────────────────────────────────────

export async function listTeamMembers(teamId: string, userId: string): Promise<TeamMember[]> {
  await assertTeamMember(teamId, userId);

  const result = await db.query<{
    user_id: string; username: string; display_name: string;
    avatar_url: string | null; department: string | null; role: TeamRole; joined_at: string;
  }>(
    `SELECT tm.user_id, u.username, u.display_name, u.avatar_url, u.department, tm.role, tm.joined_at
     FROM team_members tm
     JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = $1
     ORDER BY tm.role, u.display_name`,
    [teamId],
  );

  return result.rows.map((r) => ({
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    department: r.department,
    role: r.role,
    joinedAt: r.joined_at,
  }));
}

export async function addTeamMember(
  teamId: string,
  requesterId: string,
  targetUserId: string,
  role: TeamRole = 'member',
): Promise<void> {
  await requireTeamOwnerOrAdmin(teamId, requesterId);

  await db.query(
    `INSERT INTO team_members (team_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (team_id, user_id) DO UPDATE SET role = $3`,
    [teamId, targetUserId, role],
  );
}

export async function removeTeamMember(
  teamId: string,
  requesterId: string,
  targetUserId: string,
): Promise<void> {
  // Owner cannot be removed; users can remove themselves
  const ownerCheck = await db.query<{ role: string }>(
    'SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2',
    [teamId, targetUserId],
  );
  if (ownerCheck.rows[0]?.role === 'owner') throw new HttpError(400, 'Cannot remove team owner');

  if (requesterId !== targetUserId) {
    await requireTeamOwnerOrAdmin(teamId, requesterId);
  }

  await db.query('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, targetUserId]);
}

export async function updateMemberRole(
  teamId: string,
  requesterId: string,
  targetUserId: string,
  role: TeamRole,
): Promise<void> {
  await requireTeamOwnerOrAdmin(teamId, requesterId);
  if (role === 'owner') throw new HttpError(400, 'Cannot assign owner role — transfer ownership instead');

  await db.query(
    'UPDATE team_members SET role = $1 WHERE team_id = $2 AND user_id = $3',
    [role, teamId, targetUserId],
  );
}

// ── Helper ────────────────────────────────────────────────────────────────────

function toTeam(row: {
  id: string; name: string; description: string | null; avatar_url: string | null;
  created_by: string; created_at: string; member_count: string; my_role: TeamRole;
}): Team {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    avatarUrl: row.avatar_url,
    createdBy: row.created_by,
    createdAt: row.created_at,
    memberCount: Number(row.member_count),
    myRole: row.my_role,
  };
}
