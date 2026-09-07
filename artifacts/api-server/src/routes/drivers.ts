import { Router, type IRouter } from "express";
import { eq, and, inArray, desc, gte, gt, lte, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  auditLogsTable,
  driverProfilesTable,
  usersTable,
  tripsTable,
  subscriptionsTable,
  driverLocationPointsTable,
  fleetVehiclesTable,
  vehicleDriverAssignmentsTable,
} from "@workspace/db";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import {
  updateDriverGeo,
  removeDriverGeo,
  findNearestDrivers,
  publishDriverLocation,
  getRedis,
} from "../lib/redis";
import { markDriverAvailable, markDriverUnavailable, setDriverShift } from "../lib/driver-availability";
import { getEligibleDriverProfiles } from "../lib/driver-eligibility";
import { logger } from "../lib/logger";
import { revokeAllUserSessions } from "../lib/tokens";
import { sendPushToUser } from "../lib/push";
import { sendDriverApplicationDecisionEmail } from "../lib/mailer";
import { z } from "zod";
import { readIntensiveLimiter } from "../lib/rate-limit";

const router: IRouter = Router();

// Safe wrappers — Redis failures must not crash driver operations
async function safeUpdateDriverGeo(driverId: string, lat: number, lon: number): Promise<void> {
  try {
    await updateDriverGeo(driverId, lat, lon);
  } catch (err) {
    logger.warn({ err, driverId }, "Redis geo update failed (non-fatal)");
  }
}

async function safePublishDriverLocation(
  driverId: string,
  lat: number,
  lon: number,
): Promise<void> {
  try {
    await publishDriverLocation(driverId, lat, lon);
  } catch (err) {
    logger.warn({ err, driverId }, "Redis location publish failed (non-fatal)");
  }
}

async function safeRemoveDriverGeo(driverId: string): Promise<void> {
  try {
    await removeDriverGeo(driverId);
  } catch (err) {
    logger.warn({ err, driverId }, "Redis geo remove failed (non-fatal)");
  }
}

async function safeFindNearestDrivers(
  lat: number,
  lon: number,
  radiusKm: number,
  count: number,
) {
  try {
    return await findNearestDrivers(lat, lon, radiusKm, count);
  } catch (err) {
    logger.warn({ err }, "Redis geo query failed (non-fatal)");
    return null;
  }
}

const UpdateLocationBody = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  capturedAt: z.string().datetime().optional(),
  accuracyM: z.number().min(0).max(10_000).nullable().optional(),
  speedMps: z.number().min(0).max(100).nullable().optional(),
  headingDegrees: z.number().min(0).max(360).nullable().optional(),
  devicePointId: z.string().trim().min(8).max(160).optional(),
  isMocked: z.boolean().optional(),
});

async function safeStoreGisPoint(
  driverId: string,
  point: z.infer<typeof UpdateLocationBody>,
): Promise<void> {
  try {
    // Live tracking can update every few seconds, but route intelligence does
    // not need every sample. Keep durable history to at most one point per
    // driver every 15 seconds while Redis is available.
    if (process.env.REDIS_URL) {
      try {
        const accepted = await getRedis().set(`gis:sample:${driverId}`, "1", "EX", 15, "NX");
        if (accepted !== "OK") return;
      } catch (err) {
        logger.warn({ err, driverId }, "GIS sampling throttle unavailable; storing sample");
      }
    }
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

    const suppliedTime = point.capturedAt ? new Date(point.capturedAt) : new Date();
    if (suppliedTime.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
      logger.warn({ driverId, capturedAt: suppliedTime }, "Discarded stale GIS location sample");
      return;
    }
    const capturedAt =
      suppliedTime.getTime() <= Date.now() + 5 * 60 * 1000 ? suppliedTime : new Date();

    await db
      .insert(driverLocationPointsTable)
      .values({
        driverId,
        tripId: activeTrip?.id,
        capturedAt,
        // PostGIS uses x=longitude and y=latitude.
        position: { x: point.lon, y: point.lat },
        accuracyM: point.accuracyM,
        speedMps: point.speedMps,
        headingDegrees: point.headingDegrees,
        devicePointId: point.devicePointId,
        isMocked: point.isMocked ?? false,
      })
      .onConflictDoNothing();
  } catch (err) {
    // Live tracking remains operational if the separate GIS history store is
    // temporarily unavailable or PostGIS has not been provisioned yet.
    logger.warn({ err, driverId }, "GIS location history write failed (non-fatal)");
  }
}

