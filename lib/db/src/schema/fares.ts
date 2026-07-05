import {
  pgTable,
  serial,
  text,
  uuid,
  doublePrecision,
  timestamp,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const fareWalletsTable = pgTable("fare_wallets", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id),
  balance: doublePrecision("balance").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fareTransactionsTable = pgTable(
  "fare_transactions",
  {
    id: serial("id").primaryKey(),
    walletId: integer("wallet_id")
      .notNull()
      .references(() => fareWalletsTable.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id),
    amount: doublePrecision("amount").notNull(), // positive = credit, negative = debit
    // top_up | deduct | refund | adjustment
    type: text("type").notNull(),
    description: text("description"),
    referenceId: text("reference_id"), // trip_id, external top-up ref, etc.
    // Caller-supplied dedup key (e.g. reader-generated UUID for a single physical
    // tap, or a payment provider event id). NULL is allowed for legacy/admin
    // writes, but any write that passes one gets deduped by the unique index
    // below — a retried tap/webhook can never be applied twice.
    idempotencyKey: text("idempotency_key"),
    balanceBefore: doublePrecision("balance_before").notNull(),
    balanceAfter: doublePrecision("balance_after").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("fare_transactions_user_id_idx").on(table.userId),
    userCreatedIdx: index("fare_transactions_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    walletIdx: index("fare_transactions_wallet_id_idx").on(table.walletId),
    // Partial-style dedup: only enforced when an idempotency key is actually
    // provided. Postgres unique indexes already treat NULL as "no conflict",
    // so multiple NULL rows (legacy/admin writes) remain unaffected.
    idempotencyUnique: uniqueIndex("fare_transactions_idempotency_key_unique").on(
      table.idempotencyKey,
    ),
  }),
);

// Pending top-up intents created by a passenger, resolved by a verified
// payment-provider webhook. The wallet ledger (fareTransactionsTable) is
// only ever credited from the webhook handler — never directly from a
// passenger-initiated request. See routes/wallet.ts.
export const pendingTopUpsTable = pgTable(
  "pending_top_ups",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id),
    amount: doublePrecision("amount").notNull(),
    // pending | completed | failed | expired
    status: text("status").notNull().default("pending"),
    providerRef: text("provider_ref").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("pending_top_ups_user_id_idx").on(table.userId),
    providerRefUnique: uniqueIndex("pending_top_ups_provider_ref_unique").on(
      table.providerRef,
    ),
  }),
);

export const insertFareWalletSchema = createInsertSchema(fareWalletsTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertFareWallet = z.infer<typeof insertFareWalletSchema>;
export type FareWallet = typeof fareWalletsTable.$inferSelect;

export const insertFareTransactionSchema = createInsertSchema(fareTransactionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertFareTransaction = z.infer<typeof insertFareTransactionSchema>;
export type FareTransaction = typeof fareTransactionsTable.$inferSelect;

export const insertPendingTopUpSchema = createInsertSchema(pendingTopUpsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPendingTopUp = z.infer<typeof insertPendingTopUpSchema>;
export type PendingTopUp = typeof pendingTopUpsTable.$inferSelect;
