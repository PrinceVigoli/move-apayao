import { pgTable, serial, text, uuid, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Expo/FCM device destinations. Tokens are user-scoped and can be replaced
 * when an OS rotates them. A failed/expired token is removed by the push
 * sender so the table does not accumulate dead devices.
 */
export const devicePushTokensTable = pgTable(
  "device_push_tokens",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    platform: text("platform").notNull(),
    app: text("app").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenUnique: uniqueIndex("device_push_tokens_token_unique_idx").on(table.token),
    userIdx: index("device_push_tokens_user_idx").on(table.userId),
  }),
);

export type DevicePushToken = typeof devicePushTokensTable.$inferSelect;
