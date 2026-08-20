import {
  pgTable,
  serial,
  text,
  uuid,
  timestamp,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const subscriptionsTable = pgTable(
  "subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id),
    plan: text("plan").notNull().default("annual"),
    status: text("status").notNull().default("active"), // active | expired | cancelled
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("subscriptions_user_id_idx").on(table.userId),
    userCreatedIdx: index("subscriptions_user_created_idx").on(table.userId, table.createdAt),
    statusIdx: index("subscriptions_status_idx").on(table.status),
    oneActivePerUserIdx: uniqueIndex("subscriptions_one_active_per_user_idx")
      .on(table.userId)
      .where(sql`${table.status} = 'active'`),
    statusCheck: check(
      "subscriptions_status_check",
      sql`${table.status} in ('active', 'expired', 'cancelled')`,
    ),
    planCheck: check(
      "subscriptions_plan_check",
      sql`${table.plan} in ('annual', 'basic_weekly', 'premium_monthly', 'premium_yearly')`,
    ),
    dateOrderCheck: check(
      "subscriptions_date_order_check",
      sql`${table.expiresAt} > ${table.startsAt}`,
    ),
  }),
);

export const insertSubscriptionSchema = createInsertSchema(subscriptionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptionsTable.$inferSelect;
