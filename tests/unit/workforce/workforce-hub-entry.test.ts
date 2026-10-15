import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { resolveWorkforceHubHref } from '@/modules/workforce/domain/workforce-hub-entry';

describe('resolveWorkforceHubHref', () => {
  it('returns null when no workforce permissions apply', () => {
    const href = resolveWorkforceHubHref(
      () => false,
      () => false,
    );
    expect(href).toBeNull();
  });

  it('prefers employees when workforce read is granted', () => {
    const href = resolveWorkforceHubHref(
      (key) => key === PERMISSIONS.WORKFORCE_READ,
      () => false,
    );
    expect(href).toBe('/workforce/employees');
  });

  it('routes to time when only time manage is granted', () => {
    const href = resolveWorkforceHubHref(
      (key) => key === PERMISSIONS.TIME_MANAGE,
      () => false,
    );
    expect(href).toBe('/workforce/time');
  });
});
