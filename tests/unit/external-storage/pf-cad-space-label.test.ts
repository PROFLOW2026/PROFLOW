import {
  cadSpaceSelectorAriaLabel,
  formatCadSpaceLabel,
  legacyCadSpaceLabel,
} from '@/modules/external-storage/ui/cad/pf-cad/cad-space-label';
import { describe, expect, it } from 'vitest';

describe('formatCadSpaceLabel', () => {
  it('maps model space in English', () => {
    expect(formatCadSpaceLabel('*Model_Space')).toBe('Model');
  });

  it('maps paper space with index in English', () => {
    expect(formatCadSpaceLabel('*Paper_Space0')).toBe('Layout 0');
    expect(formatCadSpaceLabel('*Paper_Space2')).toBe('Layout 2');
  });

  it('legacyCadSpaceLabel matches historical replace rules', () => {
    expect(legacyCadSpaceLabel('*Model_Space')).toBe('Model');
    expect(legacyCadSpaceLabel('*Paper_Space0')).toBe('Layout 0');
  });

  it('cadSpaceSelectorAriaLabel is English', () => {
    expect(cadSpaceSelectorAriaLabel()).toBe('Model or layout');
  });
});
