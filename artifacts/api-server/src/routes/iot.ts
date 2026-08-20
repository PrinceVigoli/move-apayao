import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  auditLogsTable,
  db,
  driverLocationPointsTable,
  driverProfilesTable,
  fleetVehiclesTable,
  gpsDevicesTable,
  tripsTable,
  usersTable,
  vehicleDriverAssignmentsTable,
  vehicleLocationPointsTable,
} from "@workspace/db";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { sensitiveActionLimiter } from "../lib/rate-limit";
import { hashToken } from "../lib/tokens";
import { issueDeviceToken, readDeviceAuthorization, verifyDeviceToken } from "../lib/device-auth";
import {
  getRedis,
  publishVehicleLocation,
} from "../lib/redis";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const privileged = [requireAuth, requireRole("developer", "superadmin")] as const;
const configuredBackfillHours = Number(process.env.IOT_MAX_BACKFILL_AGE_HOURS ?? 168);
const IOT_MAX_BACKFILL_AGE_MS =
  (Number.isFinite(configuredBackfillHours) && configuredBackfillHours > 0
    ? Math.min(configuredBackfillHours, 24 * 30)
    : 168) * 60 * 60_000;

const CreateVehicleBody = z.object({
  plateNumber: z.string().trim().min(3).max(30),
  label: z.string().trim().min(2).max(100).optional(),
  vehicleType: z.string().trim().min(2).max(50).default("e-jeepney"),
  capacity: z.number().int().min(1).max(100).default(15),
});

const ProvisionDeviceBody = z.object({
  vehicleId: z.string().uuid(),
  externalId: z.string().trim().min(4).max(64).optional(),
  label: z.string().trim().min(2).max(100).optional(),
  protocol: z.string().trim().min(2).max(50).default("https_json_v1"),
});

const AssignVehicleBody = z.object({
  vehicleId: z.string().uuid(),
  driverId: z.string().uuid(),
});

const DeviceLocationBody = z.object({
  eventId: z.string().trim().min(8).max(64),
  capturedAt: z.string().datetime(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(10_000).nullable().optional(),
  speedMps: z.number().min(0).max(100).nullable().optional(),
  headingDegrees: z.number().min(0).max(360).nullable().optional(),
  batteryPercent: z.number().min(0).max(100).nullable().optional(),
  signalDbm: z.number().min(-200).max(0).nullable().optional(),
});

router.get("/iot/fleet", ...privileged, async (_req, res): Promise<void> => {
  const [vehicles, devices, assignments] = await Promise.all([
    db.select().from(fleetVehiclesTable).orderBy(desc(fleetVehiclesTable.createdAt)),
    db
      .select({
        id: gpsDevicesTable.id,
        externalId: gpsDevicesTable.externalId,
        vehicleId: gpsDevicesTable.vehicleId,
        label: gpsDevicesTable.label,
        protocol: gpsDevicesTable.protocol,
        isActive: gpsDevicesTable.isActive,
        lastSeenAt: gpsDevicesTable.lastSeenAt,
        lastBatteryPercent: gpsDevicesTable.lastBatteryPercent,
        lastSignalDbm: gpsDevicesTable.lastSignalDbm,
        createdAt: gpsDevicesTable.createdAt,
      })
      .from(gpsDevicesTable)
      .orderBy(desc(gpsDevicesTable.createdAt)),
    db
      .select({
        id: vehicleDriverAssignmentsTable.id,
        vehicleId: vehicleDriverAssignmentsTable.vehicleId,
        driverId: vehicleDriverAssignmentsTable.driverId,
        driverName: usersTable.fullName,
        assignedAt: vehicleDriverAssignmentsTable.assignedAt,
      })
      .from(vehicleDriverAssignmentsTable)
      .innerJoin(usersTable, eq(usersTable.id, vehicleDriverAssignmentsTable.driverId))
      .where(isNull(vehicleDriverAssignmentsTable.unassignedAt)),
  ]);
  res.json({ vehicles, devices, assignments });
});

router.post(
  "/iot/vehicles",
  ...privileged,
  sensitiveActionLimiter,
  async (req, res): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const parsed = CreateVehicleBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const vehicle = await db.transaction(async (trx) => {
      const [created] = await trx
        .insert(fleetVehiclesTable)
        .values({ ...parsed.data, plateNumber: parsed.data.plateNumber.toUpperCase() })
        .returning();
      await trx.insert(auditLogsTable).values({
        actorUserId: authReq.user.id,
        action: "iot.vehicle.created",
        metadata: { vehicleId: created.id, plateNumber: created.plateNumber },
      });
      return created;
    });
    res.status(201).json({ vehicle });
  },
);

