import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canAccessSection, SETTINGS_SECTIONS } from '@/app/[locale]/(app)/settings/_lib/access';
import { listAccountingIntegrations } from '@/modules/integrations';
import type { OrgContext } from '@/shared/auth/context';
import { AuthorizationError } from '@/shared/errors';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';

const REVOKED_READS = [
  'integration_entity_mappings',
  'integration_sync_jobs',
  'integrationEntityMappings',
  'integrationSyncJobs',
  'listIntegrationMappings',
  'listRecentSyncJobs',
] as const;

const PAGE_PATH_FILES = [
  'src/modules/integrations/application/list-integrations.ts',
  'src/modules/integrations/data/integrations.repository.ts',
  'src/modules/integrations/index.ts',
  'src/app/[locale]/(app)/settings/integrations/page.tsx',
  'src/app/[locale]/(app)/integrations/page.tsx',
] as const;

function context(permissions: ReadonlySet<PermissionKey>): { actor: OrgContext; wasRead: () => boolean } {
  let touched = false;
  const db = new Proxy(
    {},
    {
      get() {
        touched = true;
        throw new Error('user-role database read');
      },
    },
  ) as OrgContext['db'];
  return {
    wasRead: () => touched,
    actor: {
      userId: 'user-1',
      organizationId: 'org-1',
      membershipId: 'mem-1',
      locale: 'he-IL',
      db,
      organization: { id: 'org-1', name: 'Org', timezone: 'Asia/Jerusalem' } as OrgContext['organization'],
      permissions,
      roleKeys: ['owner'],
    },
  };
}

describe('settings integrations skips revoked user-role reads', () => {
  it('returns the settings catalog for a reader without querying the database', async () => {
    const { actor, wasRead } = context(
      new Set([PERMISSIONS.INTEGRATIONS_READ, PERMISSIONS.SETTINGS_MANAGE]),
    );
    const result = await listAccountingIntegrations(actor);
    expect(wasRead()).toBe(false);
    expect(result).toEqual({
      catalog: [],
      adapterConnected: false,
      canManage: true,
    });
  });

  it('rejects a user without integrations.read before any database read', async () => {
    const { actor, wasRead } = context(new Set([PERMISSIONS.ORG_READ]));
    await expect(listAccountingIntegrations(actor)).rejects.toBeInstanceOf(AuthorizationError);
    expect(wasRead()).toBe(false);
  });

  it('keeps the settings section gate on integrations.read', () => {
    const section = SETTINGS_SECTIONS.find((item) => item.key === 'integrations');
    expect(section?.permission).toBe(PERMISSIONS.INTEGRATIONS_READ);
    const allowed = context(new Set([PERMISSIONS.INTEGRATIONS_READ]));
    const denied = context(new Set([PERMISSIONS.ORG_READ]));
    expect(canAccessSection(allowed.actor, section!)).toBe(true);
    expect(canAccessSection(denied.actor, section!)).toBe(false);
    expect(allowed.wasRead()).toBe(false);
    expect(denied.wasRead()).toBe(false);
  });

  it('does not mention the revoked tables on the settings page path', () => {
    for (const file of PAGE_PATH_FILES) {
      const source = readFileSync(file, 'utf8');
      for (const token of REVOKED_READS) {
        expect(source, `${file} still references ${token}`).not.toContain(token);
      }
    }
  });
});