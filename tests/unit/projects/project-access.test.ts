import { describe, expect, it } from 'vitest';
import { isAccessibleProjectId } from '@/modules/projects/application/project-access';
import { parseProjectAccessMode } from '@/modules/projects/domain/project-access';

describe('parseProjectAccessMode', () => {
  it('defaults to selected when setting is absent (SEC-006 app layer)', () => {
    expect(parseProjectAccessMode(null)).toBe('selected');
    expect(parseProjectAccessMode(undefined)).toBe('selected');
    expect(parseProjectAccessMode({ other: true })).toBe('selected');
  });

  it('accepts string and object forms', () => {
    expect(parseProjectAccessMode('selected')).toBe('selected');
    expect(parseProjectAccessMode('all')).toBe('all');
    expect(parseProjectAccessMode({ mode: 'assigned' })).toBe('assigned');
  });
});

describe('isAccessibleProjectId', () => {
  it('treats a null allow-list as unrestricted', () => {
    expect(isAccessibleProjectId(null, 'any')).toBe(true);
  });

  it('keeps org-level rows without a project visible', () => {
    expect(isAccessibleProjectId(['a'], null)).toBe(true);
    expect(isAccessibleProjectId(['a'], undefined)).toBe(true);
  });

  it('hides projects outside the allow-list', () => {
    expect(isAccessibleProjectId(['a'], 'a')).toBe(true);
    expect(isAccessibleProjectId(['a'], 'b')).toBe(false);
  });
});
