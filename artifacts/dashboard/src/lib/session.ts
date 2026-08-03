/**
 * Session storage and token refresh for the admin dashboard.
 *
 * Mirrors the mobile apps' session store but persists to localStorage.
 * A short-lived access token lives in memory; the refresh token is stored
 * and exchanged for a new access token on demand.
 *
 * As in the apps, a single in-flight refresh promise is shared so parallel
 * requests can't each rotate the token — the server treats a reused refresh
 * token as theft and would end the session.
 */

const ACCESS_KEY = "moveapayao.admin.accessToken"
const REFRESH_KEY = "moveapayao.admin.refreshToken"
const EXPIRY_KEY = "moveapayao.admin.expiresAt"
const EXPIRY_SKEW_MS = 60_000

export interface AdminUser {
  id: string
  email: string
  fullName?: string | null
  role: string
}

interface SessionPayload {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user?: AdminUser
}

let accessToken: string | null = null
let refreshToken: string | null = localStorage.getItem(REFRESH_KEY)
let expiresAt = Number(localStorage.getItem(EXPIRY_KEY) ?? 0)
let refreshPromise: Promise<string | null> | null = null

accessToken = localStorage.getItem(ACCESS_KEY)

function persist(s: SessionPayload) {
  accessToken = s.accessToken
  refreshToken = s.refreshToken
  expiresAt = Date.now() + s.expiresIn * 1000
  localStorage.setItem(ACCESS_KEY, accessToken)
  localStorage.setItem(REFRESH_KEY, refreshToken)
  localStorage.setItem(EXPIRY_KEY, String(expiresAt))
}

export function clearSession() {
  accessToken = null
  refreshToken = null
  expiresAt = 0
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(EXPIRY_KEY)
}

export function hasSession(): boolean {
  return !!refreshToken
}

async function doRefresh(): Promise<string | null> {
  if (!refreshToken) return null
  try {
    const resp = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    })
    if (!resp.ok) {
      if (resp.status === 401) clearSession()
      return null
    }
    const data = (await resp.json()) as SessionPayload
    persist(data)
    return data.accessToken
  } catch {
    return null
  }
}

export async function getAccessToken(): Promise<string | null> {
  if (accessToken && Date.now() < expiresAt - EXPIRY_SKEW_MS) return accessToken
  if (!refreshToken) return null
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

export async function signIn(
  identifier: string,
  password: string,
): Promise<{ user: AdminUser | null; error: string | null }> {
  try {
    const resp = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      return { user: null, error: (data as { error?: string }).error ?? "Sign in failed" }
    }
    const payload = data as SessionPayload & { user: AdminUser }
    // The dashboard is an operations tool — a passenger or driver signing in
    // here would see an empty, confusing UI, so reject anyone who isn't staff.
    if (payload.user.role !== "admin") {
      return { user: null, error: "This account does not have dashboard access" }
    }
    persist(payload)
    return { user: payload.user, error: null }
  } catch {
    return { user: null, error: "Could not reach the server" }
  }
}

export async function signOut(): Promise<void> {
  const token = refreshToken
  clearSession()
  if (token) {
    fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: token }),
    }).catch(() => {})
  }
}
