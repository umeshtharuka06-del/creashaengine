import "dotenv/config";
import { createAllRounds } from "../src/runner";
import { log } from "../src/logger";
import { prisma } from "../src/db";

/**
 * One-shot: ensure the current/next round exists for every game, then exit.
 * Useful for cron (e.g. a safety net) or manual runs. The settle-worker does
 * this continuously; you normally do not need to run this by hand.
 */
async function main() {
  log.engine("create-rounds.start");
  await createAllRounds();
  log.engine("create-rounds.done");
}

main()
  .catch((e) => {
    log.error("create-rounds.failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
