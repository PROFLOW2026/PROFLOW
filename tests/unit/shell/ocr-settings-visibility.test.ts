import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { OrgContext } from '@/shared/auth/context';
import {
  accessibleSections,
  SETTINGS_SECTIONS,
} from '@/app/[locale]/(app)/settings/_lib/access';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';

function contextWith(permissions: readonly PermissionKey[]): OrgContext {
  return {
    userId: 'user-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    organization: {
      id: 'org-1',
      name: 'Test',
      baseCurrency: 'ILS',
      timezone: 'Asia/Jerusalem',
      countryCode: 'IL',
      defaultLocale: 'he-IL',
    },
    permissions: new Set(permissions),
    roleKeys: [],
    db: {} as OrgContext['db'],
    locale: 'he-IL',
  };
}

describe('OCR settings visibility', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('hides OCR from Settings nav when OCR_INGESTION_ENABLED is off', () => {
    vi.stubEnv('OCR_INGESTION_ENABLED', '');
    const ocr = SETTINGS_SECTIONS.find((section) => section.key === 'ocr')!;
    expect(ocr.hideFromNav).toBe(true);

    const context = contextWith([PERMISSIONS.SETTINGS_MANAGE]);
    expect(accessibleSections(context).some((section) => section.key === 'ocr')).toBe(false);
  });

  it('lists OCR in Settings nav when ingestion is enabled and the user can manage settings', () => {
    vi.stubEnv('OCR_INGESTION_ENABLED', 'true');
    const context = contextWith([PERMISSIONS.SETTINGS_MANAGE]);
    expect(accessibleSections(context).some((section) => section.key === 'ocr')).toBe(true);
  });

  it('does not list OCR for users without settings.manage even when enabled', () => {
    vi.stubEnv('OCR_INGESTION_ENABLED', 'true');
    const context = contextWith([PERMISSIONS.ORG_READ]);
    expect(accessibleSections(context).some((section) => section.key === 'ocr')).toBe(false);
  });

  it('Settings OCR page does not embed provider secrets', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/app/[locale]/(app)/settings/ocr/page.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(/OCR_PROVIDER_API_KEY|Ocp-Apim-Subscription-Key/);
    expect(source).toMatch(/azureOcrNeedsKeyAndEndpoint/);
    expect(source).toMatch(/\/documents\/ocr-review/);
  });
});
