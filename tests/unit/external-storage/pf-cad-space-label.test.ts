import { describe, expect, it } from 'vitest';
import {
  cadSpaceSelectorAriaLabel,
  formatCadSpaceLabel,
  legacyCadSpaceLabel,
} from '@/modules/external-storage/ui/cad/pf-cad/cad-space-label';

describe('formatCadSpaceLabel', () => {
  const t = Object.assign(
    (key: 'cadSpaceModel' | 'cadSpaceLayout' | 'cadSpaceSelector', values?: { name: string }) => {
      if (key === 'cadSpaceModel') return 'Model';
      if (key === 'cadSpaceSelector') return 'Model or layout';
      return `Layout ${values?.name ?? ''}`;
    },
    { has: () => true },
  );

  it('maps model space', () => {
    expect(formatCadSpaceLabel('*Model_Space', t)).toBe('Model');
  });

  it('maps paper space with index', () => {
    expect(formatCadSpaceLabel('*Paper_Space0', t)).toBe('Layout 0');
  });

  it('falls back without calling t when key missing', () => {
    const stub = Object.assign(() => 'should-not-run', { has: () => false });
    expect(formatCadSpaceLabel('*Model_Space', stub)).toBe('Model');
    expect(formatCadSpaceLabel('*Paper_Space0', stub)).toBe('Layout 0');
  });

  it('legacyCadSpaceLabel matches historical replace rules', () => {
    expect(legacyCadSpaceLabel('*Model_Space')).toBe('Model');
    expect(legacyCadSpaceLabel('*Paper_Space0')).toBe('Layout 0');
  });

  it('cadSpaceSelectorAriaLabel uses fallback when missing', () => {
    const stub = Object.assign(() => 'x', { has: () => false });
    expect(cadSpaceSelectorAriaLabel(stub)).toBe('Model or layout');
  });
});
