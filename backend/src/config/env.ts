import { config } from 'dotenv';

config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL'),
  redisUrl: required('REDIS_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
  uploadsDir: process.env.UPLOADS_DIR ?? 'uploads',
  maxFileSizeBytes: Number(process.env.MAX_FILE_SIZE_MB ?? 25) * 1024 * 1024,

  // LDAP — all optional; LDAP auth is disabled when LDAP_URL is not set
  ldapUrl: process.env.LDAP_URL,
  ldapBaseDn: process.env.LDAP_BASE_DN ?? '',
  ldapBindDn: process.env.LDAP_BIND_DN,
  ldapBindPassword: process.env.LDAP_BIND_PASSWORD,
  ldapUsernameAttr: process.env.LDAP_USERNAME_ATTR ?? 'uid', // 'sAMAccountName' for Active Directory

  // TOTP
  totpIssuer: process.env.TOTP_ISSUER ?? 'InternalMessenger',
};