/**
 * PUT /api/drivers/location
 * Driver pushes their current GPS coordinates.
 */
router.put(
  "/drivers/location",
  requireAuth,
  requireRole("driver"),
  async (req, res): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const parsed = UpdateLocationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { lat, lon } = parsed.data;
    const driverId = authReq.user.id;

    const [profile] = await db
      .update(driverProfilesTable)
      .set({ currentLat: lat, currentLon: lon, lastLocationAt: new Date(), updatedAt: new Date() })
      .where(eq(driverProfilesTable.userId, driverId))
      .returning({ isAvailable: driverProfilesTable.isAvailable });

    // Location pings keep flowing while a driver is mid-trip (that's what
    // feeds the passenger's live tracking map) — but this geo index is what
    // NEW-trip matching reads from. Only an available driver should be
    // discoverable there; a busy driver's ping must not re-add them (and
    // actively removes them if they're somehow still present), otherwise
    // they'd be matchable to a second trip while already driving one.
    const dispatchEligible = profile?.isAvailable
      ? (await getEligibleDriverProfiles([driverId])).length > 0
      : false;
    const geoUpdate = dispatchEligible
      ? safeUpdateDriverGeo(driverId, lat, lon)
      : safeRemoveDriverGeo(driverId);

    await Promise.all([
      geoUpdate,
      safePublishDriverLocation(driverId, lat, lon),
      safeStoreGisPoint(driverId, parsed.data),
    ]);

    res.json({ ok: true });
  },
);

/**
 * GET /api/drivers/nearby?lat=&lon=&radius=5
 */
const NearbyDriversQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().positive().max(25).default(5),
});

router.get("/drivers/nearby", requireAuth, readIntensiveLimiter, async (req, res): Promise<void> => {
  const parsed = NearbyDriversQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Valid lat, lon, and radius (up to 25 km) are required" });
    return;
  }
  const { lat, lon, radius: radiusKm } = parsed.data;

  const nearby = await safeFindNearestDrivers(lat, lon, radiusKm, 20);
  if (nearby === null) {
    res.status(503).json({ error: "Nearby-driver service is temporarily unavailable" });
    return;
  }
  if (nearby.length === 0) {
    res.json({ drivers: [], source: "redis_geo" });
    return;
  }

  const nearbyIds = nearby.map((n) => n.driverId);
  const eligibleProfiles = await getEligibleDriverProfiles(nearbyIds);
  const eligibleIds = eligibleProfiles.map((profile) => profile.userId);
  const staleIds = nearbyIds.filter((id) => !eligibleIds.includes(id));
  await Promise.all(staleIds.map((id) => safeRemoveDriverGeo(id)));

  if (eligibleIds.length === 0) {
    res.json({ drivers: [], source: "redis_geo" });
    return;
  }

  const profiles = await db
    .select({
      userId: driverProfilesTable.userId,
      vehicleType: driverProfilesTable.vehicleType,
      vehicleColor: driverProfilesTable.vehicleColor,
      plateNumber: driverProfilesTable.plateNumber,
      isAvailable: driverProfilesTable.isAvailable,
      currentLat: driverProfilesTable.currentLat,
      currentLon: driverProfilesTable.currentLon,
      rating: driverProfilesTable.rating,
      totalTrips: driverProfilesTable.totalTrips,
      fullName: usersTable.fullName,
      avatarUrl: usersTable.avatarUrl,
    })
    .from(driverProfilesTable)
    .innerJoin(usersTable, eq(driverProfilesTable.userId, usersTable.id))
    .where(inArray(driverProfilesTable.userId, eligibleIds));

  const profileMap = new Map(profiles.map((p) => [p.userId, p]));
  const drivers = nearbyIds
    .filter((id) => profileMap.has(id))
    .map((id) => ({
      ...profileMap.get(id)!,
      distanceKm: nearby.find((n) => n.driverId === id)?.distanceKm ?? 0,
    }));

  res.json({ drivers, source: "redis_geo" });
});

/**
 * PUT /api/drivers/availability
 */
const AvailabilityBody = z.object({ isAvailable: z.boolean() });

router.put(
  "/drivers/availability",
  requireAuth,
  requireRole("driver"),
  async (req, res): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const parsed = AvailabilityBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    if (parsed.data.isAvailable) {
      await setDriverShift(authReq.user.id, true);
    } else {
      await setDriverShift(authReq.user.id, false);
    }

    const [profile] = await db
      .select()
      .from(driverProfilesTable)
      .where(eq(driverProfilesTable.userId, authReq.user.id));

    res.json({ profile });
  },
);

