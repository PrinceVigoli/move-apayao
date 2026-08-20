import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import {
  getAccessToken,
  loadStoredSession,
  onSessionChange,
  hasSession,
  signIn as apiSignIn,
  signUp as apiSignUp,
  signOut as apiSignOut,
  requestPasswordReset,
  type AuthUser,
  type SignUpDetails,
} from "@/lib/session";

/**
 * Authentication for the PASSENGER app.
 *
 * Accounts are held in this project's own Postgres and authenticated by the
 * API server — there is no third-party auth provider. Every account created
 * here registers with the "passenger" role; drivers use the separate driver
 * app.
 */

type PassengerSignUp = Omit<SignUpDetails, "role">;

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signInWithPassword: (identifier: string, password: string) => Promise<void>;
  signUpWithPassword: (details: PassengerSignUp) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<string>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authed, setAuthed] = useState(false);

  // Bridge the generated API client to our token store. Called once; the
  // getter refreshes on demand, so hooks never deal with expiry themselves.
  useEffect(() => {
    setAuthTokenGetter(() => getAccessToken());
    return () => setAuthTokenGetter(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadStoredSession();
      if (cancelled) return;
      if (stored) {
        // Validate by actually obtaining a token; an expired or revoked
        // refresh token resolves to null and we treat that as signed out.
        const token = await getAccessToken();
        if (!cancelled) setAuthed(!!token);
      }
      if (!cancelled) setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => onSessionChange(() => setAuthed(hasSession())), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: authed,
      async signInWithPassword(identifier, password) {
        const u = await apiSignIn(identifier, password);
        if (u.role !== "passenger") {
          await apiSignOut();
          throw new Error("Please use the app assigned to this account.");
        }
        setUser(u);
        setAuthed(true);
      },
      async signUpWithPassword(details) {
        const u = await apiSignUp({ ...details, role: "passenger" });
        setUser(u);
        setAuthed(true);
      },
      sendPasswordReset: requestPasswordReset,
      async signOut() {
        await apiSignOut();
        setUser(null);
        setAuthed(false);
      },
    }),
    [user, isLoading, authed],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
