import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Without this, a missing/unreachable DATABASE_URL causes any query to
  // hang indefinitely instead of failing fast (pg has no default timeout).
  connectionTimeoutMillis: 5000,
  // Explicit pool size: size this to (db max_connections / number of app
  // instances), not the pg default of 10 guessed per-process. Tune via env
  // so ops can raise it without a code change as instance count grows.
  max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
  // Kill any query that runs longer than this instead of letting a missing
  // index or a bad query hold a pool connection (and, transitively, every
  // other request waiting for one) indefinitely.
  statement_timeout: Number(process.env.DATABASE_STATEMENT_TIMEOUT_MS ?? 10_000),
});

pool.on("error", (err) => {
  // Idle clients can emit background errors (e.g. connection reset by the
  // database) outside of any query — without this handler those become
  // unhandled 'error' events and crash the process.
  // eslint-disable-next-line no-console
  console.error("Unexpected Postgres pool error", err);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
