import { Router } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import driversRouter from "./drivers";
import tripsRouter from "./trips";
import loopsRouter from "./loops";
import walletRouter from "./wallet";
import incidentsRouter from "./incidents";
import analyticsRouter from "./analytics";
import weatherRouter from "./weather";
import subscriptionsRouter from "./subscriptions";
import auditLogsRouter from "./audit-logs";

const router = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(driversRouter);
router.use(tripsRouter);
router.use(loopsRouter);
router.use(walletRouter);
router.use(incidentsRouter);
router.use(analyticsRouter);
router.use(weatherRouter);
router.use(subscriptionsRouter);
router.use(auditLogsRouter);


export default router;
