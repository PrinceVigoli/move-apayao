import { pgTable, text, uuid, timestamp, boolean, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable(
  "users",
  {
    // Self-generated. Previously mirrored Supabase's auth.users.id; auth is
    // now handled entirely by this API against our own Postgres.
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    // Users can sign in with EITHER email or phone, so phone is unique too
    // when present. Nullable because email remains the required identifier.
    phone: text("phone").unique(),
    // scrypt hash — see api-server/src/lib/password.ts for the format.
    // Nullable so an admin can pre-create an account that has no password yet.
    passwordHash: text("password_hash"),
    fullName: text("full_name"),
    role: text("role").notNull().default("passenger"),
    avatarUrl: text("avatar_url"),
    isActive: boolean("is_active").notNull().default(true),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    termsVersion: text("terms_version"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    phoneIdx: index("users_phone_idx").on(table.phone),
    roleCheck: check(
      "users_role_check",
      sql`${table.role} in ('passenger', 'driver_applicant', 'driver', 'admin', 'superadmin', 'developer')`,
    ),
  }),
);

export const insertUserSchema = createInsertSchema(usersTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
