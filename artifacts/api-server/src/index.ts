import app from "./app";
import { logger } from "./lib/logger";
import { startPoller } from "./lib/poller";
import { loadTelegramConfigFromDb } from "./lib/telegram";

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

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  try {
    await loadTelegramConfigFromDb();
  } catch (err) {
    logger.error({ err }, "Failed to load Telegram config from DB");
  }

  try {
    await startPoller();
  } catch (pollerErr) {
    logger.error({ err: pollerErr }, "Failed to start poller");
  }
});
