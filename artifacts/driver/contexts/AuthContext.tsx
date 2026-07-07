import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { setAuthTokenGetter, registerUser } from '@workspace/api-client-react';

WebBrowser.maybeCompleteAuthSession();

// This is the DRIVER app. Every account created here is registered with the
// "driver" role, along with the vehicle details the driver enters at signup.
interface SignUpDetails {
  fullName: string;
  phone?: string;
  vehicleType?: string;
  licenseNumber?: string;
  plateNumber?: string;
  vehicleColor?: string;
}

interface AuthContextValue {
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string, details: SignUpDetails) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Where Google (or any OAuth provider) sends the browser back to after the
// user approves the sign-in. This must also be added to the Redirect URLs
// allow-list in Supabase → Authentication → URL Configuration.
const redirectTo = Linking.createURL('auth/callback');

/**
 * After a brand-new Supabase user signs up (email/password OR their first
 * Google sign-in), our own `users` table doesn't have a row for them yet.
 * We call POST /api/auth/register once to create it — the API treats a
 * 409 ("already registered") as a no-op, so this is safe to call on every
 * fresh sign-in too.
 */
async function ensureProfile(details: SignUpDetails) {
  try {
    await registerUser({
      fullName: details.fullName,
      phone: details.phone,
      role: 'driver',
      vehicleType: details.vehicleType,
      licenseNumber: details.licenseNumber,
      plateNumber: details.plateNumber,
      vehicleColor: details.vehicleColor,
    });
  } catch (err: any) {
    // 409 just means the profile already exists — not an error for us.
    if (err?.status !== 409) throw err;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  // Feed the current access token into the API client so every request
  // to our own backend (api-server) is authenticated automatically.
  useEffect(() => {
    setAuthTokenGetter(async () => {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    });
    return () => setAuthTokenGetter(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isLoading,
      isAuthenticated: !!session,

      async signInWithPassword(email: string, password: string) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },

      async signUpWithPassword(email: string, password: string, details: SignUpDetails) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;

        // Supabase may require email confirmation before a session exists.
        // If so, there's no access token yet — /api/auth/register runs on
        // first sign-in instead (see AuthProvider's onAuthStateChange path
        // in login/signup screens after a confirmed sign-in).
        if (data.session) {
          await ensureProfile(details);
        }
      },

      async signInWithGoogle() {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
            skipBrowserRedirect: true, // we open the browser ourselves below
          },
        });
        if (error) throw error;
        if (!data?.url) throw new Error('No OAuth URL returned from Supabase');

        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type !== 'success' || !result.url) {
          // User cancelled — not an error, just don't proceed.
          return;
        }

        const url = new URL(result.url);
        const code = url.searchParams.get('code');
        if (!code) throw new Error('No authorization code in OAuth redirect');

        const { data: sessionData, error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;

        // First-time Google sign-in: create the app-side profile too.
        const fullName =
          sessionData.session?.user.user_metadata?.full_name ??
          sessionData.session?.user.user_metadata?.name ??
          sessionData.session?.user.email?.split('@')[0] ??
          'Rider';
        await ensureProfile({ fullName });
      },

      async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
    }),
    [session, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