router.post(
  "/iot/devices/provision",
  ...privileged,
  sensitiveActionLimiter,
  async (req, res): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const parsed = ProvisionDeviceBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [vehicle] = await db
      .select({ id: fleetVehiclesTable.id })
      .from(fleetVehiclesTable)
      .where(and(eq(fleetVehiclesTable.id, parsed.data.vehicleId), eq(fleetVehiclesTable.isActive, true)));
    if (!vehicle) {
      res.status(404).json({ error: "Active vehicle not found" });
      return;
    }

    const rawToken = issueDeviceToken();
    const externalId = parsed.data.externalId ?? `move-${randomUUID()}`;
    const device = await db.transaction(async (trx) => {
      // Provisioning a replacement retires the old tracker without deleting
      // its telemetry or audit trail.
      await trx
        .update(gpsDevicesTable)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(gpsDevicesTable.vehicleId, vehicle.id), eq(gpsDevicesTable.isActive, true)));
      const [created] = await trx
        .insert(gpsDevicesTable)
        .values({
          externalId,
          vehicleId: vehicle.id,
          label: parsed.data.label,
          protocol: parsed.data.protocol,
          tokenHash: hashToken(rawToken),
        })
        .returning();
      await trx.insert(auditLogsTable).values({
        actorUserId: authReq.user.id,
        action: "iot.device.provisioned",
        metadata: { deviceId: created.id, externalId: created.externalId, vehicleId: vehicle.id },
      });
      return created;
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json({
      device: {
        id: device.id,
        externalId: device.externalId,
        vehicleId: device.vehicleId,
        protocol: device.protocol,
      },
      token: rawToken,
      warning: "Store this token now. It cannot be retrieved again.",
    });
  },
);

router.post(
  "/iot/assignments",
  ...privileged,
  sensitiveActionLimiter,
  async (req, res): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const parsed = AssignVehicleBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [vehicle] = await db
      .select({ id: fleetVehiclesTable.id })
      .from(fleetVehiclesTable)
      .where(and(eq(fleetVehiclesTable.id, parsed.data.vehicleId), eq(fleetVehiclesTable.isActive, true)));
    const [driver] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .innerJoin(driverProfilesTable, eq(driverProfilesTable.userId, usersTable.id))
      .where(
        and(
          eq(usersTable.id, parsed.data.driverId),
          eq(usersTable.role, "driver"),
          eq(usersTable.isActive, true),
          eq(driverProfilesTable.approvalStatus, "approved"),
        ),
      );
    if (!vehicle || !driver) {
      res.status(400).json({ error: "An active vehicle and approved driver are required" });
      return;
    }

    const currentAssignments = await db
      .select({ driverId: vehicleDriverAssignmentsTable.driverId })
      .from(vehicleDriverAssignmentsTable)
      .where(
        and(
          isNull(vehicleDriverAssignmentsTable.unassignedAt),
          or(
            eq(vehicleDriverAssignmentsTable.vehicleId, vehicle.id),
            eq(vehicleDriverAssignmentsTable.driverId, driver.id),
          ),
        ),
      );
    const affectedDriverIds = Array.from(
      new Set([driver.id, ...currentAssignments.map((assignment) => assignment.driverId)]),
    );
    const [activeTrip] = await db
      .select({ id: tripsTable.id })
      .from(tripsTable)
      .where(
        and(
          inArray(tripsTable.driverId, affectedDriverIds),
          inArray(tripsTable.status, ["matched", "accepted", "arrived", "in_progress"]),
        ),
      )
      .limit(1);
    if (activeTrip) {
      res.status(409).json({
        error: "Vehicle assignments cannot change while an affected driver has an active trip",
        activeTripId: activeTrip.id,
      });
      return;
    }

    const now = new Date();
    const assignment = await db.transaction(async (trx) => {
      await trx
        .update(vehicleDriverAssignmentsTable)
        .set({ unassignedAt: now })
        .where(
          and(
            isNull(vehicleDriverAssignmentsTable.unassignedAt),
            or(
              eq(vehicleDriverAssignmentsTable.vehicleId, vehicle.id),
              eq(vehicleDriverAssignmentsTable.driverId, driver.id),
            ),
          ),
        );
      const [created] = await trx
        .insert(vehicleDriverAssignmentsTable)
        .values({ vehicleId: vehicle.id, driverId: driver.id, createdBy: authReq.user.id })
        .returning();
      await trx.insert(auditLogsTable).values({
        actorUserId: authReq.user.id,
        action: "iot.vehicle.assigned",
        targetUserId: driver.id,
        metadata: { assignmentId: created.id, vehicleId: vehicle.id },
      });
      return created;
    });
    res.status(201).json({ assignment });
  },
);

