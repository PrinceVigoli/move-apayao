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

const getEmailArgument = (): string | undefined => {
  const argument = process.argv
    .slice(2)
    .find((value) => value.startsWith("--email="));
  return argument?.slice("--email=".length).trim().toLowerCase() || undefined;
};

const readHidden = (label: string): Promise<string> => {
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
};

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is missing from artifacts/api-server/.env.local or .env.",
    );
  }

  const [{ and, eq, inArray }, { db, hashPassword, usersTable }] = await Promise.all([
    import("drizzle-orm"),
    import("@workspace/db"),
  ]);

  const requestedEmail = getEmailArgument();
  const admins = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      isActive: usersTable.isActive,
    })
    .from(usersTable)
    .where(inArray(usersTable.role, ["admin", "superadmin", "developer"]));

  const admin = requestedEmail
    ? admins.find(
        (candidate) => candidate.email.toLowerCase() === requestedEmail,
      )
    : admins.length === 1
      ? admins[0]
      : undefined;

  if (!admin) {
    if (admins.length === 0) {
      throw new Error("No admin account exists in the database.");
    }

    if (requestedEmail) {
      throw new Error(`No admin account exists for ${requestedEmail}.`);
    }

    const emails = admins.map((candidate) => candidate.email).join(", ");
    throw new Error(
      `Multiple admin accounts exist (${emails}). Re-run with --email=address.`,
    );
  }

  if (!admin.isActive) {
    throw new Error(`The admin account ${admin.email} is inactive.`);
  }

  console.log(`\nSetting dashboard password for ${admin.email}`);
  const password = await readHidden("New password: ");

  if (password.length < 8 || password.length > 200) {
    throw new Error("Password must contain between 8 and 200 characters.");
  }

  const confirmation = await readHidden("Confirm password: ");
  if (password !== confirmation) {
    throw new Error("Passwords do not match. No changes were made.");
  }

  const passwordHash = await hashPassword(password);
  const [updated] = await db
    .update(usersTable)
    .set({ passwordHash, updatedAt: new Date() })
    .where(
      and(
        eq(usersTable.id, admin.id),
        inArray(usersTable.role, ["admin", "superadmin", "developer"]),
      ),
    )
    .returning({ email: usersTable.email });

  if (!updated) {
    throw new Error("The admin account changed before it could be updated.");
  }

  console.log(`Password configured successfully for ${updated.email}.`);
  console.log("You can now sign in to the dashboard.\n");
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(
      `\nAdmin password setup failed: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exit(1);
  });
