import { afterEach, describe, expect, it, vi } from 'vitest';

const redirectMock = vi.fn((value: unknown) => {
  throw value;
});

const signOutMock = vi.fn(async () => ({ error: null }));

vi.mock('@/shared/i18n/navigation', () => ({
  redirect: (value: unknown) => redirectMock(value),
}));

vi.mock('@/shared/supabase/server', () => ({
  isSupabaseConfigured: () => true,
  createSupabaseServerClient: async () => ({
    auth: { signOut: signOutMock },
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getLocale: async () => 'he-IL',
}));

describe('employeeSignOutAction', () => {
  afterEach(() => {
    redirectMock.mockClear();
    signOutMock.mockClear();
  });

  it(
    'signs out and redirects to employee login',
    async () => {
      const { employeeSignOutAction } = await import('@/app/[locale]/employee/actions');

      await expect(employeeSignOutAction()).rejects.toEqual({
        href: '/employee/login',
        locale: 'he-IL',
      });
      expect(signOutMock).toHaveBeenCalledOnce();
      expect(redirectMock).toHaveBeenCalledWith({ href: '/employee/login', locale: 'he-IL' });
    },
    15_000,
  );
});
