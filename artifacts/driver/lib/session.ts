import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { API_BASE_URL } from "@/lib/api-config";

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

const ACCESS_KEY = "moveapayao.accessToken";
const REFRESH_KEY = "moveapayao.refreshToken";
const EXPIRY_KEY = "moveapayao.expiresAt";
const PUSH_TOKEN_KEY = "moveapayao.driverPushToken";

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
  driverApplicationStatus?: "pending" | "approved" | "rejected" | "revoked";
  driverApplicationReason?: string | null;
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
let storedSessionPromise: Promise<boolean> | null = null;

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
  return API_BASE_URL.replace(/\/+$/, "");
}

export async function loadStoredSession(): Promise<boolean> {
  const legacy = await AsyncStorage.getItem(REFRESH_KEY);
  refreshToken =
    Platform.OS === "web" ? legacy : await SecureStore.getItemAsync(REFRESH_KEY);
  if (!refreshToken && legacy && Platform.OS !== "web") {
    refreshToken = legacy;
    await SecureStore.setItemAsync(REFRESH_KEY, legacy);
  }
  accessToken = null;
  expiresAt = 0;
  await AsyncStorage.multiRemove([ACCESS_KEY, EXPIRY_KEY, ...(Platform.OS === "web" ? [] : [REFRESH_KEY])]);
  return !!refreshToken;
}

async function ensureStoredSessionLoaded(): Promise<boolean> {
  if (refreshToken) return true;
  if (!storedSessionPromise) {
    storedSessionPromise = loadStoredSession().finally(() => {
      storedSessionPromise = null;
    });
  }
  return storedSessionPromise;
}

export async function persistSession(s: SessionPayload): Promise<void> {
  accessToken = s.accessToken;
  refreshToken = s.refreshToken;
  expiresAt = Date.now() + s.expiresIn * 1000;
  if (Platform.OS === "web") await AsyncStorage.setItem(REFRESH_KEY, refreshToken);
  else await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
  notify();
}

export async function clearSession(): Promise<void> {
  accessToken = null;
  refreshToken = null;
  expiresAt = 0;
  await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY, EXPIRY_KEY]);
  if (Platform.OS !== "web") await SecureStore.deleteItemAsync(REFRESH_KEY);
  notify();
}

export function hasSession(): boolean {
  return !!refreshToken;
}

async function doRefresh(): Promise<string | null> {
  if (!refreshToken) return null;
  try {
    const resp = await fetch(`${base()}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
  // Android may start the headless background-location task after killing the
  // React process. In that case module memory is empty even though SecureStore
  // still has a valid refresh token, so hydrate it here rather than relying on
  // AuthProvider having mounted first.
  if (!refreshToken && !(await ensureStoredSessionLoaded())) return null;

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
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(
      (data as { error?: string }).error ?? "Something went wrong",
    );
  }
  return data as T;
}

export async function signIn(
  identifier: string,
  password: string,
): Promise<AuthUser> {
  const data = await authPost<SessionPayload & { user: AuthUser }>(
    "/api/auth/login",
    {
      identifier,
      password,
    },
  );
  await persistSession(data);
  return data.user;
}

export interface SignUpDetails {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  role: "passenger" | "driver_applicant";
  vehicleType?: string;
  licenseNumber?: string;
  plateNumber?: string;
  vehicleColor?: string;
  acceptedTerms: true;
  termsVersion?: string;
}

export async function signUp(details: SignUpDetails): Promise<AuthUser> {
  const data = await authPost<SessionPayload & { user: AuthUser }>(
    "/api/auth/register",
    details,
  );
  await persistSession(data);
  return data.user;
}

export async function signOut(): Promise<void> {
  const token = refreshToken;
  const authToken = await getAccessToken();
  const pushToken = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  if (authToken && pushToken) {
    await fetch(`${base()}/api/notifications/device`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ token: pushToken }),
    }).catch(() => undefined);
  }
  await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
  await clearSession();
  if (token) {
    // Best effort — the local session is already gone either way.
    fetch(`${base()}/api/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: token }),
    }).catch(() => {});
  }
}

export async function requestPasswordReset(email: string): Promise<string> {
  const data = await authPost<{ message: string }>(
    "/api/auth/forgot-password",
    { email },
  );
  return data.message;
}
