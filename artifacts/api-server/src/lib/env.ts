import { z } from "zod";

const nonLocalHttpsUrl = z
  .string()
  .url()
  .refine((value) => value.startsWith("https://"), "must use HTTPS")
  .refine((value) => {
    const host = new URL(value).hostname.toLowerCase();
    return (
      host !== "localhost" &&
      host !== "127.0.0.1" &&
      !host.endsWith(".ngrok-free.app") &&
      !host.endsWith(".ngrok-free.dev")
    );
  }, "must use a permanent public hostname, not localhost or ngrok");

const productionSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535),
  DATABASE_URL: z.string().url().refine((value) => value.startsWith("postgres"), "must be PostgreSQL"),
  REDIS_URL: z.string().url().refine((value) => value.startsWith("redis"), "must be Redis"),
  JWT_SECRET: z.string().min(32),
  CORS_ALLOWED_ORIGINS: z.string().min(1).refine(
    (value) => value.split(",").every((origin) => nonLocalHttpsUrl.safeParse(origin.trim()).success),
    "must contain only permanent HTTPS origins",
  ),
  GOOGLE_MAPS_SERVER_API_KEY: z.string().min(20),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(8),
  SMTP_FROM: z.string().min(3),
  PASSWORD_RESET_URL_BASE: nonLocalHttpsUrl,
  GIS_SERVICE_URL: z.string().url(),
  GIS_SERVICE_TOKEN: z.string().min(32),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10),
  TRIP_PROXIMITY_ENFORCEMENT: z.literal("true"),
  TRIP_LOCATION_MAX_AGE_MS: z.coerce.number().int().min(30_000).max(900_000),
  TRIP_PICKUP_RADIUS_M: z.coerce.number().int().min(100).max(5_000),
  TRIP_DROPOFF_RADIUS_M: z.coerce.number().int().min(100).max(10_000),
  TRIP_MIN_DURATION_SECONDS: z.coerce.number().int().min(0).max(900),
  PILOT_BOOKING_MODE: z.literal("point_to_point"),
  REPORTING_TIME_ZONE: z.literal("Asia/Manila"),
  REPORTING_UTC_OFFSET: z.literal("+08:00"),
});

/** Fail fast before accepting traffic with an incomplete production config. */
export function validateRuntimeEnvironment(): void {
  if (process.env.NODE_ENV !== "production") return;

  const parsed = productionSchema.safeParse(process.env);
  if (parsed.success) return;

  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid production environment: ${details}`);
}
