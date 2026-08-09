import { z } from 'zod';

/**
 * Values that are safe to reach the browser. Anything added here ships in the
 * client bundle, so it must never contain a secret.
 */

const emptyToUndefined = (value: unknown) =>
  value === '' || value === undefined || value === null ? undefined : value;

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.preprocess(
    emptyToUndefined,
    z.string().url().default('http://localhost:3000'),
  ),
  NEXT_PUBLIC_SUPABASE_URL: z.preprocess(emptyToUndefined, z.string().optional()),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  NEXT_PUBLIC_SENTRY_DSN: z.preprocess(emptyToUndefined, z.string().optional()),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

const FORBIDDEN_PUBLIC_KEY = /SERVICE_ROLE|SECRET|PRIVATE_KEY|DATABASE_URL|PASSWORD|API_KEY/i;

/**
 * Hard stop if a secret-shaped name is ever prefixed with NEXT_PUBLIC_.
 * Catches misconfiguration before a client bundle ships credentials.
 */
export function assertNoSecretPublicEnv(
  env: NodeJS.ProcessEnv = process.env,
): void {
  for (const key of Object.keys(env)) {
    if (!key.startsWith('NEXT_PUBLIC_')) continue;
    if (FORBIDDEN_PUBLIC_KEY.test(key)) {
      throw new Error(
        `Refusing to expose secret-shaped variable via public env: ${key}. Use a server-only name (doc 74 §6).`,
      );
    }
  }
}

assertNoSecretPublicEnv();

// Next.js inlines `process.env.NEXT_PUBLIC_*` at build time only for literal
// property access, so the object cannot be built dynamically.
const raw = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
};

export const publicEnv: PublicEnv = publicEnvSchema.parse(raw);

export function hasSupabaseAuthConfig(): boolean {
  return Boolean(publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export const PUBLIC_ENV_EXAMPLE_KEYS = [
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SENTRY_DSN',
] as const;