/**
 * GET /api/drivers/me
 */
router.get(
  "/drivers/me",
  requireAuth,
  requireRole("driver"),
  async (req, res): Promise<void> => {
    const authReq = req as AuthenticatedRequest;

    const [profile] = await db
      .select()
      .from(driverProfilesTable)
      .where(eq(driverProfilesTable.userId, authReq.user.id));

    if (!profile) {
      res.status(404).json({ error: "Driver profile not found" });
      return;
    }

    res.json({ profile });
  },
);

/**
 * PATCH /api/admin/drivers/:id/approval
 *
 * Public registration creates a driver_applicant. This is the only route
 * that can promote that account to the privileged driver role.
 */
const DriverApprovalBody = z
  .object({
    status: z.enum(["approved", "rejected", "revoked"]),
    reason: z.string().trim().min(10).max(500).optional(),
  })
  .superRefine((body, ctx) => {
    if (body.status !== "approved" && !body.reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reason"],
        message: "A reason of at least 10 characters is required",
      });
    }
  });

/**
 * GET /api/admin/drivers/applications
 *
 * Admin review queue and history. The dashboard filters this response into
 * pending / approved / rejected / revoked views without needing to join public user
 * data and private driver-profile data in the browser.
 */
router.get(
  "/admin/drivers/applications",
  requireAuth,
  requireRole("admin"),
  async (_req, res): Promise<void> => {
    const applications = await db
      .select({
        userId: driverProfilesTable.userId,
        fullName: usersTable.fullName,
        email: usersTable.email,
        phone: usersTable.phone,
        avatarUrl: usersTable.avatarUrl,
        isActive: usersTable.isActive,
        vehicleType: driverProfilesTable.vehicleType,
        vehicleColor: driverProfilesTable.vehicleColor,
        capacity: driverProfilesTable.capacity,
        plateNumber: driverProfilesTable.plateNumber,
        licenseNumber: driverProfilesTable.licenseNumber,
        approvalStatus: driverProfilesTable.approvalStatus,
        reviewReason: driverProfilesTable.reviewReason,
        reviewedBy: driverProfilesTable.reviewedBy,
        reviewedAt: driverProfilesTable.reviewedAt,
        createdAt: driverProfilesTable.createdAt,
        updatedAt: driverProfilesTable.updatedAt,
      })
      .from(driverProfilesTable)
      .innerJoin(usersTable, eq(usersTable.id, driverProfilesTable.userId))
      .orderBy(desc(driverProfilesTable.createdAt));

    const counts = applications.reduce(
      (totals, application) => {
        if (application.approvalStatus === "pending") totals.pending += 1;
        if (application.approvalStatus === "approved") totals.approved += 1;
        if (application.approvalStatus === "rejected") totals.rejected += 1;
        if (application.approvalStatus === "revoked") totals.revoked += 1;
        return totals;
      },
      { pending: 0, approved: 0, rejected: 0, revoked: 0 },
    );

    res.json({ applications, counts });
  },
);

