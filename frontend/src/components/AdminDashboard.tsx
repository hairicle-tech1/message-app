import { useEffect, useState } from 'react';
import { apiFetch } from '../api/client';
import * as departmentsApi from '../api/departments';
import type { Department } from '../api/departments';

type AdminTab = 'overview' | 'users' | 'departments' | 'logs';

interface Stats { totalUsers: number; activeUsers: number; totalMessages: number; messagesLast24h: number; totalConversations: number }
interface AdminUser { id: string; email: string; username: string; display_name: string; role: string; department: string | null; status: string; created_at: string }
interface AuditLog { id: string; action: string; userEmail: string | null; ipAddress: string | null; createdAt: string; metadata: Record<string, unknown> | null }

export function AdminDashboard() {
  const [tab, setTab] = useState<AdminTab>('overview');

  // Overview
  const [stats, setStats] = useState<Stats | null>(null);

  // Users
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', username: '', displayName: '', password: '', role: 'staff', department: '' });
  const [createMsg, setCreateMsg] = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);

  // User editing
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editUserFields, setEditUserFields] = useState({ displayName: '', username: '', email: '', role: '', department: '' });
  const [editUserMsg, setEditUserMsg] = useState('');

  // Departments
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptDesc, setNewDeptDesc] = useState('');
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptMsg, setDeptMsg] = useState('');
  const [expandedDept, setExpandedDept] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<{ deptName: string; userId: string }>({ deptName: '', userId: '' });

  // Audit logs
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [logAction, setLogAction] = useState('');
  const [logTotal, setLogTotal] = useState(0);

  useEffect(() => {
    apiFetch<{ stats: Stats }>('/api/admin/stats').then(({ stats }) => setStats(stats)).catch(() => {});
    departmentsApi.listDepartments().then(({ departments }) => setDepartments(departments)).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === 'users' || tab === 'departments') loadUsers();
    if (tab === 'logs') loadLogs();
  }, [tab]);

  async function loadUsers() {
    const res = await apiFetch<{ users: AdminUser[] }>('/api/users');
    setUsers(res.users);
  }

  async function loadLogs() {
    const params = new URLSearchParams({ limit: '50' });
    if (logAction) params.set('action', logAction);
    const res = await apiFetch<{ logs: AuditLog[]; total: number }>(`/api/admin/audit-logs?${params}`);
    setLogs(res.logs);
    setLogTotal(res.total);
  }

  async function handleCreateUser(e: { preventDefault(): void }) {
    e.preventDefault();
    setCreateMsg('');
    try {
      await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          email: newUser.email,
          username: newUser.username,
          displayName: newUser.displayName,
          password: newUser.password,
          role: newUser.role || 'staff',
          department: newUser.department || undefined,
        }),
      });
      setCreateMsg('User created!');
      setNewUser({ email: '', username: '', displayName: '', password: '', role: 'staff', department: '' });
      setShowCreateUser(false);
      loadUsers();
      apiFetch<{ stats: Stats }>('/api/admin/stats').then(({ stats }) => setStats(stats)).catch(() => {});
    } catch (err) { setCreateMsg((err as Error).message); }
  }

  function startEditUser(u: AdminUser) {
    setEditingUser(u);
    setEditUserFields({ displayName: u.display_name, username: u.username, email: u.email, role: u.role, department: u.department ?? '' });
    setEditUserMsg('');
  }

  async function handleSaveUser(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!editingUser) return;
    setEditUserMsg('');
    try {
      await apiFetch(`/api/admin/users/${editingUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: editUserFields.displayName || undefined,
          username: editUserFields.username || undefined,
          email: editUserFields.email || undefined,
          role: editUserFields.role || undefined,
          department: editUserFields.department || null,
        }),
      });
      setEditUserMsg('Saved!');
      await loadUsers();
      setTimeout(() => { setEditingUser(null); setEditUserMsg(''); }, 800);
    } catch (err) {
      setEditUserMsg((err as Error).message);
    }
  }

  async function handleToggleStatus(userId: string, currentStatus: string) {
    const next = currentStatus === 'active' ? 'disabled' : 'active';
    const msg = next === 'disabled'
      ? 'Disable this user? They will not be able to log in.'
      : 'Re-enable this user?';
    if (!window.confirm(msg)) return;
    await apiFetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: next }),
    });
    await loadUsers();
  }

  async function handleDeleteUser(userId: string, displayName: string) {
    const confirmed = window.confirm(
      `Permanently delete "${displayName}"?\n\nThis cannot be undone. All their data (devices, team memberships, reactions) will be removed.`,
    );
    if (!confirmed) return;
    await apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    apiFetch<{ stats: Stats }>('/api/admin/stats').then(({ stats }) => setStats(stats)).catch(() => {});
  }

  async function handleCreateDept(e: { preventDefault(): void }) {
    e.preventDefault();
    setDeptMsg('');
    try {
      const { department } = await departmentsApi.createDepartment(newDeptName, newDeptDesc || undefined);
      setDepartments((prev) => [...prev, department].sort((a, b) => a.name.localeCompare(b.name)));
      setNewDeptName(''); setNewDeptDesc('');
      setDeptMsg('Department added!');
    } catch (err) { setDeptMsg((err as Error).message); }
    setTimeout(() => setDeptMsg(''), 3000);
  }

  async function handleUpdateDept(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!editingDept) return;
    try {
      const { department } = await departmentsApi.updateDepartment(editingDept.id, { name: editingDept.name, description: editingDept.description });
      setDepartments((prev) => prev.map((d) => d.id === department.id ? department : d));
      setEditingDept(null);
      setDeptMsg('Updated!');
    } catch (err) { setDeptMsg((err as Error).message); }
    setTimeout(() => setDeptMsg(''), 3000);
  }

  async function handleAssignToDept(userId: string, deptName: string) {
    await apiFetch(`/api/admin/users/${userId}`, { method: 'PATCH', body: JSON.stringify({ department: deptName }) });
    await loadUsers();
    setAssignTarget({ deptName: '', userId: '' });
  }

  async function handleRemoveFromDept(userId: string) {
    await apiFetch(`/api/admin/users/${userId}`, { method: 'PATCH', body: JSON.stringify({ department: null }) });
    await loadUsers();
  }

  async function handleDeleteDept(id: string, name: string) {
    if (!window.confirm(`Delete department "${name}"? Users with this department won't be removed from teams.`)) return;
    try {
      await departmentsApi.deleteDepartment(id);
      setDepartments((prev) => prev.filter((d) => d.id !== id));
      setDeptMsg('Deleted.');
    } catch (err) { setDeptMsg((err as Error).message); }
    setTimeout(() => setDeptMsg(''), 3000);
  }

  const filteredUsers = users.filter((u) =>
    !userSearch ||
    u.display_name.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.username.toLowerCase().includes(userSearch.toLowerCase()),
  );

  const tabs: { id: AdminTab; label: string; icon: string }[] = [
    { id: 'overview',     label: 'Overview',    icon: '📊' },
    { id: 'users',        label: 'Users',       icon: '👥' },
    { id: 'departments',  label: 'Departments', icon: '🏢' },
    { id: 'logs',         label: 'Audit Logs',  icon: '📋' },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* Header + tabs */}
      <div className="bg-white border-b border-slate-200 flex-shrink-0">
        <div className="px-8 pt-5 pb-0 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Admin Dashboard</h1>
            <p className="text-sm text-slate-400">Manage users, departments, and platform settings</p>
          </div>
        </div>
        <div className="flex px-8 mt-3 gap-0">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}>
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
              {stats ? ([
                { key: 'totalUsers',         label: 'Total Users',     icon: '👥', color: '#6366f1' },
                { key: 'activeUsers',        label: 'Active Users',    icon: '✅', color: '#10b981' },
                { key: 'totalMessages',      label: 'Messages',        icon: '💬', color: '#3b82f6' },
                { key: 'messagesLast24h',    label: 'Messages (24h)',  icon: '📈', color: '#f97316' },
                { key: 'totalConversations', label: 'Conversations',   icon: '🗂️', color: '#8b5cf6' },
              ] as const).map(({ key, label, icon, color }) => (
                <div key={key} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3"
                    style={{ backgroundColor: `${color}20` }}>{icon}</div>
                  <p className="text-3xl font-bold text-slate-900">{(stats as unknown as Record<string, number>)[key] ?? 0}</p>
                  <p className="text-sm text-slate-500 mt-1">{label}</p>
                </div>
              )) : <p className="col-span-5 text-slate-400 text-sm">Loading…</p>}
            </div>

            {/* Quick actions */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
              <h3 className="font-semibold text-slate-700 mb-4">Quick actions</h3>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => {
                  apiFetch<{ synced: number }>('/api/admin/sync-department-teams', { method: 'POST' })
                    .then(({ synced }) => { window.alert(`Synced ${synced} users to department teams.`); apiFetch<{stats:Stats}>('/api/admin/stats').then(({stats})=>setStats(stats)).catch(()=>{}); })
                    .catch((e) => window.alert((e as Error).message));
                }} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-colors">
                  🔄 Sync department teams
                </button>
                <button onClick={() => setTab('users')} className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-medium transition-colors">
                  👥 Manage users
                </button>
                <button onClick={() => setTab('departments')} className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-medium transition-colors">
                  🏢 Manage departments
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── USERS ── */}
        {tab === 'users' && (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center gap-3">
              <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search by name, email or username…"
                className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <button onClick={() => setShowCreateUser((v) => !v)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-colors">
                + New user
              </button>
              <button onClick={loadUsers} className="px-3 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-sm text-slate-500">
                ↻
              </button>
            </div>

            {/* Create user form */}
            {showCreateUser && (
              <form onSubmit={handleCreateUser} className="bg-white rounded-2xl p-6 shadow-sm border border-indigo-100 grid grid-cols-2 gap-4">
                <h3 className="col-span-2 font-semibold text-slate-700">Create new user</h3>
                {[
                  { key: 'displayName', label: 'Display name', placeholder: 'Alice Smith' },
                  { key: 'username',    label: 'Username',     placeholder: 'alice' },
                  { key: 'email',       label: 'Email',        placeholder: 'alice@company.local' },
                  { key: 'password',    label: 'Password',     placeholder: 'min 8 characters', type: 'password' },
                ].map(({ key, label, placeholder, type }) => (
                  <div key={key}>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
                    <input type={type ?? 'text'} value={(newUser as Record<string, string>)[key]}
                      onChange={(e) => setNewUser((prev) => ({ ...prev, [key]: e.target.value }))}
                      placeholder={placeholder} required
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Role</label>
                  <input value={newUser.role} onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value }))}
                    placeholder="staff, admin, manager…"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Department</label>
                  <select value={newUser.department} onChange={(e) => setNewUser((p) => ({ ...p, department: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                    <option value="">— None —</option>
                    {departments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                  </select>
                </div>
                {createMsg && <p className={`col-span-2 text-sm text-center ${createMsg.includes('!') ? 'text-emerald-600' : 'text-red-500'}`}>{createMsg}</p>}
                <div className="col-span-2 flex gap-3">
                  <button type="submit" className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold">Create user</button>
                  <button type="button" onClick={() => setShowCreateUser(false)} className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600">Cancel</button>
                </div>
              </form>
            )}

            {/* Users table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left">
                    <th className="px-5 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">User</th>
                    <th className="px-5 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Department</th>
                    <th className="px-5 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Role</th>
                    <th className="px-5 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Status</th>
                    <th className="px-5 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Joined</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredUsers.map((u) => (
                    <>
                      <tr key={u.id} className={`hover:bg-slate-50 transition-colors ${editingUser?.id === u.id ? 'bg-indigo-50/50' : ''}`}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs flex-shrink-0">
                              {u.display_name.slice(0, 1).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-slate-900">{u.display_name}</p>
                              <p className="text-xs text-slate-400">@{u.username} · {u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-slate-600 text-sm">{u.department ?? <span className="text-slate-300">—</span>}</td>
                        <td className="px-5 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            u.role === 'admin' ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-600'
                          }`}>{u.role}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            u.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                          }`}>{u.status}</span>
                        </td>
                        <td className="px-5 py-3 text-slate-400 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                        <td className="px-5 py-3">
                          <div className="flex gap-1 justify-end items-center">
                            <button onClick={() => editingUser?.id === u.id ? setEditingUser(null) : startEditUser(u)}
                              className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors border ${
                                editingUser?.id === u.id
                                  ? 'bg-slate-100 text-slate-500 border-slate-200'
                                  : 'text-indigo-600 hover:bg-indigo-50 border-indigo-200'
                              }`}>
                              {editingUser?.id === u.id ? 'Cancel' : '✏️ Edit'}
                            </button>
                            <button onClick={() => handleToggleStatus(u.id, u.status)}
                              className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors border ${
                                u.status === 'active'
                                  ? 'text-amber-600 hover:bg-amber-50 border-amber-200'
                                  : 'text-emerald-600 hover:bg-emerald-50 border-emerald-200'
                              }`}>
                              {u.status === 'active' ? '⏸ Disable' : '▶ Enable'}
                            </button>
                            <button onClick={() => handleDeleteUser(u.id, u.display_name)}
                              className="px-2 py-1 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 border border-red-200 transition-colors">
                              🗑 Delete
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Inline edit form */}
                      {editingUser?.id === u.id && (
                        <tr key={`edit-${u.id}`} className="bg-indigo-50/50">
                          <td colSpan={6} className="px-5 py-4">
                            <form onSubmit={handleSaveUser}>
                              <div className="grid grid-cols-3 gap-3 mb-3">
                                <div>
                                  <label className="block text-xs font-semibold text-slate-500 mb-1">Display Name</label>
                                  <input value={editUserFields.displayName}
                                    onChange={(e) => setEditUserFields((p) => ({ ...p, displayName: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-slate-500 mb-1">Username</label>
                                  <input value={editUserFields.username}
                                    onChange={(e) => setEditUserFields((p) => ({ ...p, username: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-slate-500 mb-1">Email</label>
                                  <input type="email" value={editUserFields.email}
                                    onChange={(e) => setEditUserFields((p) => ({ ...p, email: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-slate-500 mb-1">Role</label>
                                  <input value={editUserFields.role}
                                    onChange={(e) => setEditUserFields((p) => ({ ...p, role: e.target.value }))}
                                    placeholder="staff, admin, manager…"
                                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-slate-500 mb-1">Department</label>
                                  <select value={editUserFields.department}
                                    onChange={(e) => setEditUserFields((p) => ({ ...p, department: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white">
                                    <option value="">— No department —</option>
                                    {departments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                                  </select>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <button type="submit"
                                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors">
                                  Save changes
                                </button>
                                <button type="button" onClick={() => setEditingUser(null)}
                                  className="px-4 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50 transition-colors">
                                  Cancel
                                </button>
                                {editUserMsg && (
                                  <span className={`text-sm font-medium ${editUserMsg === 'Saved!' ? 'text-emerald-600' : 'text-red-500'}`}>
                                    {editUserMsg}
                                  </span>
                                )}
                              </div>
                            </form>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400 text-sm">No users found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── DEPARTMENTS ── */}
        {tab === 'departments' && (
          <div className="space-y-4">
            {deptMsg && (
              <p className={`text-sm font-medium text-center py-2 rounded-xl ${deptMsg.includes('!') || deptMsg === 'Updated!' || deptMsg === 'Deleted.' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                {deptMsg}
              </p>
            )}

            {/* Add department */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
              <h3 className="font-semibold text-slate-700 mb-3">Add department</h3>
              <form onSubmit={handleCreateDept} className="flex gap-3">
                <input value={newDeptName} onChange={(e) => setNewDeptName(e.target.value)}
                  placeholder="Department name" required
                  className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                <input value={newDeptDesc} onChange={(e) => setNewDeptDesc(e.target.value)}
                  placeholder="Description (optional)"
                  className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium">Add</button>
              </form>
            </div>

            {/* Department cards with members */}
            <div className="space-y-3">
              {departments.map((d) => {
                const members = users.filter((u) => u.department === d.name);
                const isExpanded = expandedDept === d.id;
                const unassigned = users.filter((u) => !u.department || u.department !== d.name);

                return (
                  <div key={d.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                    {/* Department header row */}
                    <div className="flex items-center gap-3 px-5 py-4">
                      {/* Expand toggle */}
                      <button onClick={() => setExpandedDept(isExpanded ? null : d.id)}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left">
                        <span className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                          style={{ backgroundColor: '#6366f120', color: '#6366f1' }}>
                          {d.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          {editingDept?.id === d.id ? null : (
                            <>
                              <p className="font-semibold text-slate-800">{d.name}</p>
                              {d.description && <p className="text-xs text-slate-400">{d.description}</p>}
                            </>
                          )}
                        </div>
                        <span className="ml-auto flex-shrink-0 bg-indigo-100 text-indigo-700 text-xs font-bold px-2.5 py-1 rounded-full">
                          {members.length} member{members.length !== 1 ? 's' : ''}
                        </span>
                      </button>
                      {/* Actions */}
                      <button onClick={() => setEditingDept(editingDept?.id === d.id ? null : d)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg text-xs transition-colors">Edit</button>
                      <button onClick={() => handleDeleteDept(d.id, d.name)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg text-xs transition-colors">Delete</button>
                    </div>

                    {/* Inline edit form */}
                    {editingDept?.id === d.id && (
                      <div className="px-5 pb-4 border-t border-slate-100 pt-3">
                        <form onSubmit={handleUpdateDept} className="flex gap-2">
                          <input value={editingDept.name} onChange={(e) => setEditingDept({ ...editingDept, name: e.target.value })}
                            className="flex-1 border border-indigo-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                          <input value={editingDept.description ?? ''} onChange={(e) => setEditingDept({ ...editingDept, description: e.target.value })}
                            placeholder="Description"
                            className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none" />
                          <button type="submit" className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium">Save</button>
                          <button type="button" onClick={() => setEditingDept(null)} className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs">Cancel</button>
                        </form>
                      </div>
                    )}

                    {/* Expanded member list */}
                    {isExpanded && (
                      <div className="border-t border-slate-100">
                        {members.length > 0 ? (
                          <ul className="divide-y divide-slate-50">
                            {members.map((u) => (
                              <li key={u.id} className="flex items-center gap-3 px-5 py-3">
                                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs flex-shrink-0">
                                  {u.display_name.slice(0, 1).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-slate-800 truncate">{u.display_name}</p>
                                  <p className="text-xs text-slate-400">@{u.username}</p>
                                </div>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  u.role === 'admin' ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-500'
                                }`}>{u.role}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                                  u.status === 'active' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-500'
                                }`}>{u.status}</span>
                                <button onClick={() => handleRemoveFromDept(u.id)}
                                  title="Remove from department"
                                  className="text-slate-300 hover:text-red-400 transition-colors text-sm ml-1">✕</button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="px-5 py-4 text-sm text-slate-400 italic">No members in this department</p>
                        )}

                        {/* Assign user to this department */}
                        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex gap-2 items-center">
                          <select
                            value={assignTarget.deptName === d.name ? assignTarget.userId : ''}
                            onChange={(e) => setAssignTarget({ deptName: d.name, userId: e.target.value })}
                            className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                            <option value="">— Assign a user to {d.name} —</option>
                            {unassigned.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.display_name} (@{u.username}){u.department ? ` · currently in ${u.department}` : ''}
                              </option>
                            ))}
                          </select>
                          <button
                            disabled={!assignTarget.userId || assignTarget.deptName !== d.name}
                            onClick={() => handleAssignToDept(assignTarget.userId, d.name)}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors">
                            Assign
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {departments.length === 0 && (
                <div className="bg-white rounded-2xl p-10 text-center text-slate-400 text-sm shadow-sm border border-slate-100">
                  No departments yet — add one above
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── AUDIT LOGS ── */}
        {tab === 'logs' && (
          <div className="space-y-4">
            <div className="flex gap-3 items-center">
              <select value={logAction} onChange={(e) => setLogAction(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="">All actions</option>
                {['auth.login','auth.login_failed','auth.totp_enabled','auth.totp_disabled','auth.password_changed','users.created','messages.deleted'].map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <button onClick={loadLogs} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium">Filter</button>
              <span className="text-xs text-slate-400">{logTotal} total entries</span>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left">
                    <th className="px-5 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Time</th>
                    <th className="px-5 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Action</th>
                    <th className="px-5 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">User</th>
                    <th className="px-5 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">IP</th>
                    <th className="px-5 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 font-mono text-xs">
                  {logs.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className="px-5 py-2.5 text-slate-400 whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
                      <td className="px-5 py-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${
                          l.action.includes('failed') ? 'bg-red-100 text-red-700' :
                          l.action.includes('deleted') ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>{l.action}</span>
                      </td>
                      <td className="px-5 py-2.5 text-slate-600">{l.userEmail ?? '—'}</td>
                      <td className="px-5 py-2.5 text-slate-400">{l.ipAddress ?? '—'}</td>
                      <td className="px-5 py-2.5 text-slate-400 max-w-xs truncate">
                        {l.metadata ? JSON.stringify(l.metadata) : ''}
                      </td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400 font-sans">No logs found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
