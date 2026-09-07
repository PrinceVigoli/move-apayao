import { eq, inArray } from "drizzle-orm";
import { db, devicePushTokensTable } from "@workspace/db";
import { logger } from "./logger";

type PushMessage = {
  title: string;
  body: string;
  data?: Record<string, string | number | boolean | null>;
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const RECEIPT_QUEUE_KEY = "move-apayao:push:receipts";
const RECEIPT_LOCK_KEY = "move-apayao:push:receipt-sweeper-lock";
const RECEIPT_DELAY_MS = 15 * 60_000;

type PendingReceipt = {
  id: string;
  token: string;
  createdAt: number;
  attempt: number;
};

async function expoRequest(url: string, body: unknown): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8_000),
      });
      if (response.status !== 429 && response.status < 500) return response;
      lastError = new Error(`Expo push service returned ${response.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
  }
  throw lastError instanceof Error ? lastError : new Error("Expo push service unavailable");
}

async function enqueueReceipts(receipts: PendingReceipt[]): Promise<void> {
  if (!process.env.REDIS_URL || receipts.length === 0) return;
  try {
    const redis = (await import("./redis")).getRedis();
    const args: Array<string | number> = [];
    for (const receipt of receipts) {
      args.push(Date.now() + RECEIPT_DELAY_MS, JSON.stringify(receipt));
    }
    await redis.zadd(RECEIPT_QUEUE_KEY, ...args);
  } catch (err) {
    logger.warn({ err, receiptCount: receipts.length }, "Could not enqueue push receipts");
  }
}

/** Best-effort notification delivery. A push outage never breaks a trip. */
export async function sendPushToUser(userId: string, message: PushMessage): Promise<void> {
  const rows = await db
    .select({ token: devicePushTokensTable.token })
    .from(devicePushTokensTable)
    .where(eq(devicePushTokensTable.userId, userId));
  if (rows.length === 0) return;

  try {
    const response = await expoRequest(
      EXPO_PUSH_URL,
      rows.map(({ token }) => ({
          to: token,
          sound: "default",
          priority: "high",
          title: message.title,
          body: message.body,
          data: message.data ?? {},
        })),
    );
    if (!response.ok) {
      logger.warn({ status: response.status }, "Push provider rejected notification batch");
      return;
    }

    const payload = (await response.json()) as {
      data?: Array<{ status?: string; id?: string; message?: string; details?: { error?: string } }>;
    };
    const deadTokens = rows
      .filter((_, index) => payload.data?.[index]?.details?.error === "DeviceNotRegistered")
      .map((row) => row.token);
    if (deadTokens.length > 0) {
      await db.delete(devicePushTokensTable).where(inArray(devicePushTokensTable.token, deadTokens));
    }
    await enqueueReceipts(
      rows.flatMap((row, index) => {
        const ticket = payload.data?.[index];
        return ticket?.status === "ok" && ticket.id
          ? [{ id: ticket.id, token: row.token, createdAt: Date.now(), attempt: 0 }]
          : [];
      }),
    );
  } catch (err) {
    logger.warn({ err, userId }, "Push delivery failed (non-fatal)");
  }
}

async function checkPendingPushReceipts(): Promise<void> {
  if (!process.env.REDIS_URL) return;
  const redis = (await import("./redis")).getRedis();
  const lock = await redis.set(RECEIPT_LOCK_KEY, String(process.pid), "EX", 55, "NX");
  if (lock !== "OK") return;

  const encoded = await redis.zrangebyscore(RECEIPT_QUEUE_KEY, 0, Date.now(), "LIMIT", 0, 1000);
  if (encoded.length === 0) return;
  const pending = encoded.flatMap((value) => {
    try {
      return [{ item: JSON.parse(value) as PendingReceipt, encoded: value }];
    } catch {
      void redis.zrem(RECEIPT_QUEUE_KEY, value);
      return [];
    }
  });
  if (pending.length === 0) return;

  const response = await expoRequest(EXPO_RECEIPTS_URL, { ids: pending.map(({ item }) => item.id) });
  if (!response.ok) {
    logger.warn({ status: response.status }, "Push receipt provider request failed");
    return;
  }
  const payload = (await response.json()) as {
    data?: Record<string, { status?: string; message?: string; details?: { error?: string } }>;
  };

  for (let index = 0; index < pending.length; index += 1) {
    const { item, encoded: encodedItem } = pending[index]!;
    const receipt = payload.data?.[item.id];
    if (!receipt) {
      await redis.zrem(RECEIPT_QUEUE_KEY, encodedItem);
      if (Date.now() - item.createdAt < 23 * 60 * 60_000 && item.attempt < 3) {
        await redis.zadd(
          RECEIPT_QUEUE_KEY,
          Date.now() + RECEIPT_DELAY_MS,
          JSON.stringify({ ...item, attempt: item.attempt + 1 }),
        );
      } else {
        logger.warn({ ticketId: item.id }, "Push receipt was unavailable before expiry");
      }
      continue;
    }

    await redis.zrem(RECEIPT_QUEUE_KEY, encodedItem);
    const error = receipt.details?.error;
    if (error === "DeviceNotRegistered") {
      await db.delete(devicePushTokensTable).where(eq(devicePushTokensTable.token, item.token));
    } else if (receipt.status === "error") {
      logger.warn({ ticketId: item.id, error, message: receipt.message }, "Push receipt reported an error");
    }
  }
}

/** Starts one Redis-coordinated receipt checker per deployment. */
export function startPushReceiptSweeper(): void {
  if (!process.env.REDIS_URL) return;
  const run = () => checkPendingPushReceipts().catch((err) => logger.warn({ err }, "Push receipt check failed"));
  const timer = setInterval(run, 60_000);
  timer.unref();
}
