import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Refresh tokens.
 *
 * Only a SHA-256 hash of the token is stored — a database leak must not hand
 * an attacker usable sessions. Tokens are single-use: each refresh revokes the
 * presented token and issues a new one (rotation), with `replacedBy` linking
 * the chain. If a revoked token is ever presented again it means the token was
 * stolen and replayed, so the whole chain is killed.
 */
export const refreshTokensTable = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    replacedBy: text("replaced_by"),
    // Coarse client info, useful when an operator needs to explain to a driver
    // why they were signed out.
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("refresh_tokens_user_idx").on(table.userId),
    expiresIdx: index("refresh_tokens_expires_idx").on(table.expiresAt),
  }),
);

/**
 * Password reset tokens. Hashed at rest for the same reason as refresh
 * tokens, short-lived, and single-use (`usedAt`).
 */
export const passwordResetTokensTable = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("password_reset_tokens_user_idx").on(table.userId),
  }),
);
