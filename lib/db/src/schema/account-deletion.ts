import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const accountDeletionRequestsTable = pgTable("account_deletion_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique().references(() => usersTable.id),
  status: text("status").notNull().default("pending"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  reviewedBy: uuid("reviewed_by").references(() => usersTable.id),
  retentionReason: text("retention_reason"),
  retentionUntil: timestamp("retention_until", { withTimezone: true }),
}, table => [
  index("account_deletion_status_idx").on(table.status, table.requestedAt),
  check("account_deletion_status_check", sql`${table.status} in ('pending','reviewing','completed')`),
  check("account_deletion_completion_check", sql`(${table.status} = 'completed') = (${table.completedAt} is not null)`),
  check("account_deletion_retention_check", sql`(${table.retentionReason} is null) = (${table.retentionUntil} is null)`),
]);
