import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { PUBLIC_ENV_EXAMPLE_KEYS, assertNoSecretPublicEnv } from '@/shared/env/public';
import {
  SERVER_ENV_EXAMPLE_KEYS,
  resetServerEnvCache,
  serverEnv,
} from '@/shared/env/server';

describe('serverEnv', () => {
  afterEach(() => {
    delete process.env.APP_ENV;
    delete process.env.APP_URL;
    delete process.env.DATABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.WEBHOOK_SECRET_KEK;
    delete process.env.EMAIL_DRIVER;
    delete process.env.RESEND_API_KEY;
    delete process.env.LOG_LEVEL;
    resetServerEnvCache();
  });

  it('accepts empty optional strings as unset', () => {
    process.env.DATABASE_URL = '';
    process.env.RESEND_API_KEY = '';
    resetServerEnvCache();
    const env = serverEnv();
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.EMAIL_DRIVER).toBe('console');
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('rejects production without DATABASE_URL', () => {
    process.env.APP_ENV = 'production';
    process.env.APP_URL = 'https://app.example.com';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-for-tests';
    process.env.WEBHOOK_SECRET_KEK = 'a'.repeat(64);
    delete process.env.DATABASE_URL;
    resetServerEnvCache();
    expect(() => serverEnv()).toThrow(/DATABASE_URL/);
  });

  it('rejects production without SUPABASE_SERVICE_ROLE_KEY', () => {
    process.env.APP_ENV = 'production';
    process.env.APP_URL = 'https://app.example.com';
    process.env.DATABASE_URL = 'postgres://example/db';
    process.env.WEBHOOK_SECRET_KEK = 'a'.repeat(64);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    resetServerEnvCache();
    expect(() => serverEnv()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('rejects production without WEBHOOK_SECRET_KEK', () => {
    process.env.APP_ENV = 'production';
    process.env.APP_URL = 'https://app.example.com';
    process.env.DATABASE_URL = 'postgres://example/db';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-for-tests';
    delete process.env.WEBHOOK_SECRET_KEK;
    resetServerEnvCache();
    expect(() => serverEnv()).toThrow(/WEBHOOK_SECRET_KEK/);
  });

  it('rejects production localhost APP_URL', () => {
    process.env.APP_ENV = 'production';
    process.env.APP_URL = 'http://localhost:3000';
    process.env.DATABASE_URL = 'postgres://example/db';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-for-tests';
    process.env.WEBHOOK_SECRET_KEK = 'a'.repeat(64);
    resetServerEnvCache();
    expect(() => serverEnv()).toThrow(/localhost/);
  });

  it('rejects production non-HTTPS APP_URL', () => {
    process.env.APP_ENV = 'production';
    process.env.APP_URL = 'http://app.example.com';
    process.env.DATABASE_URL = 'postgres://example/db';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-for-tests';
    process.env.WEBHOOK_SECRET_KEK = 'a'.repeat(64);
    resetServerEnvCache();
    expect(() => serverEnv()).toThrow(/HTTPS/);
  });

  it('requires RESEND_API_KEY when EMAIL_DRIVER=resend in production', () => {
    process.env.APP_ENV = 'production';
    process.env.APP_URL = 'https://app.example.com';
    process.env.DATABASE_URL = 'postgres://example/db';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-for-tests';
    process.env.WEBHOOK_SECRET_KEK = 'a'.repeat(64);
    process.env.EMAIL_DRIVER = 'resend';
    delete process.env.RESEND_API_KEY;
    resetServerEnvCache();
    expect(() => serverEnv()).toThrow(/RESEND_API_KEY/);
  });
});

describe('public env secret guard', () => {
  it('rejects NEXT_PUBLIC_ names that look like secrets', () => {
    expect(() =>
      assertNoSecretPublicEnv({
        NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: 'leak',
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/SERVICE_ROLE/);
  });

  it('allows anon and app public keys', () => {
    expect(() =>
      assertNoSecretPublicEnv({
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public',
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      } as unknown as NodeJS.ProcessEnv),
    ).not.toThrow();
  });
});

describe('.env.example parity', () => {
  it('documents server and public contract keys', async () => {
    const example = await readFile(path.resolve(process.cwd(), '.env.example'), 'utf8');
    for (const key of SERVER_ENV_EXAMPLE_KEYS) {
      expect(example, key).toContain(key);
    }
    for (const key of PUBLIC_ENV_EXAMPLE_KEYS) {
      expect(example, key).toContain(key);
    }
  });
});
