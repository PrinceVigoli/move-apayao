import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "../lib/logger";
import { getRedis } from "../lib/redis";

const router: IRouter = Router();

router.get("/healthz", async (_req, res): Promise<void> => {
  const dependencies: Record<string, string> = {
    database: "unavailable",
    redis: process.env.REDIS_URL ? "unavailable" : "not_configured",
    gis: process.env.GIS_SERVICE_URL ? "unavailable" : "not_configured",
    googleRoutes: process.env.GOOGLE_MAPS_SERVER_API_KEY || process.env.GOOGLE_PLACES_API_KEY
      ? "configured"
      : "not_configured",
  };

  await Promise.all([
    db.execute(sql`SELECT 1`)
      .then(() => { dependencies.database = "ok"; })
      .catch((err) => logger.error({ err }, "Health check failed: database unreachable")),
    process.env.REDIS_URL
      ? getRedis().ping()
          .then((reply) => { dependencies.redis = reply === "PONG" ? "ok" : "unavailable"; })
          .catch((err) => logger.error({ err }, "Health check failed: Redis unreachable"))
      : Promise.resolve(),
    process.env.GIS_SERVICE_URL
      ? fetch(new URL("/healthz", process.env.GIS_SERVICE_URL), {
          signal: AbortSignal.timeout(2_000),
        })
          .then((response) => { dependencies.gis = response.ok ? "ok" : "unavailable"; })
          .catch((err) => logger.error({ err }, "Health check failed: GIS unreachable"))
      : Promise.resolve(),
  ]);

  const coreHealthy =
    dependencies.database === "ok" &&
    dependencies.redis === "ok" &&
    dependencies.googleRoutes === "configured";
  const configuredGisHealthy = dependencies.gis === "not_configured" || dependencies.gis === "ok";
  const status = coreHealthy && configuredGisHealthy ? "ok" : "degraded";
  res.status(status === "ok" ? 200 : 503).json({ status, dependencies });
});

// Process liveness is intentionally independent of external dependencies.
router.get("/livez", (_req, res) => res.json({ status: "ok" }));

export default router;
