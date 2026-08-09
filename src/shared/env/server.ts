import 'server-only';
import { z } from 'zod';

/**
 * Server-only environment contract.
 *
 * Importing this module from a client component is a build error thanks to
 * `server-only`, which is the guard that keeps the service-role key and the
 * database URL out of the browser bundle (doc 74 §6).
 */

const optionalUrl = z.union([z.string().url(), z.literal('')]).optional();

const serverEnvSchema = z.object({
  APP_ENV: z.enum(['local', 'preview', 'production']).default('local'),
  APP_URL: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1).optional(),
  DIRECT_DATABASE_URL: z.string().min(1).optional(),
  TEST_DATABASE_URL: z.string().min(1).optional(),

  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  SUPABASE_STORAGE_BUCKET: z.string().min(1).default('documents'),
  DOCUMENTS_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(26_214_400),

  EMAIL_DRIVER: z.enum(['console', 'resend']).default('console'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().min(1).default('ProjectFlow <no-reply@example.com>'),

  SENTRY_DSN: optionalUrl,
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

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
    const missing: string[] = [];
    if (!env.DATABASE_URL) missing.push('DATABASE_URL');
    if (missing.length > 0) {
      throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
    }
    if (env.EMAIL_DRIVER === 'resend' && !env.RESEND_API_KEY) {
      throw new Error('EMAIL_DRIVER=resend requires RESEND_API_KEY');
    }
  }

  cached = env;
  return env;
}

/** True when a database connection string is configured for this process. */
export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
