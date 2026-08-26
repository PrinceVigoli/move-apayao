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
import placesRouter from "./places";
import subscriptionsRouter from "./subscriptions";
import auditLogsRouter from "./audit-logs";
import trackingRouter from "./tracking";
import gisRouter from "./gis";
import notificationsRouter from "./notifications";
import farePolicyRouter from "./fare-policy";
import iotRouter from "./iot";
import docsRouter from "./docs";

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
router.use(placesRouter);
router.use(subscriptionsRouter);
router.use(auditLogsRouter);
router.use(trackingRouter);
router.use(gisRouter);
router.use(notificationsRouter);
router.use(farePolicyRouter);
router.use(iotRouter);
router.use(docsRouter);


export default router;
