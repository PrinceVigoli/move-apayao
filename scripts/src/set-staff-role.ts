import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const directory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(directory, "../../artifacts/api-server/.env.local") });
dotenv.config({ path: path.resolve(directory, "../../artifacts/api-server/.env") });

const values = Object.fromEntries(
  process.argv.slice(2).flatMap((argument) => {
    const match = /^--([^=]+)=(.+)$/.exec(argument);
    return match ? [[match[1]!, match[2]!.trim()]] : [];
  }),
);

const email = values.email?.toLowerCase();
const role = values.role;
const allowedRoles = ["admin", "superadmin", "developer"] as const;

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  if (!email) throw new Error("Use --email=person@example.com");
  if (!allowedRoles.includes(role as (typeof allowedRoles)[number])) {
    throw new Error("Use --role=admin, --role=superadmin, or --role=developer");
  }

  const [{ eq }, { db, refreshTokensTable, usersTable }] = await Promise.all([
    import("drizzle-orm"),
    import("@workspace/db"),
  ]);

  const result = await db.transaction(async (trx) => {
    const [existing] = await trx.select().from(usersTable).where(eq(usersTable.email, email));
    if (!existing) return null;
    if (!existing.isActive) throw new Error("The target account is inactive");
    const [updated] = await trx
      .update(usersTable)
      .set({ role: role!, updatedAt: new Date() })
      .where(eq(usersTable.id, existing.id))
      .returning({ email: usersTable.email, role: usersTable.role });
    await trx.delete(refreshTokensTable).where(eq(refreshTokensTable.userId, existing.id));
    return { previousRole: existing.role, updated: updated! };
  });

  if (!result) throw new Error(`No account exists for ${email}`);
  console.log(
    `Role changed for ${result.updated.email}: ${result.previousRole} -> ${result.updated.role}. Existing sessions were revoked.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });

