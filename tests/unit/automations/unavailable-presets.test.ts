import { describe, expect, it } from 'vitest';
import { defaultActionsForPreset } from '@/modules/automations/domain/safe-actions';
import {
  isUnavailableAutomationPreset,
  UNAVAILABLE_AUTOMATION_PRESETS,
} from '@/modules/automations/domain/types';

describe('unavailable automation presets', () => {
  it('keeps event presets without a scan from looking runnable', () => {
    for (const key of UNAVAILABLE_AUTOMATION_PRESETS) {
      expect(isUnavailableAutomationPreset(key)).toBe(true);
    }
    expect(isUnavailableAutomationPreset('retention_release_date')).toBe(false);
    expect(isUnavailableAutomationPreset('task_overdue')).toBe(false);
    expect(isUnavailableAutomationPreset('task_dependency_resolved')).toBe(false);
    expect(isUnavailableAutomationPreset('warranty_expiring')).toBe(false);
  });

  it('defaults a new rule to notify and never to create_task', () => {
    const actions = defaultActionsForPreset();
    expect(actions).toEqual([{ kind: 'notify' }]);
    expect(actions.some((action) => action.kind === 'create_task')).toBe(false);
  });
});
