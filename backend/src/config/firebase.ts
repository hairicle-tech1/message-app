import { readFileSync } from 'node:fs';
import { cert, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { env } from './env.js';

function initFirebase(): App | null {
  if (!env.firebaseServiceAccountJson && !env.firebaseServiceAccountPath) return null;

  try {
    let serviceAccount: ServiceAccount;

    if (env.firebaseServiceAccountJson) {
      const json = Buffer.from(env.firebaseServiceAccountJson, 'base64').toString('utf8');
      serviceAccount = JSON.parse(json) as ServiceAccount;
    } else {
      serviceAccount = JSON.parse(readFileSync(env.firebaseServiceAccountPath!, 'utf8')) as ServiceAccount;
    }

    return initializeApp({ credential: cert(serviceAccount) });
  } catch (err) {
    console.error('[firebase] Failed to initialise Firebase Admin SDK:', err);
    return null;
  }
}

export const firebaseApp = initFirebase();
export const fcmEnabled = firebaseApp !== null;
