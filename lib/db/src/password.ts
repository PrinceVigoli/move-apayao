import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Password hashing.
 *
 * Uses scrypt from Node's standard library rather than argon2 or bcrypt.
 * Reasoning:
 *
 *  - scrypt is memory-hard and listed by OWASP as an acceptable password
 *    hashing choice (their second recommendation after argon2id).
 *  - It ships with Node, so there is NO native module to compile. argon2 and
 *    bcrypt are native addons that routinely break across Windows dev
 *    machines, Alpine Docker images and CI — this project runs on all three.
 *    A dependency that fails to build is a dependency that gets replaced with
 *    something worse under deadline pressure.
 *  - Parameters below follow OWASP's recommended minimum (N=2^17, r=8, p=1).
 *
 * Stored format:  scrypt$N$r$p$<salt-b64>$<hash-b64>
 * The parameters travel with the hash, so they can be raised later without
 * invalidating existing passwords — verify reads whatever each row was
 * hashed with.
 */

const N = 1 << 17; // CPU/memory cost
const R = 8; // block size
const P = 1; // parallelisation
const KEYLEN = 32;
const SALT_BYTES = 16;
// scrypt needs roughly 128 * N * r bytes; give it headroom or Node throws.
const MAXMEM = 256 * N * R;

// A recommended scrypt operation uses roughly 128 MiB. Bounding concurrent
// operations prevents simultaneous logins from exhausting a modest pilot VPS.
const configuredConcurrency = Number(process.env.PASSWORD_HASH_CONCURRENCY ?? 2);
const MAX_CONCURRENT_SCRYPT = Number.isInteger(configuredConcurrency)
  ? Math.min(8, Math.max(1, configuredConcurrency))
  : 2;
let activeScrypt = 0;
const scryptWaiters: Array<() => void> = [];

async function withScryptSlot<T>(work: () => Promise<T>): Promise<T> {
  if (activeScrypt >= MAX_CONCURRENT_SCRYPT) {
    await new Promise<void>((resolve) => scryptWaiters.push(resolve));
  }
  activeScrypt += 1;
  try {
    return await work();
  } finally {
    activeScrypt -= 1;
    scryptWaiters.shift()?.();
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await withScryptSlot(() =>
    scrypt(password.normalize("NFKC"), salt, KEYLEN, {
      N,
      r: R,
      p: P,
      maxmem: MAXMEM,
    }),
  );
  return [
    "scrypt",
    N,
    R,
    P,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/**
 * Verifies a password against a stored hash. Always compares in constant time
 * so a caller cannot learn anything from how long a rejection takes.
 * Returns false rather than throwing on a malformed hash.
 */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  const parts = stored?.split("$") ?? [];
  const candidateN = Number(parts[1]);
  const candidateR = Number(parts[2]);
  const candidateP = Number(parts[3]);
  const candidateSalt = Buffer.from(parts[4] ?? "", "base64");
  const candidateExpected = Buffer.from(parts[5] ?? "", "base64");
  const validFormat =
    parts.length === 6 &&
    parts[0] === "scrypt" &&
    Number.isInteger(candidateN) &&
    candidateN >= 1 << 14 &&
    candidateN <= 1 << 20 &&
    (candidateN & (candidateN - 1)) === 0 &&
    Number.isInteger(candidateR) &&
    candidateR >= 1 &&
    candidateR <= 32 &&
    Number.isInteger(candidateP) &&
    candidateP >= 1 &&
    candidateP <= 16 &&
    candidateSalt.length >= 8 &&
    candidateSalt.length <= 64 &&
    candidateExpected.length >= 16 &&
    candidateExpected.length <= 64;

  // Missing/malformed hashes deliberately use the production cost so login
  // timing does not reveal whether an account exists.
  const n = validFormat ? candidateN : N;
  const r = validFormat ? candidateR : R;
  const p = validFormat ? candidateP : P;
  const salt = validFormat ? candidateSalt : Buffer.alloc(SALT_BYTES);
  const expected = validFormat ? candidateExpected : Buffer.alloc(KEYLEN);

  try {
    const derived = await withScryptSlot(() =>
      scrypt(password.normalize("NFKC"), salt, expected.length, {
        N: n,
        r,
        p,
        maxmem: 256 * n * r,
      }),
    );
    if (derived.length !== expected.length) return false;
    return validFormat && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * True when a stored hash used weaker parameters than we now require, so the
 * caller can transparently re-hash on next successful login.
 */
export function needsRehash(stored: string | null | undefined): boolean {
  if (!stored) return true;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return true;
  return Number(parts[1]) < N || Number(parts[2]) < R;
}
