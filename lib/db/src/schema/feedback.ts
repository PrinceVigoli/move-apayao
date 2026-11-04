import { sql } from "drizzle-orm";
import { check, index, pgTable, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const appFeedbackTable = pgTable("app_feedback", {
  id: serial("id").primaryKey(),
  reporterId: uuid("reporter_id").notNull().references(() => usersTable.id),
  category: text("category").notNull(),
  message: text("message").notNull(),
  appVersion: text("app_version"),
  platform: text("platform"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("app_feedback_created_at_idx").on(table.createdAt),
  index("app_feedback_status_created_at_idx").on(table.status, table.createdAt),
  index("app_feedback_reporter_id_idx").on(table.reporterId),
  check("app_feedback_category_check", sql`${table.category} in ('bug', 'suggestion', 'other')`),
  check("app_feedback_status_check", sql`${table.status} in ('open', 'reviewing', 'resolved')`),
  check("app_feedback_message_length_check", sql`char_length(trim(${table.message})) between 10 and 2000`),
]);
