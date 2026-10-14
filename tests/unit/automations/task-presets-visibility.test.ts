import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_PRESET_KEYS,
  isUnavailableAutomationPreset,
  UNAVAILABLE_AUTOMATION_PRESETS,
} from '@/modules/automations/domain/types';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { listAutomationPresets } from '@/modules/automations/application/manage';

describe('task automation preset visibility', () => {
  it('marks non-functional task presets unavailable', () => {
    for (const preset of UNAVAILABLE_AUTOMATION_PRESETS) {
      expect(AUTOMATION_PRESET_KEYS).toContain(preset);
      expect(isUnavailableAutomationPreset(preset)).toBe(true);
    }
  });

  it('marks unavailable presets as not selectable', async () => {
    const { presets } = await listAutomationPresets({
      db: {} as never,
      organizationId: 'org',
      userId: 'user',
      membershipId: 'mem',
      organization: {
        id: 'org',
        name: 'Org',
        timezone: 'UTC',
        defaultLocale: 'en',
        baseCurrency: 'ILS',
        countryCode: 'IL',
      },
      permissions: new Set([PERMISSIONS.AUTOMATIONS_READ]),
      roleKeys: [],
      locale: 'en',
    });

    for (const blocked of UNAVAILABLE_AUTOMATION_PRESETS) {
      const row = presets.find((preset) => preset.presetKey === blocked);
      expect(row?.available).toBe(false);
      expect(row?.enabled).toBe(false);
    }
  });
});
