import { Router, type IRouter, type Response } from "express";
import { z } from "zod";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const RecentTracksQuery = z.object({
  hours: z.coerce.number().int().min(1).max(168).default(24),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const GenerateCandidatesBody = z.object({
  days: z.coerce.number().int().min(7).max(90).default(30),
});
const ReviewCandidateBody = z.object({
  status: z.enum(["reviewing", "approved", "rejected"]),
  reason: z.string().trim().min(5).max(500),
});

async function forwardToGis(
  req: AuthenticatedRequest,
  res: Response,
  path: string,
  init?: RequestInit,
): Promise<void> {
  const isProduction = process.env.NODE_ENV === "production";
  const serviceUrl = process.env.GIS_SERVICE_URL ?? (!isProduction ? "http://127.0.0.1:5100" : undefined);
  const serviceToken =
    process.env.GIS_SERVICE_TOKEN ?? (!isProduction ? process.env.JWT_SECRET : undefined);
  if (!serviceUrl || !serviceToken) {
    res.status(503).json({ error: "GIS Intelligence service is not configured" });
    return;
  }

  try {
    const response = await fetch(new URL(path, serviceUrl), {
      ...init,
      headers: {
        ...init?.headers,
        "x-gis-service-token": serviceToken,
        "x-gis-actor-id": req.user.id,
      },
      signal: AbortSignal.timeout(8_000),
    });
    const payload = await response.json().catch(() => ({ error: "Invalid GIS response" }));
    res.status(response.status).json(payload);
  } catch (err) {
    logger.error({ err, path, actorUserId: req.user.id }, "GIS service request failed");
    res.status(502).json({ error: "GIS Intelligence service is unavailable" });
  }
}

// Defense in depth: provincial admins fail here even if they manually discover
// a URL that the dashboard intentionally hides from them.
router.use(
  "/admin/gis",
  requireAuth,
  requireRole("developer", "superadmin"),
);

router.get("/admin/gis/overview", async (req, res): Promise<void> => {
  await forwardToGis(req as AuthenticatedRequest, res, "/internal/overview");
});

router.get("/admin/gis/tracks/recent", async (req, res): Promise<void> => {
  const parsed = RecentTracksQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid track query" });
    return;
  }
  const params = new URLSearchParams({
    hours: String(parsed.data.hours),
    limit: String(parsed.data.limit),
  });
  await forwardToGis(
    req as unknown as AuthenticatedRequest,
    res,
    `/internal/tracks/recent?${params.toString()}`,
  );
});

router.get("/admin/gis/candidates", async (req, res): Promise<void> => {
  await forwardToGis(req as AuthenticatedRequest, res, "/internal/candidates");
});

router.post("/admin/gis/candidates/generate", async (req, res): Promise<void> => {
  const parsed = GenerateCandidatesBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid candidate generation request" });
    return;
  }
  await forwardToGis(
    req as AuthenticatedRequest,
    res,
    "/internal/candidates/generate",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
    },
  );
});

router.patch("/admin/gis/candidates/:id/review", async (req, res): Promise<void> => {
  const candidateId = z.coerce.number().int().positive().safeParse(req.params.id);
  const parsed = ReviewCandidateBody.safeParse(req.body ?? {});
  if (!candidateId.success || !parsed.success) {
    res.status(400).json({ error: "A valid candidate, status, and review reason are required" });
    return;
  }
  await forwardToGis(
    req as unknown as AuthenticatedRequest,
    res,
    `/internal/candidates/${candidateId.data}/review`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
    },
  );
});

export default router;
