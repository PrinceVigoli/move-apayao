import { Router, type IRouter } from "express";
import { INTERNAL_RUNBOOKS_UPDATED_AT, INTERNAL_RUNBOOKS_VERSION, internalRunbooks } from "../lib/internal-runbooks";
import { type AuthenticatedRequest, requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.get(
  "/docs/internal/runbooks",
  requireAuth,
  requireRole("developer", "superadmin"),
  (req, res) => {
    const authReq = req as AuthenticatedRequest;
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    req.log.info({ userId: authReq.user.id, role: authReq.user.role }, "Internal runbooks accessed");
    res.json({
      version: INTERNAL_RUNBOOKS_VERSION,
      updatedAt: INTERNAL_RUNBOOKS_UPDATED_AT,
      runbooks: internalRunbooks,
    });
  },
);

export default router;
