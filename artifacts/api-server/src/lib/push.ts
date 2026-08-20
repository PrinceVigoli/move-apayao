import { eq, inArray } from "drizzle-orm";
import { db, devicePushTokensTable } from "@workspace/db";
import { logger } from "./logger";

type PushMessage = {
  title: string;
  body: string;
  data?: Record<string, string | number | boolean | null>;
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** Best-effort notification delivery. A push outage never breaks a trip. */
export async function sendPushToUser(userId: string, message: PushMessage): Promise<void> {
  const rows = await db
    .select({ token: devicePushTokensTable.token })
    .from(devicePushTokensTable)
    .where(eq(devicePushTokensTable.userId, userId));
  if (rows.length === 0) return;

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(
        rows.map(({ token }) => ({
          to: token,
          sound: "default",
          priority: "high",
          title: message.title,
          body: message.body,
          data: message.data ?? {},
        })),
      ),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      logger.warn({ status: response.status }, "Push provider rejected notification batch");
      return;
    }

    const payload = (await response.json()) as {
      data?: Array<{ status?: string; details?: { error?: string } }>;
    };
    const deadTokens = rows
      .filter((_, index) => payload.data?.[index]?.details?.error === "DeviceNotRegistered")
      .map((row) => row.token);
    if (deadTokens.length > 0) {
      await db.delete(devicePushTokensTable).where(inArray(devicePushTokensTable.token, deadTokens));
    }
  } catch (err) {
    logger.warn({ err, userId }, "Push delivery failed (non-fatal)");
  }
}
