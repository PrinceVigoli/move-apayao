import app from "./app";
import { logger } from "./lib/logger";
import { startTripSweeper } from "./lib/trip-sweeper";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Background rescue loop for trips that couldn't be matched at booking
  // time (retries matching, expires stale requests). See lib/trip-sweeper.ts.
  startTripSweeper();
});
