import { describe, expect, it } from 'vitest';
import { canReuseNestedOrgRequestFrame } from '@/shared/auth/org-context-nesting';

describe('canReuseNestedOrgRequestFrame (BUG-012)', () => {
  it('reuses only when nested org matches the target org', () => {
    expect(canReuseNestedOrgRequestFrame('org-a', 'org-a')).toBe(true);
  });

  it('does not reuse when target org differs (multi-org switcher badges)', () => {
    expect(canReuseNestedOrgRequestFrame('org-active', 'org-other')).toBe(false);
  });

  it('does not reuse when there is no nested frame', () => {
    expect(canReuseNestedOrgRequestFrame(undefined, 'org-a')).toBe(false);
  });
});
