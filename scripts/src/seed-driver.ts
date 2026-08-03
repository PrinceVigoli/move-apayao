/**
 * Seeds a fully-usable DRIVER account for local testing — no need to go
 * through the driver app's signup screen (and no email-confirmation wait).
 *
 * What it does, mirroring exactly what POST /api/auth/register does for a
 * driver sign-up:
 *   1. Creates (or updates) the account directly in Postgres, with the
 *      password hashed the same way the API server hashes it.
 *   2. Inserts the matching row in `users` (role: driver).
 *   3. Inserts a `fare_wallets` row (every user gets one, even drivers).
 *   4. Inserts a 1-year `subscriptions` row (same as real registration).
 *   5. Inserts the `driver_profiles` row with vehicle details.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run seed:driver -- \
 *     --email=juan@example.com --password=testpass123 --name="Juan Dela Cruz" \
 *     --plate="ABC 1234" --vehicle=jeepney --capacity=12 --license=N01-23-456789 --color=Red
 *
 * Required env vars (reads from artifacts/api-server/.env.local automatically):
 *   DATABASE_URL
 *
 * The account is created with email/password — log into the DRIVER app with
 * the same credentials. No confirmation email needed since email_confirm is
 * set to true.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Reuse the same secrets the API server already has — no separate .env
// needed just for this script.
dotenv.config({ path: path.resolve(__dirname, "../../artifacts/api-server/.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../../artifacts/api-server/.env") });

function parseArgs(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

async function main() {
  const args = parseArgs();

  const email = args.email ?? "driver1@moveapayao.test";
  const password = args.password ?? "TestDriver123!";
  const fullName = args.name ?? "Test Driver";
  const phone = args.phone;
  const vehicleType = args.vehicle ?? "e-trike";
  const plateNumber = args.plate ?? "TEST-0001";
  const vehicleColor = args.color ?? "Blue";
  const licenseNumber = args.license ?? "N00-00-000000";
  // Same defaults as artifacts/api-server/src/lib/vehicle-capacity.ts —
  // override with --capacity=N to test group-booking matching against a
  // specific seat count regardless of vehicle type.
  const defaultCapacityByType: Record<string, number> = {
    "e-trike": 4,
    tricycle: 4,
    jeepney: 12,
    van: 15,
  };
  const capacity = args.capacity
    ? parseInt(args.capacity, 10)
    : (defaultCapacityByType[vehicleType.toLowerCase()] ?? 4);

  // Import after env is loaded (the db module reads DATABASE_URL at init).
  const { db, usersTable, driverProfilesTable, fareWalletsTable, subscriptionsTable, hashPassword } =
    await import("@workspace/db");
  const { eq } = await import("drizzle-orm");

  console.log(`\nSeeding driver account: ${email} (${vehicleType}, capacity ${capacity})`);

  const passwordHash = await hashPassword(password);

  // Find an existing account by email, otherwise create one. Auth lives in
  // this project's own Postgres, so there is no external auth service to
  // keep in step.
  const [found] = await db.select().from(usersTable).where(eq(usersTable.email, email));

  let authUserId: string;
  if (found) {
    authUserId = found.id;
    console.log(`  users row exists (role: ${found.role}) — updating role, name and password.`);
    await db
      .update(usersTable)
      .set({ role: "driver", fullName, phone, passwordHash, updatedAt: new Date() })
      .where(eq(usersTable.id, authUserId));
  } else {
    const [created] = await db
      .insert(usersTable)
      .values({ email, phone, passwordHash, fullName, role: "driver" })
      .returning();
    authUserId = created!.id;
    console.log(`  Inserted users row (role: driver): ${authUserId}`);
  }

  // Wallet, subscription and driver profile
  const [existingWallet] = await db
    .select()
    .from(fareWalletsTable)
    .where(eq(fareWalletsTable.userId, authUserId));
  if (!existingWallet) {
    await db.insert(fareWalletsTable).values({ userId: authUserId });
    console.log("  Inserted fare_wallets row.");
  }

  const [existingSub] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, authUserId));
  if (!existingSub) {
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    await db.insert(subscriptionsTable).values({
      userId: authUserId,
      plan: "annual",
      status: "active",
      startsAt: now,
      expiresAt,
    });
    console.log("  Inserted subscriptions row (1-year active).");
  }

  const [existingProfile] = await db
    .select()
    .from(driverProfilesTable)
    .where(eq(driverProfilesTable.userId, authUserId));
  if (existingProfile) {
    await db
      .update(driverProfilesTable)
      .set({ vehicleType, capacity, plateNumber, vehicleColor, licenseNumber, updatedAt: new Date() })
      .where(eq(driverProfilesTable.userId, authUserId));
    console.log("  Updated existing driver_profiles row.");
  } else {
    await db.insert(driverProfilesTable).values({
      userId: authUserId,
      vehicleType,
      capacity,
      plateNumber,
      vehicleColor,
      licenseNumber,
    });
    console.log("  Inserted driver_profiles row.");
  }

  console.log("\nDone. Log into the DRIVER app with:");
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log("\n(Accounts are stored in this project's own Postgres — no email confirmation step.)\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("\nSeed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});