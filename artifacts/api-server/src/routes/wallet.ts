import { Router, type IRouter, type Request, type Response } from "express";
import { timingSafeEqual } from "crypto";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { fareWalletsTable, fareTransactionsTable, pendingTopUpsTable, auditLogsTable } from "@workspace/db";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { parsePagination } from "../lib/http";
import { sensitiveActionLimiter } from "../lib/rate-limit";
import { getPaymentProvider } from "../lib/payment-provider";
import { z } from "zod";

const router: IRouter = Router();

/**
 * GET /api/wallet
 */
router.get("/wallet", requireAuth, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;

  const [wallet] = await db
    .select()
    .from(fareWalletsTable)
    .where(eq(fareWalletsTable.userId, authReq.user.id));

  if (!wallet) {
    res.status(404).json({ error: "Wallet not found" });
    return;
  }

  res.json({ wallet });
});

/**
 * GET /api/wallet/transactions
 */
router.get("/wallet/transactions", requireAuth, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const { limit, offset } = parsePagination(req.query);

  const transactions = await db
    .select()
    .from(fareTransactionsTable)
    .where(eq(fareTransactionsTable.userId, authReq.user.id))
    .orderBy(desc(fareTransactionsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({ transactions, limit, offset });
});

/**
 * POST /api/wallet/topup  (admin only)
 *
 * Directly credits a wallet with no external payment step. This is kept for
 * trusted-operator scenarios only (cash handed over at a staffed kiosk,
 * manual goodwill credit/refund) — it is intentionally NOT reachable by a
 * passenger for their own account. Self-service top-ups go through
 * /wallet/topup/intent + /wallet/topup/webhook below, which require an
 * actual payment-provider confirmation before the ledger is touched.
 */
const AdminTopUpBody = z.object({
  userId: z.string().uuid(),
  amount: z.number().positive(),
  referenceId: z.string().optional(),
});

router.post(
  "/wallet/topup",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const parsed = AdminTopUpBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const tx = await db.transaction(async (trx) => {
      const [wallet] = await trx
        .select()
        .from(fareWalletsTable)
        .where(eq(fareWalletsTable.userId, parsed.data.userId))
        .for("update");

      if (!wallet) throw Object.assign(new Error("Wallet not found"), { status: 404 });

      const balanceBefore = wallet.balance;
      const balanceAfter = balanceBefore + parsed.data.amount;

      await trx
        .update(fareWalletsTable)
        .set({ balance: balanceAfter, updatedAt: new Date() })
        .where(eq(fareWalletsTable.id, wallet.id));

      const [txRecord] = await trx
        .insert(fareTransactionsTable)
        .values({
          walletId: wallet.id,
          userId: parsed.data.userId,
          amount: parsed.data.amount,
          type: "top_up",
          description: "Manual admin top-up",
          referenceId: parsed.data.referenceId,
          balanceBefore,
          balanceAfter,
        })
        .returning();

      await trx.insert(auditLogsTable).values({
        actorUserId: authReq.user.id,
        action: "wallet.topup",
        targetUserId: parsed.data.userId,
        amount: parsed.data.amount,
        metadata: { referenceId: parsed.data.referenceId ?? null, transactionId: txRecord.id },
      });

      return { transaction: txRecord, newBalance: balanceAfter };
    });

    res.status(201).json(tx);
  },
);

/**
 * POST /api/wallet/topup/intent
 *
 * Passenger-callable. Creates a pending top-up and a checkout session with
 * the payment provider. The wallet is NOT credited here — only once the
 * provider confirms payment via the webhook below.
 */
const TopUpIntentBody = z.object({ amount: z.number().positive().max(50_000) });

router.post("/wallet/topup/intent", requireAuth, sensitiveActionLimiter, async (req, res): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  const parsed = TopUpIntentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const referenceId = `topup_${authReq.user.id}_${Date.now()}`;

  try {
    const checkout = await getPaymentProvider().createCheckout({
      amount: parsed.data.amount,
      referenceId,
    });

    await db.insert(pendingTopUpsTable).values({
      userId: authReq.user.id,
      amount: parsed.data.amount,
      providerRef: checkout.id,
      status: "pending",
    });

    res.status(201).json({ checkoutUrl: checkout.url });
  } catch (err) {
    logger.error({ err }, "Failed to create top-up checkout session");
    res.status(502).json({ error: "Payment provider unavailable" });
  }
});

/**
 * POST /api/wallet/topup/webhook
 *
 * Called by the payment provider, never by a client directly. Verifies the
 * provider's signature, then credits the wallet inside a transaction that
 * also flips the pending top-up to "completed" — re-deliveries of the same
 * event are a no-op because the pending row is only ever claimed once
 * (`status = 'pending'` in the WHERE clause, same atomic-claim pattern used
 * for trip state transitions).
 */
