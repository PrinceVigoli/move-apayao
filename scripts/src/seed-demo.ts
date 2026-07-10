/**
 * Seeds a full realistic demo dataset for MOVE Apayao — enough that the
 * admin dashboard, driver app, and passenger app all look "alive" on
 * camera instead of showing zeros / empty states.
 *
 * Creates:
 *   - 6 passenger accounts (users + fare_wallets + top-up transactions + subscriptions)
 *   - 6 driver accounts (users + driver_profiles + fare_wallets + subscriptions)
 *   - ~65 trips spread across the last 14 days, with a realistic status mix
 *     (mostly completed, a few cancelled, one in_progress, one matched,
 *     one requested) so "Active Trips" and the Trips/Analytics pages aren't empty
 *   - trip ratings on completed trips
 *   - 9 incident reports (open / reviewing / resolved, mixed severity, mixed type)
 *   - 2 loop routes with stops, and vehicles assigned to them
 *   - 8 audit log entries (wallet top-ups/refunds, driver suspend/reinstate,
 *     subscription cancel, incident resolve, user deactivate)
 *
 * All accounts use the SAME password so you can log into the driver app
 * or passenger app with any seeded email during your recording.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run seed:demo
 *
 * Safe to re-run — it upserts users by email and skips re-inserting trips
 * if demo trips already exist (checked via a marker in cancelReason/description
 * is NOT used; instead we just check trip count for the seeded passengers).
 *
 * Required env vars (reads from artifacts/api-server/.env.local automatically):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, "../../artifacts/api-server/.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../../artifacts/api-server/.env") });

const DEMO_PASSWORD = "DemoPass123!";

// Roughly around Luna, Apayao (the town shown on the dashboard weather pill).
const BASE_LAT = 18.192;
const BASE_LON = 121.128;
const jitter = () => (Math.random() - 0.5) * 0.02; // ~1km wobble

const PASSENGERS = [
  { email: "maria.santos@moveapayao.test", name: "Maria Santos", phone: "09171234501" },
  { email: "juan.reyes@moveapayao.test", name: "Juan Reyes", phone: "09171234502" },
  { email: "ana.bautista@moveapayao.test", name: "Ana Bautista", phone: "09171234503" },
  { email: "pedro.garcia@moveapayao.test", name: "Pedro Garcia", phone: "09171234504" },
  { email: "liza.domingo@moveapayao.test", name: "Liza Domingo", phone: "09171234505" },
  { email: "carlo.mendoza@moveapayao.test", name: "Carlo Mendoza", phone: "09171234506" },
];

const DRIVERS = [
  {
    email: "juan.delacruz@moveapayao.test",
    name: "Juan Dela Cruz",
    phone: "09181234501",
    plate: "APY-1001",
    color: "Red",
    license: "N01-23-456701",
    available: true,
  },
  {
    email: "maria.soriano@moveapayao.test",
    name: "Maria Soriano",
    phone: "09181234502",
    plate: "APY-1002",
    color: "Blue",
    license: "N01-23-456702",
    available: true,
  },
  {
    email: "ricardo.tan@moveapayao.test",
    name: "Ricardo Tan",
    phone: "09181234503",
    plate: "APY-1003",
    color: "Green",
    license: "N01-23-456703",
    available: true,
  },
  {
    email: "ellen.pascua@moveapayao.test",
    name: "Ellen Pascua",
    phone: "09181234504",
    plate: "APY-1004",
    color: "White",
    license: "N01-23-456704",
    available: false,
  },
  {
    email: "roberto.aguinaldo@moveapayao.test",
    name: "Roberto Aguinaldo",
    phone: "09181234505",
    plate: "APY-1005",
    color: "Yellow",
    license: "N01-23-456705",
    available: true,
  },
  {
    email: "grace.villanueva@moveapayao.test",
    name: "Grace Villanueva",
    phone: "09181234506",
    plate: "APY-1006",
    color: "Black",
    license: "N01-23-456706",
    available: false,
  },
];

const ADDRESSES = [
  "Luna Public Market, Luna, Apayao",
  "Luna Municipal Hall, Luna, Apayao",
  "Conner Poblacion, Conner, Apayao",
  "Pudtol Town Proper, Pudtol, Apayao",
  "Kabugao Bus Terminal, Kabugao, Apayao",
  "Flora Elementary School, Flora, Apayao",
  "Sta. Marcela Barangay Hall, Sta. Marcela, Apayao",
  "Calanasan Crossing, Calanasan, Apayao",
];

function randPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randCoord() {
  return { lat: BASE_LAT + jitter(), lon: BASE_LON + jitter() };
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error(
      "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.\n" +
        "Make sure artifacts/api-server/.env.local has both set.",
    );
    process.exit(1);
  }

  const {
    db,
    usersTable,
    driverProfilesTable,
    fareWalletsTable,
    fareTransactionsTable,
    subscriptionsTable,
    tripsTable,
    tripRatingsTable,
    incidentReportsTable,
    loopRoutesTable,
    loopStopsTable,
    loopVehiclesTable,
    auditLogsTable,
  } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ---- helpers -------------------------------------------------------

  async function ensureAuthUser(email: string): Promise<string> {
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
    if (!error) return created.user.id;
    if (!error.message.toLowerCase().includes("already been registered")) throw error;
    const { data: list, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) throw listError;
    const existing = list.users.find((u) => u.email === email);
    if (!existing) throw new Error(`Could not find existing auth user for ${email}`);
    return existing.id;
  }

  async function ensureWallet(userId: string, balance: number) {
    const [existing] = await db
      .select()
      .from(fareWalletsTable)
      .where(eq(fareWalletsTable.userId, userId));
    if (existing) return existing;
    const [row] = await db
      .insert(fareWalletsTable)
      .values({ userId, balance })
      .returning();
    return row;
  }

  // ---- 1. passengers ---------------------------------------------------

  console.log("\n=== Seeding passengers ===");
  const passengerIds: string[] = [];
  for (const p of PASSENGERS) {
    const id = await ensureAuthUser(p.email);
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!existing) {
      await db.insert(usersTable).values({ id, email: p.email, fullName: p.name, phone: p.phone, role: "passenger" });
    }
    const wallet = await ensureWallet(id, 250 + Math.random() * 500);

    // A couple of top-up transactions so the wallet page + history isn't empty.
    const existingTx = await db
      .select()
      .from(fareTransactionsTable)
      .where(eq(fareTransactionsTable.userId, id));
    if (existingTx.length === 0) {
      const topUp = 200 + Math.floor(Math.random() * 4) * 100;
      await db.insert(fareTransactionsTable).values({
        walletId: wallet.id,
        userId: id,
        amount: topUp,
        type: "top_up",
        description: "Wallet top-up via GCash",
        balanceBefore: 0,
        balanceAfter: topUp,
      });
    }

    passengerIds.push(id);
    console.log(`  ✓ ${p.name} <${p.email}>`);
  }

  // Passengers also get a subscription row on real registration (see
  // routes/auth.ts) — seed a mix of plans/statuses so the Subscriptions
  // page shows more than just the driver annual plans.
  console.log("\n=== Seeding passenger subscriptions ===");
  const SUB_PLANS: Array<{ plan: string; status: string; startedDaysAgo: number; durationDays: number }> = [
    { plan: "annual", status: "active", startedDaysAgo: 10, durationDays: 365 },
    { plan: "premium_monthly", status: "active", startedDaysAgo: 5, durationDays: 30 },
    { plan: "basic_weekly", status: "expired", startedDaysAgo: 20, durationDays: 7 },
    { plan: "premium_monthly", status: "active", startedDaysAgo: 2, durationDays: 30 },
    { plan: "annual", status: "cancelled", startedDaysAgo: 60, durationDays: 365 },
    { plan: "basic_weekly", status: "active", startedDaysAgo: 1, durationDays: 7 },
  ];
  for (let i = 0; i < passengerIds.length; i++) {
    const pid = passengerIds[i];
    const [existingSub] = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, pid));
    if (existingSub) continue;
    const cfg = SUB_PLANS[i % SUB_PLANS.length];
    const startsAt = new Date(Date.now() - cfg.startedDaysAgo * 86_400_000);
    const expiresAt = new Date(startsAt.getTime() + cfg.durationDays * 86_400_000);
    await db.insert(subscriptionsTable).values({
      userId: pid,
      plan: cfg.plan,
      status: cfg.status,
      startsAt,
      expiresAt,
    });
  }
  console.log(`  ✓ Seeded ${passengerIds.length} passenger subscriptions (mixed plans/statuses)`);

  // ---- 2. drivers -----------------------------------------------------

  console.log("\n=== Seeding drivers ===");
  const driverIds: string[] = [];
  for (const d of DRIVERS) {
    const id = await ensureAuthUser(d.email);
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!existing) {
      await db.insert(usersTable).values({ id, email: d.email, fullName: d.name, phone: d.phone, role: "driver" });
    } else {
      await db.update(usersTable).set({ role: "driver" }).where(eq(usersTable.id, id));
    }
    await ensureWallet(id, 0);

    const [existingSub] = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, id));
    if (!existingSub) {
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      await db.insert(subscriptionsTable).values({
        userId: id,
        plan: "annual",
        status: "active",
        startsAt: now,
        expiresAt,
      });
    }

    const coord = randCoord();
    const [existingProfile] = await db
      .select()
      .from(driverProfilesTable)
      .where(eq(driverProfilesTable.userId, id));
    const profileValues = {
      vehicleType: "e-trike",
      capacity: 4,
      plateNumber: d.plate,
      vehicleColor: d.color,
      licenseNumber: d.license,
      isAvailable: d.available,
      currentLat: coord.lat,
      currentLon: coord.lon,
      lastLocationAt: new Date(),
      rating: 4.2 + Math.random() * 0.7,
      totalTrips: 20 + Math.floor(Math.random() * 80),
    };
    if (existingProfile) {
      await db
        .update(driverProfilesTable)
        .set({ ...profileValues, updatedAt: new Date() })
        .where(eq(driverProfilesTable.userId, id));
    } else {
      await db.insert(driverProfilesTable).values({ userId: id, ...profileValues });
    }

    driverIds.push(id);
    console.log(`  ✓ ${d.name} <${d.email}> — ${d.available ? "online" : "offline"}`);
  }

  // ---- 3. trips ---------------------------------------------------------

  console.log("\n=== Seeding trips ===");
  const existingTrips = await db.select().from(tripsTable).where(eq(tripsTable.passengerId, passengerIds[0]));
  if (existingTrips.length > 0) {
    console.log("  Demo trips already exist for the first seeded passenger — skipping trip seeding.");
  } else {
    const now = Date.now();
    const DAY = 86_400_000;
    let tripsCreated = 0;

    for (let dayOffset = 13; dayOffset >= 0; dayOffset--) {
      const tripsToday = 3 + Math.floor(Math.random() * 4); // 3-6 trips/day
      for (let i = 0; i < tripsToday; i++) {
        const passengerId = randPick(passengerIds);
        const driverId = randPick(driverIds);
        const pickup = randCoord();
        const dropoff = randCoord();
        const distanceKm = 1 + Math.random() * 7;
        const fareAmount = Math.round((25 + distanceKm * 8) * 100) / 100; // ₱25 base + per-km

        // Status mix: mostly completed, some cancelled.
        const roll = Math.random();
        const status = roll < 0.78 ? "completed" : roll < 0.92 ? "cancelled" : "completed";

        const createdAt = new Date(now - dayOffset * DAY - Math.floor(Math.random() * DAY));
        const matchedAt = new Date(createdAt.getTime() + 60_000);
        const startedAt = new Date(matchedAt.getTime() + 3 * 60_000);
        const completedAt = new Date(startedAt.getTime() + (8 + Math.random() * 15) * 60_000);

        const base = {
          passengerId,
          driverId,
          pickupLat: pickup.lat,
          pickupLon: pickup.lon,
          pickupAddress: randPick(ADDRESSES),
          dropoffLat: dropoff.lat,
          dropoffLon: dropoff.lon,
          dropoffAddress: randPick(ADDRESSES),
          passengerCount: 1 + (Math.random() < 0.2 ? 1 : 0),
          distanceKm: Math.round(distanceKm * 100) / 100,
          createdAt,
        };

        if (status === "completed") {
          const [trip] = await db
            .insert(tripsTable)
            .values({
              ...base,
              status: "completed",
              fareAmount,
              matchedAt,
              startedAt,
              completedAt,
            })
            .returning();

          // Deduct fare from passenger wallet as a transaction record + rate the trip.
          const [wallet] = await db
            .select()
            .from(fareWalletsTable)
            .where(eq(fareWalletsTable.userId, passengerId));
          if (wallet) {
            await db.insert(fareTransactionsTable).values({
              walletId: wallet.id,
              userId: passengerId,
              amount: -fareAmount,
              type: "deduct",
              description: `Trip #${trip.id} fare`,
              referenceId: String(trip.id),
              balanceBefore: wallet.balance,
              balanceAfter: Math.max(0, wallet.balance - fareAmount),
            });
          }
          if (Math.random() < 0.6) {
            await db.insert(tripRatingsTable).values({
              tripId: trip.id,
              raterId: passengerId,
              rateeId: driverId,
              rating: 4 + Math.round(Math.random()),
              comment: randPick([
                "Friendly driver, smooth ride!",
                "Arrived on time.",
                "Safe driving, thank you.",
                null as unknown as string,
              ]) ?? undefined,
            });
          }
        } else {
          await db.insert(tripsTable).values({
            ...base,
            status: "cancelled",
            cancelReason: randPick(["Passenger changed plans", "Driver unavailable", "Long wait time"]),
            cancelledAt: new Date(createdAt.getTime() + 2 * 60_000),
          });
        }
        tripsCreated++;
      }
    }

    // A few "live right now" trips so the dashboard doesn't show 0 active trips.
    const livePassenger1 = randPick(passengerIds);
    const livePassenger2 = randPick(passengerIds.filter((p) => p !== livePassenger1));
    const liveDriver1 = randPick(driverIds);
    const liveDriver2 = randPick(driverIds.filter((d) => d !== liveDriver1));

    const p1 = randCoord();
    const d1 = randCoord();
    await db.insert(tripsTable).values({
      passengerId: livePassenger1,
      driverId: liveDriver1,
      pickupLat: p1.lat,
      pickupLon: p1.lon,
      pickupAddress: randPick(ADDRESSES),
      dropoffLat: d1.lat,
      dropoffLon: d1.lon,
      dropoffAddress: randPick(ADDRESSES),
      passengerCount: 1,
      distanceKm: 3.2,
      status: "in_progress",
      fareAmount: 45.0,
      matchedAt: new Date(now - 6 * 60_000),
      startedAt: new Date(now - 4 * 60_000),
      createdAt: new Date(now - 7 * 60_000),
    });
    tripsCreated++;

    const p2 = randCoord();
    const d2 = randCoord();
    await db.insert(tripsTable).values({
      passengerId: livePassenger2,
      driverId: liveDriver2,
      pickupLat: p2.lat,
      pickupLon: p2.lon,
      pickupAddress: randPick(ADDRESSES),
      dropoffLat: d2.lat,
      dropoffLon: d2.lon,
      dropoffAddress: randPick(ADDRESSES),
      passengerCount: 1,
      distanceKm: 2.1,
      status: "matched",
      fareAmount: 35.0,
      matchedAt: new Date(now - 60_000),
      createdAt: new Date(now - 90_000),
    });
    tripsCreated++;

    // One brand-new unmatched request.
    const p3 = randCoord();
    const d3 = randCoord();
    await db.insert(tripsTable).values({
      passengerId: randPick(passengerIds),
      pickupLat: p3.lat,
      pickupLon: p3.lon,
      pickupAddress: randPick(ADDRESSES),
      dropoffLat: d3.lat,
      dropoffLon: d3.lon,
      dropoffAddress: randPick(ADDRESSES),
      passengerCount: 1,
      status: "requested",
      createdAt: new Date(now - 20_000),
    });
    tripsCreated++;

    console.log(`  ✓ Created ${tripsCreated} trips across the last 14 days`);
  }

  // ---- 4. incidents -------------------------------------------------------

  console.log("\n=== Seeding incidents ===");
  const existingIncidents = await db.select().from(incidentReportsTable);
  if (existingIncidents.length > 0) {
    console.log("  Incidents already exist — skipping.");
  } else {
    const incidents: Array<{
      type: string;
      severity: string;
      status: string;
      description: string;
      reporterId: string;
      ageMinutes: number;
      resolved?: boolean;
    }> = [
      {
        type: "flood",
        severity: "medium",
        status: "open",
        description: "Street flooding reported near Pudtol town proper after heavy rain.",
        reporterId: randPick(driverIds),
        ageMinutes: 15,
      },
      {
        type: "accident",
        severity: "high",
        status: "reviewing",
        description: "Minor collision between e-trike and motorcycle near Luna Public Market.",
        reporterId: randPick(driverIds),
        ageMinutes: 120,
      },
      {
        type: "fleet_issue",
        severity: "low",
        status: "resolved",
        description: "E-trike battery indicator malfunction reported by driver.",
        reporterId: randPick(driverIds),
        ageMinutes: 300,
        resolved: true,
      },
      {
        type: "flood",
        severity: "low",
        status: "resolved",
        description: "Minor ponding along Conner-Luna road, passable to all vehicles.",
        reporterId: randPick(passengerIds),
        ageMinutes: 600,
        resolved: true,
      },
      {
        type: "accident",
        severity: "critical",
        status: "open",
        description: "Vehicle skidded off the road in Calanasan due to slippery terrain.",
        reporterId: randPick(passengerIds),
        ageMinutes: 5,
      },
      {
        type: "fleet_issue",
        severity: "medium",
        status: "reviewing",
        description: "Tire pressure warning on unit APY-1004, driver pulled over for inspection.",
        reporterId: randPick(driverIds),
        ageMinutes: 900,
      },
      {
        type: "flood",
        severity: "high",
        status: "open",
        description: "Impassable flooding along the Kabugao access road after continuous rain.",
        reporterId: randPick(driverIds),
        ageMinutes: 45,
      },
      {
        type: "accident",
        severity: "low",
        status: "resolved",
        description: "Passenger reported a minor bump while boarding; no injuries.",
        reporterId: randPick(passengerIds),
        ageMinutes: 4300,
        resolved: true,
      },
      {
        type: "fleet_issue",
        severity: "low",
        status: "open",
        description: "Dashcam not recording on unit APY-1002, flagged for maintenance.",
        reporterId: randPick(driverIds),
        ageMinutes: 60,
      },
    ];

    for (const inc of incidents) {
      const coord = randCoord();
      const createdAt = new Date(Date.now() - inc.ageMinutes * 60_000);
      await db.insert(incidentReportsTable).values({
        reporterId: inc.reporterId,
        type: inc.type,
        lat: coord.lat,
        lon: coord.lon,
        severity: inc.severity,
        description: inc.description,
        status: inc.status,
        createdAt,
        resolvedAt: inc.resolved ? new Date(createdAt.getTime() + 30 * 60_000) : undefined,
        resolvedBy: inc.resolved ? randPick(driverIds) : undefined,
      });
    }
    console.log(`  ✓ Created ${incidents.length} incidents`);
  }

  // ---- 5. loop routes -----------------------------------------------------

  console.log("\n=== Seeding loop routes ===");
  const existingRoutes = await db.select().from(loopRoutesTable);
  if (existingRoutes.length > 0) {
    console.log("  Loop routes already exist — skipping.");
  } else {
    const routesData = [
      {
        name: "Luna Town Loop",
        description: "Circular route covering the Luna town center, market, and terminal.",
        baseFare: 15,
        stops: [
          { name: "Luna Municipal Hall", seq: 1 },
          { name: "Luna Public Market", seq: 2 },
          { name: "Luna Bus Terminal", seq: 3 },
          { name: "Luna National High School", seq: 4 },
        ],
        driverId: driverIds[0],
      },
      {
        name: "Conner Loop",
        description: "Connects Conner poblacion with nearby barangays — high demand route.",
        baseFare: 20,
        stops: [
          { name: "Conner Poblacion", seq: 1 },
          { name: "Conner Public Market", seq: 2 },
          { name: "Malama Crossing", seq: 3 },
        ],
        driverId: driverIds[1],
      },
    ];

    for (const r of routesData) {
      const [route] = await db
        .insert(loopRoutesTable)
        .values({ name: r.name, description: r.description, baseFare: r.baseFare, isActive: true })
        .returning();

      let firstStopId: number | undefined;
      for (const stop of r.stops) {
        const coord = randCoord();
        const [stopRow] = await db
          .insert(loopStopsTable)
          .values({ routeId: route.id, name: stop.name, sequence: stop.seq, lat: coord.lat, lon: coord.lon })
          .returning();
        if (stop.seq === 1) firstStopId = stopRow.id;
      }

      const coord = randCoord();
      await db.insert(loopVehiclesTable).values({
        routeId: route.id,
        driverId: r.driverId,
        status: "on_route",
        currentLat: coord.lat,
        currentLon: coord.lon,
        currentStopId: firstStopId,
      });

      console.log(`  ✓ ${r.name} (${r.stops.length} stops)`);
    }
  }

  // ---- 6. audit logs -------------------------------------------------------

  console.log("\n=== Seeding audit logs ===");
  const existingLogs = await db.select().from(auditLogsTable);
  if (existingLogs.length > 0) {
    console.log("  Audit logs already exist — skipping.");
  } else {
    // Audit logs record admin actions, so find (or create) an admin actor.
    const [existingAdmin] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.role, "admin"));
    let adminId: string;
    if (existingAdmin) {
      adminId = existingAdmin.id;
    } else {
      adminId = await ensureAuthUser("admin.demo@moveapayao.test");
      const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, adminId));
      if (!existing) {
        await db.insert(usersTable).values({
          id: adminId,
          email: "admin.demo@moveapayao.test",
          fullName: "Demo Admin",
          role: "admin",
        });
      }
      console.log("  No admin account found — created admin.demo@moveapayao.test as log actor.");
    }

    const auditEntries: Array<{ action: string; targetUserId?: string; amount?: number; metadata: object; ageMinutes: number }> = [
      {
        action: "wallet.topup",
        targetUserId: randPick(passengerIds),
        amount: 500,
        metadata: { method: "manual_admin_credit", reason: "Customer support goodwill credit" },
        ageMinutes: 40,
      },
      {
        action: "wallet.refund",
        targetUserId: randPick(passengerIds),
        amount: 45,
        metadata: { reason: "Cancelled trip overcharge", tripId: null },
        ageMinutes: 130,
      },
      {
        action: "driver.suspend",
        targetUserId: randPick(driverIds),
        metadata: { reason: "Pending incident investigation" },
        ageMinutes: 200,
      },
      {
        action: "driver.reinstate",
        targetUserId: randPick(driverIds),
        metadata: { reason: "Investigation cleared" },
        ageMinutes: 190,
      },
      {
        action: "subscription.cancel",
        targetUserId: randPick(passengerIds),
        metadata: { reason: "User requested cancellation" },
        ageMinutes: 300,
      },
      {
        action: "incident.resolve",
        targetUserId: undefined,
        metadata: { reason: "Confirmed resolved after site visit" },
        ageMinutes: 320,
      },
      {
        action: "wallet.topup",
        targetUserId: randPick(passengerIds),
        amount: 300,
        metadata: { method: "manual_admin_credit", reason: "Payment provider webhook delay" },
        ageMinutes: 500,
      },
      {
        action: "user.deactivate",
        targetUserId: randPick(passengerIds),
        metadata: { reason: "Reported for policy violation" },
        ageMinutes: 700,
      },
    ];

    for (const entry of auditEntries) {
      await db.insert(auditLogsTable).values({
        actorUserId: adminId,
        action: entry.action,
        targetUserId: entry.targetUserId,
        amount: entry.amount,
        metadata: entry.metadata,
        createdAt: new Date(Date.now() - entry.ageMinutes * 60_000),
      });
    }
    console.log(`  ✓ Created ${auditEntries.length} audit log entries`);
  }

  console.log("\n✅ Demo data seeded successfully.");
  console.log(`\nAll seeded accounts use the password: ${DEMO_PASSWORD}`);
  console.log("\nDriver app login (any of):");
  DRIVERS.forEach((d) => console.log(`  ${d.email}`));
  console.log("\nPassenger app login (any of):");
  PASSENGERS.forEach((p) => console.log(`  ${p.email}`));
  console.log("");

  process.exit(0);
}

main().catch((err) => {
  console.error("\nSeed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
