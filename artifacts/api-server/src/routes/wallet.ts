import { Router, type IRouter } from "express";
import { timingSafeEqual } from "crypto";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { fareWalletsTable, fareTransactionsTable } from "@workspace/db";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { parsePagination } from "../lib/http";
import { sensitiveActionLimiter } from "../lib/rate-limit";
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
 * POST /api/wallet/tap
 * NFC/QR card tap — swappable interface for the physical DOST hardware device.
 *
 * POST-PROCUREMENT: enable once NFC/QR readers are purchased.
 *
 * Fares are collected in CASH today, so this route is gated off by default.
 * The implementation below is complete and correct — reader auth, idempotent
 * deduction, ledger writes — it simply short-circuits with 503 until
 * FEATURE_QR_FARE_COLLECTION=true is set. That keeps the code exercised by
 * typecheck and ready to switch on without a rewrite, rather than rotting in
 * a branch.
 */
const READER_API_KEY = process.env.READER_API_KEY;
const QR_FARE_COLLECTION_ENABLED = process.env.FEATURE_QR_FARE_COLLECTION === "true";

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
  if (!QR_FARE_COLLECTION_ENABLED) {
    res.status(503).json({
      error: "Not yet available",
      detail:
        "QR/NFC fare collection is pending reader hardware procurement. Fares are collected in cash at drop-off.",
    });
    return;
  }

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