router.patch(
  "/iot/devices/:id/revoke",
  ...privileged,
  sensitiveActionLimiter,
  async (req, res): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const deviceId = String(req.params.id ?? "");
    if (!z.string().uuid().safeParse(deviceId).success) {
      res.status(400).json({ error: "Invalid device ID" });
      return;
    }
    const device = await db.transaction(async (trx) => {
      const [revoked] = await trx
        .update(gpsDevicesTable)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(gpsDevicesTable.id, deviceId))
        .returning({ id: gpsDevicesTable.id, externalId: gpsDevicesTable.externalId });
      if (revoked) {
        await trx.insert(auditLogsTable).values({
          actorUserId: authReq.user.id,
          action: "iot.device.revoked",
          metadata: { deviceId: revoked.id, externalId: revoked.externalId },
        });
      }
      return revoked;
    });
    if (!device) {
      res.status(404).json({ error: "Device not found" });
      return;
    }
    res.json({ device });
  },
);

/**
 * Hardware-neutral ingest contract. Vendor-specific payloads should be
 * translated to this JSON shape by a small adapter, never by weakening this
 * authenticated endpoint or storing a driver's login on the tracker.
 */
router.post("/iot/v1/locations", async (req, res): Promise<void> => {
  const externalId = String(req.header("x-device-id") ?? "").trim();
  const rawToken = readDeviceAuthorization(req.header("authorization"));
  if (!externalId || !rawToken) {
    res.status(401).json({ error: "Device credentials are required" });
    return;
  }
  const [device] = await db
    .select()
    .from(gpsDevicesTable)
    .where(eq(gpsDevicesTable.externalId, externalId))
    .limit(1);
  if (!device?.isActive || !verifyDeviceToken(rawToken, device.tokenHash)) {
    res.status(401).json({ error: "Invalid device credentials" });
    return;
  }
  const parsed = DeviceLocationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const point = parsed.data;
  const capturedAt = new Date(point.capturedAt);
  const now = new Date();
  if (capturedAt.getTime() > now.getTime() + 5 * 60_000) {
    res.status(400).json({ error: "capturedAt is too far in the future" });
    return;
  }
  if (capturedAt.getTime() < now.getTime() - IOT_MAX_BACKFILL_AGE_MS) {
    res.status(400).json({ error: "Telemetry exceeds the configured backfill age" });
    return;
  }

  const [assignment] = await db
    .select({ driverId: vehicleDriverAssignmentsTable.driverId })
    .from(vehicleDriverAssignmentsTable)
    .where(
      and(
        eq(vehicleDriverAssignmentsTable.vehicleId, device.vehicleId),
        isNull(vehicleDriverAssignmentsTable.unassignedAt),
      ),
    )
    .limit(1);

  const [stored] = await db
    .insert(vehicleLocationPointsTable)
    .values({
      vehicleId: device.vehicleId,
      deviceId: device.id,
      driverId: assignment?.driverId,
      eventId: point.eventId,
      capturedAt,
      position: { x: point.lon, y: point.lat },
      accuracyM: point.accuracyM,
      speedMps: point.speedMps,
      headingDegrees: point.headingDegrees === 360 ? 0 : point.headingDegrees,
      batteryPercent: point.batteryPercent,
      signalDbm: point.signalDbm,
    })
    .onConflictDoNothing()
    .returning({ id: vehicleLocationPointsTable.id });

  await db
    .update(gpsDevicesTable)
    .set({
      lastSeenAt: now,
      lastBatteryPercent: point.batteryPercent,
      lastSignalDbm: point.signalDbm,
      updatedAt: now,
    })
    .where(eq(gpsDevicesTable.id, device.id));

  if (!stored) {
    res.status(202).json({ accepted: true, duplicate: true, liveUpdated: false });
    return;
  }

  // Store every valid observation, but only the newest capture may become
  // the live position. This prevents delayed cellular packets moving a car
  // backwards on the passenger map.
  const [liveVehicle] = await db
    .update(fleetVehiclesTable)
    .set({
      currentLat: point.lat,
      currentLon: point.lon,
      lastLocationAt: capturedAt,
      updatedAt: now,
    })
    .where(
      and(
        eq(fleetVehiclesTable.id, device.vehicleId),
        eq(fleetVehiclesTable.isActive, true),
        or(isNull(fleetVehiclesTable.lastLocationAt), lte(fleetVehiclesTable.lastLocationAt, capturedAt)),
      ),
    )
    .returning({ id: fleetVehiclesTable.id });

  if (liveVehicle && assignment?.driverId) {
    const driverId = assignment.driverId;
    const [activeTrip] = await db
      .select({ id: tripsTable.id })
      .from(tripsTable)
      .where(
        and(
          eq(tripsTable.driverId, driverId),
          inArray(tripsTable.status, ["matched", "accepted", "arrived", "in_progress"]),
        ),
      )
      .limit(1);

    // Feed the existing GIS intelligence stream at a controlled sampling
    // rate while retaining all raw vehicle observations above.
    const isBufferedBackfill = capturedAt.getTime() < now.getTime() - 60_000;
    let keepGisSample = true;
    if (!isBufferedBackfill && process.env.REDIS_URL) {
      try {
        keepGisSample =
          (await getRedis().set(`gis:sample:${driverId}`, "1", "EX", 15, "NX")) === "OK";
      } catch (err) {
        logger.warn({ err, driverId }, "IoT GIS sampling throttle unavailable");
      }
    }
    if (keepGisSample) {
      await db
        .insert(driverLocationPointsTable)
        .values({
          driverId,
          tripId: activeTrip?.id,
          capturedAt,
          position: { x: point.lon, y: point.lat },
          accuracyM: point.accuracyM,
          speedMps: point.speedMps,
          headingDegrees: point.headingDegrees === 360 ? 0 : point.headingDegrees,
          devicePointId: `${device.externalId}:${point.eventId}`,
          source: "iot_gps",
          isMocked: false,
        })
        .onConflictDoNothing();
    }

  }

  if (liveVehicle) {
    try {
      await publishVehicleLocation(
        device.vehicleId,
        assignment?.driverId ?? null,
        point.lat,
        point.lon,
        capturedAt,
      );
    } catch (err) {
      logger.warn({ err, vehicleId: device.vehicleId, deviceId: device.id }, "IoT Redis live update failed");
    }
  }

  res.status(202).json({
    accepted: true,
    duplicate: false,
    liveUpdated: !!liveVehicle,
    assignedDriverId: assignment?.driverId ?? null,
  });
});

export default router;