router.patch(
  "/admin/drivers/:id/approval",
  requireAuth,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const userId = String(req.params.id ?? "");
    if (!z.string().uuid().safeParse(userId).success) {
      res.status(400).json({ error: "Invalid driver ID" });
      return;
    }

    const parsed = DriverApprovalBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const result = await db.transaction(async (trx) => {
      const [profile] = await trx
        .select()
        .from(driverProfilesTable)
        .where(eq(driverProfilesTable.userId, userId))
        .for("update");
      if (!profile) return null;

      if (parsed.data.status === profile.approvalStatus) {
        return { kind: "invalid" as const, message: `Driver is already ${parsed.data.status}` };
      }
      if (parsed.data.status === "rejected" && profile.approvalStatus !== "pending") {
        return {
          kind: "invalid" as const,
          message: "Only a pending application can be rejected",
        };
      }
      if (parsed.data.status === "revoked" && profile.approvalStatus !== "approved") {
        return {
          kind: "invalid" as const,
          message: "Only an approved driver can have access revoked",
        };
      }
      if (parsed.data.status === "revoked") {
        const [activeTrip] = await trx
          .select({ id: tripsTable.id })
          .from(tripsTable)
          .where(
            and(
              eq(tripsTable.driverId, userId),
              inArray(tripsTable.status, ["matched", "accepted", "arrived", "in_progress"]),
            ),
          )
          .limit(1);
        if (activeTrip) {
          return {
            kind: "active_trip" as const,
            tripId: activeTrip.id,
          };
        }
      }

      const approved = parsed.data.status === "approved";
      const reviewedAt = new Date();
      const [updatedUser] = await trx
        .update(usersTable)
        .set({
          role: approved ? "driver" : "driver_applicant",
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, userId))
        .returning();
      const [updatedProfile] = await trx
        .update(driverProfilesTable)
        .set({
          approvalStatus: parsed.data.status,
          reviewReason: approved ? null : parsed.data.reason,
          reviewedBy: authReq.user.id,
          reviewedAt,
          isOnShift: false,
          isAvailable: false,
          updatedAt: reviewedAt,
        })
        .where(eq(driverProfilesTable.userId, userId))
        .returning();

      if (approved && profile.approvalStatus !== "approved") {
        await trx
          .update(subscriptionsTable)
          .set({ status: "expired" })
          .where(
            and(
              eq(subscriptionsTable.userId, userId),
              eq(subscriptionsTable.status, "active"),
              lte(subscriptionsTable.expiresAt, reviewedAt),
            ),
          );
        const [subscription] = await trx
          .select({ id: subscriptionsTable.id })
          .from(subscriptionsTable)
          .where(
            and(
              eq(subscriptionsTable.userId, userId),
              eq(subscriptionsTable.status, "active"),
              gt(subscriptionsTable.expiresAt, reviewedAt),
            ),
          )
          .limit(1);
        if (!subscription) {
          const startsAt = new Date();
          const expiresAt = new Date(startsAt);
          expiresAt.setFullYear(expiresAt.getFullYear() + 1);
          await trx.insert(subscriptionsTable).values({
            userId,
            plan: "annual",
            status: "active",
            startsAt,
            expiresAt,
          });
        }
      }

      const action =
        parsed.data.status === "approved"
          ? "driver.application.approved"
          : parsed.data.status === "rejected"
            ? "driver.application.rejected"
            : "driver.access.revoked";

      await trx.insert(auditLogsTable).values({
        actorUserId: authReq.user.id,
        action,
        targetUserId: userId,
        metadata: {
          previousStatus: profile.approvalStatus,
          newStatus: parsed.data.status,
          reason: parsed.data.reason ?? null,
        },
      });

      return { kind: "updated" as const, user: updatedUser!, profile: updatedProfile! };
    });

    if (!result) {
      res.status(404).json({ error: "Driver application not found" });
      return;
    }
    if (result.kind === "invalid") {
      res.status(409).json({ error: result.message });
      return;
    }
    if (result.kind === "active_trip") {
      res.status(409).json({
        error: "Driver access cannot be revoked during an active trip. Resolve or cancel the trip first.",
        activeTripId: result.tripId,
      });
      return;
    }

    // Approval changes are security-sensitive; end old sessions so the next
    // login receives a token carrying the current role as well.
    await revokeAllUserSessions(userId);
    if (parsed.data.status !== "approved") {
      await safeRemoveDriverGeo(userId);
    }
    void sendPushToUser(userId, {
      title:
        parsed.data.status === "approved"
          ? "Driver application approved"
          : parsed.data.status === "rejected"
            ? "Driver application update"
            : "Driver access revoked",
      body:
        parsed.data.status === "approved"
          ? "You can now sign in to the MOVE Driver app."
          : parsed.data.reason ?? "Open the app for details.",
      data: { type: "driver_application", status: parsed.data.status },
    });
    void sendDriverApplicationDecisionEmail(
      result.user.email,
      parsed.data.status,
      parsed.data.reason,
    ).catch((err) => logger.warn({ err, userId }, "Driver decision email failed"));
    res.json({ user: result.user, profile: result.profile });
  },
);

/**
 * GET /api/admin/drivers/live
 *
 * Admin-only fleet view: EVERY driver (not just available ones, no radius
 * filter — unlike /drivers/nearby which serves passenger matching). Includes
 * last-known position, availability, how stale the last GPS ping is, and the
 * driver's current active trip if they're mid-ride, so the dashboard map can
 * distinguish idle-available / busy-on-trip / offline at a glance.
 */
