import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { setAuthTokenGetter } from "@workspace/api-client-react"
import {
  getAccessToken,
  hasSession,
  signIn as apiSignIn,
  signOut as apiSignOut,
  type AdminUser,
} from "./session"

interface AuthContextValue {
  user: AdminUser | null
  isAuthenticated: boolean
  isLoading: boolean
  signIn: (identifier: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Every generated API hook pulls its token from here; the getter
    // refreshes on demand so callers never handle expiry.
    setAuthTokenGetter(() => getAccessToken())

    let cancelled = false
    ;(async () => {
      if (hasSession()) {
        const token = await getAccessToken()
        if (!cancelled) setIsAuthenticated(!!token)
      }
      if (!cancelled) setIsLoading(false)
    })()

    return () => {
      cancelled = true
      setAuthTokenGetter(null)
    }
  }, [])

  async function signIn(identifier: string, password: string) {
    const { user, error } = await apiSignIn(identifier, password)
    if (user) {
      setUser(user)
      setIsAuthenticated(true)
    }
    return { error }
  }

  async function signOut() {
    await apiSignOut()
    setUser(null)
    setIsAuthenticated(false)
  }

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
