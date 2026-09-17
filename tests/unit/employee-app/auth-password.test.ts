import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetServerEnvCache } from '@/shared/env/server';

describe('employeeSupabaseAuthPassword', () => {
  const original = {
    serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
    storageKek: process.env.STORAGE_TOKEN_ENCRYPTION_KEY,
    webhookKek: process.env.WEBHOOK_SECRET_KEK,
    dedicated: process.env.EMPLOYEE_AUTH_PASSWORD_PEPPER,
    appEnv: process.env.APP_ENV,
  };

  beforeEach(() => {
    resetServerEnvCache();
    process.env.APP_ENV = 'local';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key-for-employee-auth-pepper';
    process.env.STORAGE_TOKEN_ENCRYPTION_KEY = 'storage-kek-for-employee-auth';
    delete process.env.WEBHOOK_SECRET_KEK;
    delete process.env.EMPLOYEE_AUTH_PASSWORD_PEPPER;
  });

  afterEach(() => {
    resetServerEnvCache();
    if (original.serviceRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = original.serviceRole;
    if (original.storageKek === undefined) delete process.env.STORAGE_TOKEN_ENCRYPTION_KEY;
    else process.env.STORAGE_TOKEN_ENCRYPTION_KEY = original.storageKek;
    if (original.webhookKek === undefined) delete process.env.WEBHOOK_SECRET_KEK;
    else process.env.WEBHOOK_SECRET_KEK = original.webhookKek;
    if (original.dedicated === undefined) delete process.env.EMPLOYEE_AUTH_PASSWORD_PEPPER;
    else process.env.EMPLOYEE_AUTH_PASSWORD_PEPPER = original.dedicated;
    if (original.appEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = original.appEnv;
  });

  it('never stores the raw PIN alone', async () => {
    const { employeeSupabaseAuthPassword } = await import('@/modules/employee-app/domain/auth-password');
    const material = employeeSupabaseAuthPassword('123456');
    expect(material).not.toBe('123456');
    expect(material.startsWith('123456\u0000')).toBe(true);
  });

  it('uses the same derived pepper for activate, reset, and login paths', async () => {
    const {
      employeeSupabaseAuthPassword,
      employeeAuthPepperSourceFingerprint,
    } = await import('@/modules/employee-app/domain/auth-password');
    const first = employeeSupabaseAuthPassword('111111');
    const second = employeeSupabaseAuthPassword('222222');
    expect(first.slice(first.indexOf('\0') + 1)).toBe(second.slice(second.indexOf('\0') + 1));
    expect(employeeAuthPepperSourceFingerprint()).toMatch(/^[0-9a-f]{12}$/);
  });

  it('prefers STORAGE_TOKEN_ENCRYPTION_KEY over service role in local dev', async () => {
    const { employeeSupabaseAuthPassword, resolveEmployeeAuthPepperMaterial } = await import(
      '@/modules/employee-app/domain/auth-password'
    );
    expect(resolveEmployeeAuthPepperMaterial()).toBe('storage-kek-for-employee-auth');
    expect(employeeSupabaseAuthPassword('123456')).not.toContain('test-service-role');
  });
});
