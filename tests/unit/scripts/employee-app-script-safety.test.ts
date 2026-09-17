import { afterEach, describe, expect, it, vi } from 'vitest';

describe('employee-app-script-safety', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('blocks production credential mutations without the explicit flag', async () => {
    process.env.APP_ENV = 'production';
    const { assertProdCredentialResetAllowed, PROD_CREDENTIAL_RESET_FLAG } = await import(
      '../../../scripts/lib/employee-app-script-safety'
    );

    expect(() => assertProdCredentialResetAllowed('test-script.ts', 'resetEmployeeAppPin')).toThrow(
      PROD_CREDENTIAL_RESET_FLAG,
    );
  });

  it('allows production credential mutations when the explicit flag is present', async () => {
    process.env.APP_ENV = 'production';
    process.argv = ['node', 'script.ts', '--allow-prod-credential-reset'];
    vi.resetModules();
    const { assertProdCredentialResetAllowed } = await import(
      '../../../scripts/lib/employee-app-script-safety'
    );

    expect(() => assertProdCredentialResetAllowed('test-script.ts', 'resetEmployeeAppPin')).not.toThrow();
  });

  it('detects production database targets from supabase URLs', async () => {
    process.env.APP_ENV = 'development';
    process.env.DATABASE_URL = 'postgres://user:pass@aws-0-eu-west-1.pooler.supabase.com:6543/postgres';
    vi.resetModules();
    const { isProductionCredentialTarget } = await import(
      '../../../scripts/lib/employee-app-script-safety'
    );
    expect(isProductionCredentialTarget()).toBe(true);
  });
});
