import {
  boolean,
  check,
  doublePrecision,
  index,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";

/** Versioned point-to-point pricing. Existing trips retain their quoted fare. */
export const farePoliciesTable = pgTable(
  "fare_policies",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull().default("Point-to-point fare"),
    baseFare: doublePrecision("base_fare").notNull(),
    perKmFare: doublePrecision("per_km_fare").notNull(),
    minimumFare: doublePrecision("minimum_fare").notNull(),
    extraPassengerFare: doublePrecision("extra_passenger_fare").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    activeUniqueIdx: uniqueIndex("fare_policies_one_active_idx")
      .on(table.isActive)
      .where(sql`${table.isActive} = true`),
    createdIdx: index("fare_policies_created_at_idx").on(table.createdAt),
    nonnegativeCheck: check(
      "fare_policies_nonnegative_check",
      sql`${table.baseFare} >= 0 and ${table.perKmFare} >= 0 and ${table.minimumFare} >= 0 and ${table.extraPassengerFare} >= 0`,
    ),
  }),
);

export type FarePolicy = typeof farePoliciesTable.$inferSelect;
