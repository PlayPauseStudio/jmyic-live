// Load .env for local development. On Railway the variables are already in the
// environment and this is a no-op (it never overwrites what is already set).
import 'dotenv/config';
import { z } from 'zod';

/**
 * Central, validated view of process.env. Import `env` anywhere; never read
 * process.env directly elsewhere. Fails fast at boot on invalid config.
 */
const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Unset: the Firebase Hosting site in production, localhost in dev.
  ALLOWED_ORIGINS: z
    .string()
    .default(
      process.env.NODE_ENV === 'production'
        ? 'https://jmyic-live.web.app,https://jmyic-live.firebaseapp.com'
        : 'http://localhost:3000',
    )
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim().replace(/\/$/, ''))
        .filter(Boolean),
    ),

  JWT_SECRET: z.string().min(1).default('dev-insecure-secret-change-me'),
  OPERATOR_PASSWORD_HASH: z.string().optional(),
  OPERATOR_PASSWORD: z.string().optional(),
  OPERATOR_JWT_TTL: z.string().default('12h'),

  /**
   * Optional shared secret for the big screen. Leave UNSET and /audience
   * connects with no credential (the display view already hides the guest's
   * answer). Set it to also require `?key=…` on the display URL.
   */
  DISPLAY_KEY: z.string().optional(),

  /** Enough on its own to verify phone ID tokens (no service account needed). */
  // Defaults to the show's project in production; unset in dev = accept any token as the uid.
  FIREBASE_PROJECT_ID: z
    .string()
    .optional()
    .transform((v) => v || (process.env.NODE_ENV === 'production' ? 'jmyic-live' : undefined)),
  FIREBASE_SERVICE_ACCOUNT_B64: z.string().optional(),

  REDIS_URL: z.string().optional(),
  // How often to check for changes worth saving to Redis. Unchanged state is
  // never rewritten, so this is the most a crash can lose, not a write rate.
  SNAPSHOT_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';

// A production server must not run with the dev defaults: anyone could mint an
// operator token with the public default secret.
if (isProd) {
  const problems: string[] = [];
  if (env.JWT_SECRET === 'dev-insecure-secret-change-me' || env.JWT_SECRET.length < 32)
    problems.push('JWT_SECRET must be a random string of at least 32 characters');
  if (!env.OPERATOR_PASSWORD_HASH) problems.push('OPERATOR_PASSWORD_HASH is required');
  if (problems.length) {
    // eslint-disable-next-line no-console
    console.error('Refusing to start in production:', problems);
    process.exit(1);
  }
}
