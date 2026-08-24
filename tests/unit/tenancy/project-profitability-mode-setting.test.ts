import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROJECT_PROFITABILITY_MODE,
  PROJECT_PROFITABILITY_MODE_SETTING_KEY,
  PROJECT_PROFITABILITY_MODES,
  isProjectProfitabilityMode,
  parseProjectProfitabilityMode,
} from '@/modules/tenancy/domain/project-profitability-mode';

describe('project_profitability_mode organization setting', () => {
  it('uses stable setting key and three allowed display modes', () => {
    expect(PROJECT_PROFITABILITY_MODE_SETTING_KEY).toBe('project_profitability_mode');
    expect([...PROJECT_PROFITABILITY_MODES]).toEqual(['direct', 'include_general', 'both']);
    expect(DEFAULT_PROJECT_PROFITABILITY_MODE).toBe('direct');
  });

  it('parses known modes and falls back to direct', () => {
    for (const mode of PROJECT_PROFITABILITY_MODES) {
      expect(isProjectProfitabilityMode(mode)).toBe(true);
      expect(parseProjectProfitabilityMode(mode)).toBe(mode);
      expect(parseProjectProfitabilityMode({ mode })).toBe(mode);
    }
    expect(isProjectProfitabilityMode('full_actual')).toBe(false);
    expect(parseProjectProfitabilityMode('full_actual')).toBe('direct');
    expect(parseProjectProfitabilityMode(null)).toBe('direct');
  });
});
