import 'server-only';
import { z } from 'zod';

/**
 * Server-only environment contract.
 *
 * Importing this module from a client component is a build error thanks to
 * `server-only`, which is the guard that keeps the service-role key and the
 * database URL out of the browser bundle (doc 74 §6).
 */

const emptyToUndefined = (value: unknown) =>
  value === '' || value === undefined || value === null ? undefined : value;

const optionalNonEmpty = z.preprocess(emptyToUndefined, z.string().min(1).optional());
const optionalUrl = z.preprocess(
  emptyToUndefined,
  z.union([z.string().url(), z.undefined()]).optional(),
);

const serverEnvSchema = z.object({
  APP_ENV: z.preprocess(emptyToUndefined, z.enum(['local', 'preview', 'production']).default('local')),
  APP_URL: z.preprocess(
    emptyToUndefined,
    z.string().url().default('http://localhost:3000'),
  ),

  DATABASE_URL: optionalNonEmpty,
  DIRECT_DATABASE_URL: optionalNonEmpty,
  TEST_DATABASE_URL: optionalNonEmpty,
  DATABASE_POOL_MAX: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().max(50).default(5),
  ),

  SUPABASE_SERVICE_ROLE_KEY: optionalNonEmpty,

  SUPABASE_STORAGE_BUCKET: z.preprocess(
    emptyToUndefined,
    z.string().min(1).default('documents'),
  ),
  DOCUMENTS_MAX_UPLOAD_BYTES: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().default(26_214_400),
  ),

  EMAIL_DRIVER: z.preprocess(
    emptyToUndefined,
    z.enum(['console', 'resend']).default('console'),
  ),
  RESEND_API_KEY: optionalNonEmpty,
  EMAIL_FROM: z.preprocess(
    emptyToUndefined,
    z.string().min(1).default('ProjectFlow <no-reply@example.com>'),
  ),

  SENTRY_DSN: optionalUrl,
  LOG_LEVEL: z.preprocess(
    emptyToUndefined,
    z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  ),

  /**
   * OCR ingestion feature gate (OFF by default). Live OCR also needs a non-stub
   * OCR_PROVIDER plus credentials — see src/modules/ocr/SCHEMA_REQUEST.md.
   */
  OCR_INGESTION_ENABLED: z.preprocess(emptyToUndefined, z.string().optional()),
  OCR_PROVIDER: z.preprocess(emptyToUndefined, z.string().optional()),
  /** Present ⇒ OCR adapter may call a provider; unset keeps the stub inert. */
  OCR_PROVIDER_API_KEY: optionalNonEmpty,
  OCR_PROVIDER_ENDPOINT: optionalUrl,
  OCR_PROVIDER_MODEL: z.preprocess(emptyToUndefined, z.string().optional()),
  OCR_ALLOW_FIXTURE: z.preprocess(emptyToUndefined, z.string().optional()),


  /**
   * KEK for sealing webhook signing secrets at rest.
   * Required in production — must not be derived from the service-role key.
   */
  WEBHOOK_SECRET_KEK: optionalNonEmpty,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

function assertProductionGuards(env: ServerEnv): void {
  const missing: string[] = [];
  if (!env.DATABASE_URL) missing.push('DATABASE_URL');
  if (!env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!env.WEBHOOK_SECRET_KEK) missing.push('WEBHOOK_SECRET_KEK');
  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
  }

  if (/localhost|127\.0\.0\.1/i.test(env.APP_URL)) {
    throw new Error('APP_ENV=production forbids localhost APP_URL');
  }

  if (!/^https:\/\//i.test(env.APP_URL)) {
    throw new Error('APP_ENV=production requires HTTPS APP_URL');
  }

  if (env.EMAIL_DRIVER === 'resend' && !env.RESEND_API_KEY) {
    throw new Error('EMAIL_DRIVER=resend requires RESEND_API_KEY');
  }
}

export function serverEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid server environment configuration:\n${parsed.error.issues
        .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
        .join('\n')}`,
    );
  }

  const env = parsed.data;
  if (env.APP_ENV === 'production') {
    assertProductionGuards(env);
  }

  cached = env;
  return env;
}

/** Test seam — clears the memoized parse so env mutations are visible. */
export function resetServerEnvCache(): void {
  cached = null;
}

/** True when a database connection string is configured for this process. */
export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/** Keys documented in `.env.example` that belong to the server contract. */
export const SERVER_ENV_EXAMPLE_KEYS = [
  'APP_ENV',
  'APP_URL',
  'DATABASE_URL',
  'DIRECT_DATABASE_URL',
  'DATABASE_POOL_MAX',
  'TEST_DATABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_STORAGE_BUCKET',
  'DOCUMENTS_MAX_UPLOAD_BYTES',
  'EMAIL_DRIVER',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'SENTRY_DSN',
  'LOG_LEVEL',
  'OCR_INGESTION_ENABLED',
  'OCR_PROVIDER',
  'OCR_PROVIDER_API_KEY',
  'OCR_PROVIDER_ENDPOINT',
  'OCR_PROVIDER_MODEL',
  'OCR_ALLOW_FIXTURE',
  'WEBHOOK_SECRET_KEK',
] as const;
