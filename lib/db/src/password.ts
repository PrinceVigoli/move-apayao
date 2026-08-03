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

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEYLEN, {
    N,
    r: R,
    p: P,
    maxmem: MAXMEM,
  });
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
  if (!stored) return false;

  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  let expected: Buffer;
  try {
    expected = Buffer.from(hashB64!, "base64");
  } catch {
    return false;
  }

  try {
    const derived = await scrypt(
      password.normalize("NFKC"),
      Buffer.from(saltB64!, "base64"),
      expected.length,
      { N: n, r, p, maxmem: 256 * n * r },
    );
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
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
