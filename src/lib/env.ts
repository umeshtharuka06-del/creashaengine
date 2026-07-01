import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────
// Environment validation & secrets hygiene (infrastructure only — no business
// logic). Fails fast in production when required secrets are missing, too weak,
// or still set to a known dev/example placeholder.
// ────────────────────────────────────────────────────────────────────────────

const isProd = process.env.NODE_ENV === "production";

// Known insecure placeholders that must never reach production.
const FORBIDDEN_IN_PROD = new Set([
  "dev-insecure-secret-change-me",
  "dev-only-jwt-secret-please-change-in-production-0123456789abcdef",
  "dev-only-fair-secret-please-change-in-production-fedcba9876543210",
  "change-me-to-a-64+-char-random-secret",
  "change-me-to-another-long-random-secret",
  "change-me-to-a-long-random-secret",
]);

const strongSecret = (name: string) =>
  z
    .string({ required_error: `${name} is required` })
    .min(isProd ? 32 : 1, `${name} must be at least 32 characters in production`)
    .refine(
      (v) => !isProd || !FORBIDDEN_IN_PROD.has(v),
      `${name} must not use a known dev/example value in production`
    );

export const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  DATABASE_URL: z
    .string({ required_error: "DATABASE_URL is required" })
    .refine((v) => /^mongodb(\+srv)?:\/\//.test(v), "DATABASE_URL must be a mongodb connection string"),
  JWT_SECRET: strongSecret("JWT_SECRET"),
  FAIR_SECRET: strongSecret("FAIR_SECRET"),
  // Optional infrastructure wiring.
  REDIS_URL: z.string().regex(/^rediss?:\/\//, "REDIS_URL must start with redis:// or rediss://").optional(),
  CRON_SECRET: z.string().min(isProd ? 16 : 0).optional(),
  TRONGRID_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export type ValidateResult =
  | { ok: true; data: Env }
  | { ok: false; errors: string[] };

/** Validate process.env (or a supplied object). Never throws. */
export function validateEnv(env: NodeJS.ProcessEnv = process.env): ValidateResult {
  const parsed = envSchema.safeParse(env);
  if (parsed.success) return { ok: true, data: parsed.data };
  const errors = parsed.error.issues.map(
    (i) => `${i.path.join(".") || "(root)"}: ${i.message}`
  );
  return { ok: false, errors };
}
