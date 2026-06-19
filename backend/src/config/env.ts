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

  // MinIO / S3 — all optional; local disk is used when MINIO_ENDPOINT is not set
  minioEndpoint: process.env.MINIO_ENDPOINT,           // e.g. http://localhost:9000
  minioAccessKey: process.env.MINIO_ACCESS_KEY,
  minioSecretKey: process.env.MINIO_SECRET_KEY,
  minioBucket: process.env.MINIO_BUCKET ?? 'messenger-files',
  minioRegion: process.env.MINIO_REGION ?? 'us-east-1',

  // LDAP — all optional; LDAP auth is disabled when LDAP_URL is not set
  ldapUrl: process.env.LDAP_URL,
  ldapBaseDn: process.env.LDAP_BASE_DN ?? '',
  ldapBindDn: process.env.LDAP_BIND_DN,
  ldapBindPassword: process.env.LDAP_BIND_PASSWORD,
  ldapUsernameAttr: process.env.LDAP_USERNAME_ATTR ?? 'uid', // 'sAMAccountName' for Active Directory

  // TOTP
  totpIssuer: process.env.TOTP_ISSUER ?? 'InternalMessenger',

  // Firebase / FCM push notifications — disabled when not set
  // Set ONE of: FIREBASE_SERVICE_ACCOUNT_JSON (base64 JSON) or FIREBASE_SERVICE_ACCOUNT_PATH (file path)
  firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  firebaseServiceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
};
