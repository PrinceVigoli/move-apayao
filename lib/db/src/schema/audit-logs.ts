import { pgTable, serial, text, uuid, doublePrecision, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

/**
 * Tracks sensitive/financial admin actions (wallet top-ups, refunds) for
 * accountability. Every write here should happen inside the same DB
 * transaction as the action it's recording, so the two can never drift.
 */
export const auditLogsTable = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => usersTable.id),
    action: text("action").notNull(), // e.g. "wallet.topup"
    targetUserId: uuid("target_user_id").references(() => usersTable.id),
    amount: doublePrecision("amount"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    actorIdx: index("audit_logs_actor_user_id_idx").on(table.actorUserId),
    targetIdx: index("audit_logs_target_user_id_idx").on(table.targetUserId),
    createdIdx: index("audit_logs_created_at_idx").on(table.createdAt),
  }),
);

export const insertAuditLogSchema = createInsertSchema(auditLogsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogsTable.$inferSelect;