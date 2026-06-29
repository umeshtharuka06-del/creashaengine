// Standalone environment validator — used as a deploy-time gate and by the
// workers before they start. Exits non-zero on any validation failure.
//
//   npm run validate:env
//   docker compose run --rm --no-deps web npm run validate:env
import { validateEnv } from "../src/lib/env";

const result = validateEnv();
if (!result.ok) {
  console.error("✗ Environment validation failed:");
  for (const e of result.errors) console.error("  -", e);
  process.exit(1);
}
console.log("✓ Environment OK.");
