import "dotenv/config";
import { processAllRounds } from "../src/runner";
import { log } from "../src/logger";
import { prisma } from "../src/db";

/**
 * One-shot: settle every due round across all games, then exit.
 * Useful for cron or manual runs. The settle-worker does this continuously.
 */
async function main() {
  log.engine("process-rounds.start");
  await processAllRounds();
  log.engine("process-rounds.done");
}

main()
  .catch((e) => {
    log.error("process-rounds.failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
