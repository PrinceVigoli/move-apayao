import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({
  path: path.resolve(__dirname, "../../artifacts/api-server/.env.local"),
});
dotenv.config({
  path: path.resolve(__dirname, "../../artifacts/api-server/.env"),
});

function getEmailArgument(): string {
  const argument = process.argv
    .slice(2)
    .find((value) => value.startsWith("--email="));
  const email = argument?.slice("--email=".length).trim().toLowerCase();

  if (!email) {
    throw new Error("An explicit --email=address argument is required.");
  }

  return email;
}

function readHidden(label: string): Promise<string> {
  const input = process.stdin;
  const output = process.stdout;

  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== "function") {
    throw new Error("This command must be run in an interactive terminal.");
  }

  return new Promise((resolve, reject) => {
    let value = "";
    const wasRaw = input.isRaw;

    const cleanup = () => {
      input.off("data", onData);
      input.setRawMode(Boolean(wasRaw));
      input.pause();
    };

    const onData = (chunk: Buffer | string) => {
      for (const character of chunk.toString()) {
        if (character === "\u0003") {
          cleanup();
          output.write("\n");
          reject(new Error("Password update cancelled."));
          return;
        }

        if (character === "\r" || character === "\n") {
          cleanup();
          output.write("\n");
          resolve(value);
          return;
        }

        if (character === "\u007f" || character === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            output.write("\b \b");
          }
          continue;
        }

        if (character >= " ") {
          value += character;
          output.write("*");
        }
      }
    };

    output.write(label);
    input.setEncoding("utf8");
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is missing from artifacts/api-server/.env.local or .env.",
    );
  }

  const [
    { and, eq, isNull },
    {
      db,
      driverProfilesTable,
      hashPassword,
      passwordResetTokensTable,
      refreshTokensTable,
      usersTable,
    },
  ] = await Promise.all([import("drizzle-orm"), import("@workspace/db")]);

  const email = getEmailArgument();
  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      role: usersTable.role,
      isActive: usersTable.isActive,
    })
    .from(usersTable)
    .where(eq(usersTable.email, email));

  if (!user) {
    throw new Error(`No user account exists for ${email}.`);
  }

  if (!user.isActive) {
    throw new Error(`The account ${user.email} is inactive.`);
  }

  console.log(`\nSetting password for ${user.email} (${user.role})`);
  const password = await readHidden("New password: ");

  if (password.length < 8 || password.length > 200) {
    throw new Error("Password must contain between 8 and 200 characters.");
  }

  const confirmation = await readHidden("Confirm password: ");
  if (password !== confirmation) {
    throw new Error("Passwords do not match. No changes were made.");
  }

  const passwordHash = await hashPassword(password);
  const now = new Date();

  const updated = await db.transaction(async (trx) => {
    const [account] = await trx
      .update(usersTable)
      .set({ passwordHash, updatedAt: now })
      .where(and(eq(usersTable.id, user.id), eq(usersTable.email, email)))
      .returning({ email: usersTable.email });

    if (!account) return null;

    // A password reset ends existing sessions and invalidates older reset
    // links. This matches the public reset endpoint's security behavior.
    await trx
      .update(refreshTokensTable)
      .set({ revokedAt: now })
      .where(
        and(
          eq(refreshTokensTable.userId, user.id),
          isNull(refreshTokensTable.revokedAt),
        ),
      );
    await trx
      .update(passwordResetTokensTable)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResetTokensTable.userId, user.id),
          isNull(passwordResetTokensTable.usedAt),
        ),
      );
    await trx
      .update(driverProfilesTable)
      .set({ isOnShift: false, isAvailable: false, updatedAt: now })
      .where(eq(driverProfilesTable.userId, user.id));

    return account;
  });

  if (!updated) {
    throw new Error("The account changed before it could be updated.");
  }

  console.log(`Password configured successfully for ${updated.email}.`);
  console.log("Existing sessions and password-reset links were revoked.\n");
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(
      `\nUser password setup failed: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exit(1);
  });
