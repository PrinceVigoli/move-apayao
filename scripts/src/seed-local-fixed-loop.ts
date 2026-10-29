import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import dotenv from "dotenv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(root, "artifacts/api-server/.env.local") });
dotenv.config({ path: path.join(root, "artifacts/api-server/.env") });

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (process.env.LOCAL_FIXED_LOOP_TEST !== "1" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !url.pathname.startsWith("/move_apayao_validation")) {
    throw new Error("This fixture is restricted to explicitly opted-in local validation databases.");
  }
  const { db, usersTable, driverProfilesTable, fareWalletsTable, subscriptionsTable, loopRoutesTable, loopVehiclesTable, fixedLoopServicesTable, hashPassword, verifyPassword } = await import("@workspace/db");
  const { eq, sql } = await import("drizzle-orm");
  await db.execute(sql`select 1`);
  const credentialPath = path.join(root, "local-secrets/fixed-loop-local-test.json");
  type Account = { email: string; password: string; fullName: string };
  type Credentials = { operator: Account; admin: Account; passengers: Account[] };
  let credentials: Credentials;
  try { credentials = JSON.parse(await readFile(credentialPath, "utf8")) as Credentials; }
  catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    const account = (name: string, fullName: string): Account => ({ email: `${name}@moveapayao.test`, password: randomBytes(24).toString("hex"), fullName });
    credentials = { operator: account("fixedloop.localtest", "Local Test E-jeep Operator"), admin: account("operations.localtest", "Local Test Operations"), passengers: Array.from({ length: 6 }, (_, i) => account(`passenger${i+1}.localtest`, `Local Test Passenger ${i+1}`)) };
    await mkdir(path.dirname(credentialPath), { recursive: true });
    await writeFile(credentialPath, JSON.stringify(credentials, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  }
  if (!credentials.operator?.password || !credentials.admin?.password || credentials.passengers?.length !== 6) throw new Error("Invalid local test credential file.");
  async function ensureAccount(account: Account, role: "driver" | "admin" | "passenger") {
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, account.email));
    if (existing) {
      if (existing.role !== role || !existing.passwordHash || !(await verifyPassword(account.password, existing.passwordHash))) throw new Error("Existing test account does not match the preserved credentials.");
      return existing.id;
    }
    const passwordHash = await hashPassword(account.password);
    return db.transaction(async tx => {
      const [user] = await tx.insert(usersTable).values({ email: account.email, passwordHash, fullName: account.fullName, role, termsAcceptedAt: new Date(), termsVersion: "2026-08-27" }).returning();
      await tx.insert(fareWalletsTable).values({ userId: user!.id });
      if (role === "driver") {
        await tx.insert(driverProfilesTable).values({ userId: user!.id, vehicleType: "e-jeepney", capacity: 29, approvalStatus: "approved", isOnShift: false, isAvailable: false });
        const startsAt = new Date(), expiresAt = new Date(startsAt); expiresAt.setFullYear(expiresAt.getFullYear()+1);
        await tx.insert(subscriptionsTable).values({ userId: user!.id, plan: "annual", status: "active", startsAt, expiresAt });
      }
      return user!.id;
    });
  }
  const operatorId = await ensureAccount(credentials.operator, "driver");
  await ensureAccount(credentials.admin, "admin");
  for (const passenger of credentials.passengers) await ensureAccount(passenger, "passenger");
  const [priorRoute] = await db.select().from(loopRoutesTable).where(eq(loopRoutesTable.name, "LOCAL TEST Pudtol–Luna Fixed Loop"));
  const route = priorRoute ?? (await db.insert(loopRoutesTable).values({ name: "LOCAL TEST Pudtol–Luna Fixed Loop", description: "Isolated validation fixture; not a live published service." }).returning())[0]!;
  const [priorVehicle] = await db.select().from(loopVehiclesTable).where(eq(loopVehiclesTable.driverId, operatorId));
  const vehicle = priorVehicle ?? (await db.insert(loopVehiclesTable).values({ routeId: route.id, driverId: operatorId, status: "off_duty" }).returning())[0]!;
  const market = { key: "pudtol_market", name: "Pudtol Public Market" };
  const dagupan = { key: "dagupan_gym", name: "Dagupan Gym, Luna, Apayao" };
  const school = { key: "luna_nhs", name: "Luna National High School, Luna, Apayao" };
  // Coordinates reused from the existing public local loop configuration.
  // Unverified stop pins remain absent rather than being invented.
  const capitol = { key: "capitol", name: "Apayao Provincial Capitol, San Isidro Sur, Luna, Apayao", lat: 18.3311841, lon: 121.372348 };
  const asc = { key: "asc", name: "Apayao State College, Luna, Apayao", lat: 18.3321469, lon: 121.3779476 };
  const tumog = { key: "tumog_nhs", name: "Tumog National High School, Luna, Apayao" };
  const [priorService] = await db.select().from(fixedLoopServicesTable).where(eq(fixedLoopServicesTable.key, "pudtol-luna"));
  if (priorService && priorService.vehicleId !== vehicle.id) throw new Error("A different vehicle is already configured; no assignment was changed.");
  if (!priorService) await db.insert(fixedLoopServicesTable).values({ key: "pudtol-luna", name: "Pudtol–Luna Fixed Loop", vehicleId: vehicle.id, unitLabel: "LOCAL TEST E-JEEP · Unit 01", enabled: true, outboundStops: [market, dagupan, school, capitol, asc], returnStops: [asc, tumog, dagupan, market] });
  console.log("Prepared local-only e-jeep operator, admin, six passengers, and fixed-loop service.");
  console.log("Vehicle remains off duty with no fabricated GPS. Credentials are preserved in ignored local-secrets/fixed-loop-local-test.json.");
}
main().then(()=>process.exit(0)).catch((error: unknown)=>{ console.error(error instanceof Error ? error.message : "Local fixture failed"); process.exit(1); });
