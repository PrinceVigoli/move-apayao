/**
 * Session storage and token refresh for the admin dashboard.
 *
 * A short-lived access token lives only in memory. The staff refresh token is
 * held by the API in an HttpOnly cookie, so browser JavaScript and XSS cannot
 * read or persist the 30-day credential.
 *
 * As in the apps, a single in-flight refresh promise is shared so parallel
 * requests can't each rotate the token — the server treats a reused refresh
 * token as theft and would end the session.
 */

const USER_KEY = "moveapayao.admin.user"
const EXPIRY_SKEW_MS = 60_000

export interface AdminUser {
  id: string
  email: string
  fullName?: string | null
  role: "admin" | "superadmin" | "developer"
}

interface SessionPayload {
  accessToken: string
  refreshToken?: string
  expiresIn: number
  user?: AdminUser
}

let accessToken: string | null = null
let expiresAt = 0
let refreshPromise: Promise<string | null> | null = null

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "")

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`
}

function persist(s: SessionPayload) {
  accessToken = s.accessToken
  expiresAt = Date.now() + s.expiresIn * 1000
  if (s.user) localStorage.setItem(USER_KEY, JSON.stringify(s.user))
}

export function getStoredUser(): AdminUser | null {
  try {
    const value = localStorage.getItem(USER_KEY)
    return value ? (JSON.parse(value) as AdminUser) : null
  } catch {
    return null
  }
}

export function clearSession() {
  accessToken = null
  expiresAt = 0
  // Remove access tokens written by older dashboard versions. Access tokens
  // are intentionally memory-only so an XSS has a much smaller replay window.
  localStorage.removeItem("moveapayao.admin.accessToken")
  localStorage.removeItem("moveapayao.admin.refreshToken")
  localStorage.removeItem("moveapayao.admin.expiresAt")
  localStorage.removeItem(USER_KEY)
}

export function hasSession(): boolean {
  // HttpOnly cookies cannot be inspected by JavaScript. The cached non-secret
  // user is only a hint that avoids a refresh request on the public login page.
  return getStoredUser() !== null
}

async function doRefresh(): Promise<string | null> {
  try {
    const resp = await fetch(apiUrl("/api/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({}),
    })
    if (!resp.ok) {
      clearSession()
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
    const resp = await fetch(apiUrl("/api/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ identifier, password, client: "dashboard" }),
    })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      return { user: null, error: (data as { error?: string }).error ?? "Sign in failed" }
    }
    const payload = data as SessionPayload & { user: AdminUser }
    // The dashboard is an operations tool — a passenger or driver signing in
    // here would see an empty, confusing UI, so reject anyone who isn't staff.
    if (!["admin", "superadmin", "developer"].includes(payload.user.role)) {
      return { user: null, error: "This account does not have dashboard access" }
    }
    persist(payload)
    return { user: payload.user, error: null }
  } catch {
    return { user: null, error: "Could not reach the server" }
  }
}

export async function signOut(): Promise<void> {
  clearSession()
  await fetch(apiUrl("/api/auth/logout"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({}),
  }).catch(() => {})
}
