import { createClient } from "@supabase/supabase-js";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { logger } from "./logger";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let _client: ReturnType<typeof createClient> | null = null;

/**
 * Admin client — still needed for anything that actually talks to Supabase
 * (e.g. user management from the dashboard). NOT used for per-request JWT
 * verification anymore; see verifyJwt below.
 */
export function getSupabaseAdmin() {
  if (!_client) {
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
    }
    _client = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return _client;
}

export interface SupabaseUser {
  id: string;
  email: string;
}

// `createRemoteJWKSet` caches the fetched signing keys in-process and only
// refetches when it sees a `kid` it doesn't recognize (e.g. after Supabase
// rotates keys) — so after the first verification, this adds ZERO network
// calls per request. This is what actually removes Supabase Auth from the
// hot path of every single authenticated API call.
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!_jwks) {
    if (!supabaseUrl) {
      throw new Error("SUPABASE_URL must be set");
    }
    _jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
  }
  return _jwks;
}

/**
 * Verify a Supabase-issued JWT locally (no network round trip to Supabase
 * on the hot path) and return the user payload.
 *
 * Throws if the token is invalid, expired, or Supabase is not configured.
 */
export async function verifyJwt(token: string): Promise<SupabaseUser> {
  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL must be set");
  }

  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: `${supabaseUrl}/auth/v1`,
    });

    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      throw new Error("Token payload missing sub/email");
    }

    return { id: payload.sub, email: payload.email };
  } catch (error) {
    logger.warn({ error }, "Invalid Supabase JWT");
    throw new Error("Unauthorized");
  }
}
