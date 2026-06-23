import { Client } from 'ldapts';
import { db } from '../../config/db.js';
import { env } from '../../config/env.js';
import { syncUserTeams } from '../users/users.service.js';

export interface LdapUser {
  dn: string;
  email: string;
  username: string;
  displayName: string;
  department?: string;
}

function makeLdapClient(): Client {
  return new Client({
    url: env.ldapUrl!,
    connectTimeout: 5000,
    timeout: 5000,
    tlsOptions: { rejectUnauthorized: true },
  });
}

async function searchUser(username: string): Promise<{ dn: string; attrs: Record<string, string> } | null> {
  if (!env.ldapBindDn || !env.ldapBindPassword) return null;

  const client = makeLdapClient();
  try {
    await client.bind(env.ldapBindDn, env.ldapBindPassword);

    const { searchEntries } = await client.search(env.ldapBaseDn, {
      scope: 'sub',
      filter: `(${env.ldapUsernameAttr}=${username})`,
      attributes: ['dn', 'mail', 'uid', 'sAMAccountName', 'displayName', 'cn', 'department'],
    });

    if (!searchEntries[0]) return null;
    const entry = searchEntries[0];
    const attrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(entry)) {
      if (typeof v === 'string') attrs[k] = v;
      else if (Array.isArray(v) && typeof v[0] === 'string') attrs[k] = v[0];
    }
    return { dn: entry.dn, attrs };
  } finally {
    await client.unbind();
  }
}

export async function ldapAuthenticate(username: string, password: string): Promise<LdapUser | null> {
  if (!env.ldapUrl) return null; // LDAP not configured

  let userDn: string;
  let attrs: Record<string, string> = {};

  if (env.ldapBindDn && env.ldapBindPassword) {
    // Two-step: admin search → user bind
    const found = await searchUser(username);
    if (!found) return null;
    userDn = found.dn;
    attrs = found.attrs;
  } else {
    // Simple bind: uid=username,baseDn
    userDn = `${env.ldapUsernameAttr}=${username},${env.ldapBaseDn}`;
  }

  // Bind as the user to verify their password
  const client = makeLdapClient();
  try {
    await client.bind(userDn, password);

    // If no admin search was done, fetch attrs now as the user
    if (!attrs['mail']) {
      const { searchEntries } = await client.search(userDn, {
        scope: 'base',
        attributes: ['mail', 'uid', 'sAMAccountName', 'displayName', 'cn', 'department'],
      });
      const entry = searchEntries[0];
      if (entry) {
        for (const [k, v] of Object.entries(entry)) {
          if (typeof v === 'string') attrs[k] = v;
          else if (Array.isArray(v) && typeof v[0] === 'string') attrs[k] = v[0];
        }
      }
    }

    return {
      dn: userDn,
      email: attrs['mail'] ?? `${username}@unknown`,
      username: attrs['uid'] ?? attrs['sAMAccountName'] ?? username,
      displayName: attrs['displayName'] ?? attrs['cn'] ?? username,
      department: attrs['department'],
    };
  } catch {
    return null; // Wrong password or bind failure
  } finally {
    await client.unbind();
  }
}

export async function upsertLdapUser(ldapUser: LdapUser): Promise<{ id: string; role: string }> {
  const result = await db.query<{ id: string; role: string; department: string | null }>(
    `INSERT INTO users (email, username, display_name, department, ldap_dn, password_hash)
     VALUES ($1, $2, $3, $4, $5, NULL)
     ON CONFLICT (ldap_dn) DO UPDATE SET
       email        = EXCLUDED.email,
       display_name = EXCLUDED.display_name,
       department   = EXCLUDED.department,
       updated_at   = now()
     RETURNING id, role, department`,
    [ldapUser.email, ldapUser.username, ldapUser.displayName, ldapUser.department ?? null, ldapUser.dn],
  );
  const user = result.rows[0];

  // Sync all teams (department + role + All Employees) on every LDAP login
  await syncUserTeams(user.id, user.role, user.department);

  return { id: user.id, role: user.role };
}
