import { apiFetch } from './client';
import type { LoginResponse, User } from './types';

export function login(email: string, password: string, deviceName: string) {
  return apiFetch<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, deviceName }),
  });
}

export function getMe() {
  return apiFetch<{ user: User }>('/api/auth/me');
}
