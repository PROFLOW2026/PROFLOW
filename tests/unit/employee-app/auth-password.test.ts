import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('employeeSupabaseAuthPassword', () => {
  const original = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key-for-employee-auth-pepper';
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY = original;
    }
  });

  it('never stores the raw PIN alone', async () => {
    const { employeeSupabaseAuthPassword } = await import(
      '@/modules/employee-app/domain/auth-password'
    );
    const material = employeeSupabaseAuthPassword('123456');
    expect(material).not.toBe('123456');
    expect(material.startsWith('123456\u0000')).toBe(true);
  });
});
