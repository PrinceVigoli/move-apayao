/**
 * Seeds a fully-usable DRIVER account for local testing — no need to go
 * through the driver app's signup screen (and no email-confirmation wait).
 *
 * What it does, mirroring exactly what POST /api/auth/register does for a
 * driver sign-up:
 *   1. Creates a Supabase Auth user with the email pre-confirmed
 *      (admin.createUser({ email_confirm: true })).
 *   2. Inserts the matching row in `users` (role: driver).
 *   3. Inserts a `fare_wallets` row (every user gets one, even drivers).
 *   4. Inserts a 1-year `subscriptions` row (same as real registration).
 *   5. Inserts the `driver_profiles` row with vehicle details.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run seed:driver -- \
 *     --email=juan@example.com --password=testpass123 --name="Juan Dela Cruz" \
 *     --plate="ABC 1234" --vehicle=e-trike --license=N01-23-456789 --color=Red
 *
 * Required env vars (reads from artifacts/api-server/.env.local automatically):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL
 *
 * The account is created with email/password — log into the DRIVER app with
 * the same credentials. No confirmation email needed since email_confirm is
 * set to true.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

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

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error(
      "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.\n" +
        "Make sure artifacts/api-server/.env.local has both set.",
    );
    process.exit(1);
  }

  // Import the db package only after env vars are loaded (it reads
  // DATABASE_URL at module init time).
  const { db, usersTable, driverProfilesTable, fareWalletsTable, subscriptionsTable } =
    await import("@workspace/db");
  const { eq } = await import("drizzle-orm");

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`\nSeeding driver account: ${email}`);

  // 1. Create (or reuse) the Supabase Auth user, pre-confirmed.
  let authUserId: string;
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError) {
    if (createError.message.toLowerCase().includes("already been registered")) {
      console.log("  Auth user already exists — looking it up...");
      const { data: list, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) throw listError;
      const existing = list.users.find((u) => u.email === email);
      if (!existing) throw new Error(`Could not find existing auth user for ${email}`);
      authUserId = existing.id;
    } else {
      throw createError;
    }
  } else {
    authUserId = created.user.id;
    console.log(`  Created Supabase auth user: ${authUserId}`);
  }

  // 2-5. Upsert the app-side rows in one go.
  const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.id, authUserId));

  if (existingUser) {
    console.log(`  users row already exists (role: ${existingUser.role}) — updating role/name.`);
    await db
      .update(usersTable)
      .set({ role: "driver", fullName, phone, updatedAt: new Date() })
      .where(eq(usersTable.id, authUserId));
  } else {
    await db.insert(usersTable).values({
      id: authUserId,
      email,
      fullName,
      phone,
      role: "driver",
    });
    console.log("  Inserted users row (role: driver).");
  }

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
      .set({ vehicleType, plateNumber, vehicleColor, licenseNumber, updatedAt: new Date() })
      .where(eq(driverProfilesTable.userId, authUserId));
    console.log("  Updated existing driver_profiles row.");
  } else {
    await db.insert(driverProfilesTable).values({
      userId: authUserId,
      vehicleType,
      plateNumber,
      vehicleColor,
      licenseNumber,
    });
    console.log("  Inserted driver_profiles row.");
  }

  console.log("\nDone. Log into the DRIVER app with:");
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log("\n(Email is pre-confirmed — no confirmation link needed.)\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("\nSeed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});