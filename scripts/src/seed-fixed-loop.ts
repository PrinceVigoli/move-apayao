import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import dotenv from "dotenv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(root, "artifacts/api-server/.env.local") });
dotenv.config({ path: path.join(root, "artifacts/api-server/.env") });

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  const { db, usersTable, driverProfilesTable, fareWalletsTable, subscriptionsTable, hashPassword, verifyPassword } =
    await import("@workspace/db");
  const { eq } = await import("drizzle-orm");
  const email = "fixedloop.pudtol-luna@moveapayao.test";
  const fullName = "Pudtol–Luna Fixed Loop";
  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
  if (existing) {
    console.log("Account already exists; no credentials or account details were changed.");
    return;
  }

  const credentialPath = path.join(root, "local-secrets/pudtol-luna-fixed-loop.json");
  await mkdir(path.dirname(credentialPath), { recursive: true });
  let password: string;
  try {
    const previous: unknown = JSON.parse(await readFile(credentialPath, "utf8"));
    if (!previous || typeof previous !== "object" || !("email" in previous) || previous.email !== email || !("password" in previous) || typeof previous.password !== "string" || previous.password.length < 24) {
      throw new Error("Existing credential file is invalid; no account was created.");
    }
    password = previous.password;
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    password = randomBytes(24).toString("base64url");
    await writeFile(credentialPath, JSON.stringify({ email, password, fullName }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  }
  const passwordHash = await hashPassword(password);
  // Exclusive creation preserves any credentials from a previous attempt.
  // Keep this ignored local file even on failure so a committed account never
  // loses its credentials if the database connection drops during commit.

  const id = await db.transaction(async (tx) => {
    const [user] = await tx.insert(usersTable).values({ email, fullName, passwordHash, role: "driver" }).returning({ id: usersTable.id });
    if (!user) throw new Error("Account creation returned no user.");
    await tx.insert(driverProfilesTable).values({
      userId: user.id,
      vehicleType: "e-jeepney",
      capacity: 29,
      approvalStatus: "approved",
      isOnShift: false,
      isAvailable: false,
    });
    await tx.insert(fareWalletsTable).values({ userId: user.id });
    const startsAt = new Date();
    const expiresAt = new Date(startsAt);
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    await tx.insert(subscriptionsTable).values({ userId: user.id, plan: "annual", status: "active", startsAt, expiresAt });
    return user.id;
  });

  const [saved] = await db.select({ passwordHash: usersTable.passwordHash, role: usersTable.role }).from(usersTable).where(eq(usersTable.id, id));
  const [profile] = await db.select().from(driverProfilesTable).where(eq(driverProfilesTable.userId, id));
  if (!saved?.passwordHash || !(await verifyPassword(password, saved.passwordHash)) || saved.role !== "driver" || profile?.capacity !== 29 || profile.isOnShift || profile.isAvailable) {
    throw new Error("Account was created but verification failed; inspect before using.");
  }
  console.log(`Created and verified dedicated driver account: ${email}`);
  console.log(`Credentials saved to ${credentialPath}`);
  console.log("Capacity: 29 total. Configure the fixed-loop service separately to enable its 19 seated / 10 standing reservation inventory.");
  console.log("Account is off duty. No route, timetable, or live dispatch was changed.");
}

main().then(() => process.exit(0)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Fixed-loop account creation failed.");
  if (error instanceof Error && error.cause && typeof error.cause === "object" && "code" in error.cause) {
    console.error(`Database error code: ${String(error.cause.code)}`);
  }
  process.exit(1);
});
