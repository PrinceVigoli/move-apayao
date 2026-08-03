import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/lib/api-config';

/**
 * Session storage and token refresh for the app.
 *
 * Holds a short-lived access token in memory
 * and persists the refresh token (plus a cached copy of the access token) in
 * AsyncStorage so the user stays signed in across app restarts.
 *
 * Concurrency note: many screens fire requests at once, and after a cold
 * start they can all discover an expired token simultaneously. `refreshPromise`
 * makes sure only ONE refresh request is ever in flight — without it, several
 * parallel refreshes would each rotate the token, and every rotation but the
 * last would be treated by the server as a replayed token, logging the user
 * out for what is really just normal app startup.
 */

const ACCESS_KEY = 'moveapayao.accessToken';
const REFRESH_KEY = 'moveapayao.refreshToken';
const EXPIRY_KEY = 'moveapayao.expiresAt';

// Refresh a little early so a request never leaves with a token that expires
// while it is in flight.
const EXPIRY_SKEW_MS = 60_000;

export interface AuthUser {
  id: string;
  email: string;
  phone?: string | null;
  fullName?: string | null;
  role: string;
  avatarUrl?: string | null;
  isActive: boolean;
}

interface SessionPayload {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user?: AuthUser;
}

let accessToken: string | null = null;
let refreshToken: string | null = null;
let expiresAt = 0;
let refreshPromise: Promise<string | null> | null = null;

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
}

export function onSessionChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

function base(): string {
  return API_BASE_URL.replace(/\/+$/, '');
}

export async function loadStoredSession(): Promise<boolean> {
  const [[, a], [, r], [, e]] = await AsyncStorage.multiGet([
    ACCESS_KEY,
    REFRESH_KEY,
    EXPIRY_KEY,
  ]);
  accessToken = a;
  refreshToken = r;
  expiresAt = e ? Number(e) : 0;
  return !!refreshToken;
}

export async function persistSession(s: SessionPayload): Promise<void> {
  accessToken = s.accessToken;
  refreshToken = s.refreshToken;
  expiresAt = Date.now() + s.expiresIn * 1000;
  await AsyncStorage.multiSet([
    [ACCESS_KEY, accessToken],
    [REFRESH_KEY, refreshToken],
    [EXPIRY_KEY, String(expiresAt)],
  ]);
  notify();
}

export async function clearSession(): Promise<void> {
  accessToken = null;
  refreshToken = null;
  expiresAt = 0;
  await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY, EXPIRY_KEY]);
  notify();
}

export function hasSession(): boolean {
  return !!refreshToken;
}

async function doRefresh(): Promise<string | null> {
  if (!refreshToken) return null;
  try {
    const resp = await fetch(`${base()}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!resp.ok) {
      // 401 means the refresh token is dead — sign out rather than retrying.
      if (resp.status === 401) await clearSession();
      return null;
    }
    const data = (await resp.json()) as SessionPayload;
    await persistSession(data);
    return data.accessToken;
  } catch {
    // Network failure: keep the stored session so the user isn't signed out
    // just because they walked into a dead zone.
    return null;
  }
}

/**
 * Returns a usable access token, refreshing first if it is expired or close
 * to it. Returns null when the user needs to sign in again.
 */
export async function getAccessToken(): Promise<string | null> {
  if (accessToken && Date.now() < expiresAt - EXPIRY_SKEW_MS) {
    return accessToken;
  }
  if (!refreshToken) return null;

  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/* ------------------------------------------------------------------ */
/* Auth calls                                                          */
/* ------------------------------------------------------------------ */

async function authPost<T>(path: string, body: unknown): Promise<T> {
  const resp = await fetch(`${base()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error((data as { error?: string }).error ?? 'Something went wrong');
  }
  return data as T;
}

export async function signIn(identifier: string, password: string): Promise<AuthUser> {
  const data = await authPost<SessionPayload & { user: AuthUser }>('/api/auth/login', {
    identifier,
    password,
  });
  await persistSession(data);
  return data.user;
}

export interface SignUpDetails {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  role: 'passenger' | 'driver';
  vehicleType?: string;
  licenseNumber?: string;
  plateNumber?: string;
  vehicleColor?: string;
}

export async function signUp(details: SignUpDetails): Promise<AuthUser> {
  const data = await authPost<SessionPayload & { user: AuthUser }>(
    '/api/auth/register',
    details,
  );
  await persistSession(data);
  return data.user;
}

export async function signOut(): Promise<void> {
  const token = refreshToken;
  await clearSession();
  if (token) {
    // Best effort — the local session is already gone either way.
    fetch(`${base()}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: token }),
    }).catch(() => {});
  }
}

export async function requestPasswordReset(email: string): Promise<string> {
  const data = await authPost<{ message: string }>('/api/auth/forgot-password', { email });
  return data.message;
}