router.post(
  "/wallet/topup/webhook",
  async (req: Request, res: Response): Promise<void> => {
    const signature = req.headers["x-provider-signature"] as string | undefined;
    const provider = getPaymentProvider();
    const rawBody = req.body as Buffer; // requires express.raw() on this route in app wiring

    if (!provider.verifySignature(rawBody, signature)) {
      res.status(401).end();
      return;
    }

    let event;
    try {
      event = provider.parseEvent(rawBody);
    } catch (err) {
      logger.error({ err }, "Failed to parse payment webhook event");
      res.status(400).end();
      return;
    }

    if (event.type !== "payment.succeeded") {
      res.status(200).end();
      return;
    }

    try {
      await db.transaction(async (trx) => {
        const [pending] = await trx
          .update(pendingTopUpsTable)
          .set({ status: "completed", updatedAt: new Date() })
          .where(
            and(
              eq(pendingTopUpsTable.providerRef, event.referenceId),
              eq(pendingTopUpsTable.status, "pending"),
            ),
          )
          .returning();

        if (!pending) return; // already processed or unknown ref — idempotent no-op

        const [wallet] = await trx
          .select()
          .from(fareWalletsTable)
          .where(eq(fareWalletsTable.userId, pending.userId))
          .for("update");

        if (!wallet) {
          logger.error({ pendingId: pending.id }, "Top-up completed for a user with no wallet");
          return;
        }

        const balanceBefore = wallet.balance;
        const balanceAfter = balanceBefore + pending.amount;

        await trx
          .update(fareWalletsTable)
          .set({ balance: balanceAfter, updatedAt: new Date() })
          .where(eq(fareWalletsTable.id, wallet.id));

        await trx.insert(fareTransactionsTable).values({
          walletId: wallet.id,
          userId: pending.userId,
          amount: pending.amount,
          type: "top_up",
          description: "Wallet top-up",
          referenceId: event.referenceId,
          idempotencyKey: `topup_${event.referenceId}`,
          balanceBefore,
          balanceAfter,
        });
      });

      res.status(200).end();
    } catch (err) {
      logger.error({ err }, "Failed to process top-up webhook");
      res.status(500).end();
    }
  },
);

/**
 * POST /api/wallet/tap
 * NFC/QR card tap — swappable interface for the physical DOST hardware device.
 */
const READER_API_KEY = process.env.READER_API_KEY;

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws if lengths differ, so check that first — the
  // length check itself leaks length, which is fine for API keys of a
  // known fixed format.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

const TapBody = z.object({
  cardId: z.string().uuid(),
  amount: z.number().positive(),
  tripId: z.number().int().optional(),
  // Required dedup key so a hardware reader's network retry after an
  // ambiguous response can't double-deduct the same tap.
  idempotencyKey: z.string().min(1).max(200),
});

router.post("/wallet/tap", sensitiveActionLimiter, async (req, res): Promise<void> => {
  const readerKeyHeader = req.headers["x-reader-api-key"];
  const readerKey = Array.isArray(readerKeyHeader) ? readerKeyHeader[0] : readerKeyHeader;
  const bearerToken = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;

  const isReaderAuthed = !!READER_API_KEY && !!readerKey && safeEqual(readerKey, READER_API_KEY);

  const parsed = TapBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!isReaderAuthed) {
    if (!bearerToken) {
      res.status(401).json({ error: "Unauthorized: provide X-Reader-Api-Key or Bearer token" });
      return;
    }
    const { verifyJwt } = await import("../lib/supabase.js");
    try {
      const user = await verifyJwt(bearerToken);
      if (user.id !== parsed.data.cardId) {
        res.status(403).json({ error: "Forbidden: card does not belong to authenticated user" });
        return;
      }
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  const userId = parsed.data.cardId;

  try {
    const result = await db.transaction(async (trx) => {
      const [wallet] = await trx
        .select()
        .from(fareWalletsTable)
        .where(eq(fareWalletsTable.userId, userId))
        .for("update");

      if (!wallet) throw Object.assign(new Error("Card/wallet not found"), { status: 404 });

      if (wallet.balance < parsed.data.amount) {
        throw Object.assign(
          new Error(`Insufficient balance: ${wallet.balance}`),
          { status: 402, balance: wallet.balance },
        );
      }

      const balanceBefore = wallet.balance;
      const balanceAfter = balanceBefore - parsed.data.amount;

      await trx
        .update(fareWalletsTable)
        .set({ balance: balanceAfter, updatedAt: new Date() })
        .where(eq(fareWalletsTable.id, wallet.id));

      const [txRecord] = await trx
        .insert(fareTransactionsTable)
        .values({
          walletId: wallet.id,
          userId,
          amount: -parsed.data.amount,
          type: "deduct",
          description: parsed.data.tripId ? `Trip #${parsed.data.tripId} tap` : "NFC/QR tap deduction",
          referenceId: parsed.data.tripId ? String(parsed.data.tripId) : undefined,
          idempotencyKey: `tap_${parsed.data.idempotencyKey}`,
          balanceBefore,
          balanceAfter,
        })
        .returning();

      return { ok: true, newBalance: balanceAfter, transactionId: txRecord.id };
    });

    res.json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; balance?: number; message?: string; code?: string };
    if (e.status === 404) {
      res.status(404).json({ error: e.message });
      return;
    }
    if (e.status === 402) {
      res.status(402).json({ error: "Insufficient balance", balance: e.balance });
      return;
    }
    // Unique-violation on the idempotency key means this exact tap was
    // already processed — treat the retry as a success, not an error.
    if (e.code === "23505") {
      logger.info({ userId }, "Duplicate tap ignored (idempotency key already used)");
      res.status(200).json({ ok: true, duplicate: true });
      return;
    }
    logger.error({ err }, "Tap transaction failed");
    res.status(500).json({ error: "Transaction failed" });
  }
});

/**
 * GET /api/wallet/admin/users  (admin only)
 */
router.get(
  "/wallet/admin/users",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const { limit, offset } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 100 });

    const wallets = await db
      .select()
      .from(fareWalletsTable)
      .limit(limit)
      .offset(offset)
      .orderBy(fareWalletsTable.updatedAt);

    res.json({ wallets, limit, offset });
  },
);

export default router;