router.get(
  "/admin/drivers/live",
  requireAuth,
  requireRole("admin"),
  async (_req, res): Promise<void> => {
    const rows = await db
      .select({
        userId: driverProfilesTable.userId,
        fullName: usersTable.fullName,
        phone: usersTable.phone,
        vehicleType: driverProfilesTable.vehicleType,
        capacity: driverProfilesTable.capacity,
        plateNumber: driverProfilesTable.plateNumber,
        isOnShift: driverProfilesTable.isOnShift,
        isAvailable: driverProfilesTable.isAvailable,
        currentLat: driverProfilesTable.currentLat,
        currentLon: driverProfilesTable.currentLon,
        lastLocationAt: driverProfilesTable.lastLocationAt,
        vehicleId: fleetVehiclesTable.id,
        vehicleLat: fleetVehiclesTable.currentLat,
        vehicleLon: fleetVehiclesTable.currentLon,
        vehicleLastLocationAt: fleetVehiclesTable.lastLocationAt,
        rating: driverProfilesTable.rating,
        totalTrips: driverProfilesTable.totalTrips,
        activeTripId: tripsTable.id,
        activeTripStatus: tripsTable.status,
        activeTripDropoff: tripsTable.dropoffAddress,
      })
      .from(driverProfilesTable)
      .innerJoin(usersTable, eq(usersTable.id, driverProfilesTable.userId))
      .leftJoin(
        vehicleDriverAssignmentsTable,
        and(
          eq(vehicleDriverAssignmentsTable.driverId, driverProfilesTable.userId),
          isNull(vehicleDriverAssignmentsTable.unassignedAt),
        ),
      )
      .leftJoin(
        fleetVehiclesTable,
        eq(fleetVehiclesTable.id, vehicleDriverAssignmentsTable.vehicleId),
      )
      .leftJoin(
        tripsTable,
        and(
          eq(tripsTable.driverId, driverProfilesTable.userId),
          inArray(tripsTable.status, ["matched", "accepted", "arrived", "in_progress"]),
        ),
      )
      .where(
        and(
          eq(driverProfilesTable.approvalStatus, "approved"),
          eq(usersTable.role, "driver"),
        ),
      );

    const now = Date.now();
    const drivers = rows.map((r) => {
      // Dispatch availability deliberately uses only the smartphone heartbeat.
      // An installed vehicle tracker must never make a driver look bookable.
      const smartphoneLastSeenMs = r.lastLocationAt
        ? now - new Date(r.lastLocationAt).getTime()
        : null;
      // Status precedence: on a trip > available > offline. "Offline" also
      // covers available-flagged drivers whose GPS has gone silent for over
      // 3 minutes — the app may have died mid-shift, and an operator should
      // see that as a stale/offline marker, not a healthy green one.
      const stale = smartphoneLastSeenMs == null || smartphoneLastSeenMs > 3 * 60 * 1000;
      const status: "on_trip" | "available" | "offline" = r.activeTripId
        ? "on_trip"
        : r.isOnShift && r.isAvailable && !stale
          ? "available"
          : "offline";
      const hasIotPosition = r.vehicleLat != null && r.vehicleLon != null;
      const displayedAt = hasIotPosition ? r.vehicleLastLocationAt : r.lastLocationAt;
      const displayedLastSeenMs = displayedAt
        ? now - new Date(displayedAt).getTime()
        : null;
      return {
        userId: r.userId,
        fullName: r.fullName,
        phone: r.phone,
        vehicleType: r.vehicleType,
        capacity: r.capacity,
        plateNumber: r.plateNumber,
        rating: r.rating,
        totalTrips: r.totalTrips,
        vehicleId: r.vehicleId,
        lat: hasIotPosition ? r.vehicleLat : r.currentLat,
        lon: hasIotPosition ? r.vehicleLon : r.currentLon,
        lastLocationAt: displayedAt,
        lastSeenSecondsAgo:
          displayedLastSeenMs != null ? Math.round(displayedLastSeenMs / 1000) : null,
        locationSource: hasIotPosition
          ? "iot_gps" as const
          : r.currentLat != null && r.currentLon != null
            ? "smartphone_gps" as const
            : null,
        smartphoneLastLocationAt: r.lastLocationAt,
        smartphoneLastSeenSecondsAgo:
          smartphoneLastSeenMs != null ? Math.round(smartphoneLastSeenMs / 1000) : null,
        status,
        activeTrip: r.activeTripId
          ? { id: r.activeTripId, status: r.activeTripStatus, dropoffAddress: r.activeTripDropoff }
          : null,
      };
    });

    res.json({ drivers, generatedAt: new Date().toISOString() });
  },
);

export default router;
