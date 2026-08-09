import { describe, expect, it } from 'vitest';
import {
  parseModuleVisibilityMode,
  resolveModuleVisibility,
} from '@/modules/tenancy/domain/types';

describe('parseModuleVisibilityMode (settings features form)', () => {
  it('maps on / true to enabled', () => {
    expect(parseModuleVisibilityMode('on')).toBe(true);
    expect(parseModuleVisibilityMode('true')).toBe(true);
  });

  it('maps off / false to disabled', () => {
    expect(parseModuleVisibilityMode('off')).toBe(false);
    expect(parseModuleVisibilityMode('false')).toBe(false);
  });

  it('maps auto and unknown to null (usage-based)', () => {
    expect(parseModuleVisibilityMode('auto')).toBeNull();
    expect(parseModuleVisibilityMode(null)).toBeNull();
    expect(parseModuleVisibilityMode(undefined)).toBeNull();
    expect(parseModuleVisibilityMode('maybe')).toBeNull();
  });
});

describe('resolveModuleVisibility persistence', () => {
  it('honors explicit on even without first use', () => {
    const visibility = resolveModuleVisibility([
      { moduleKey: 'changes', enabled: true, firstUsedAt: null },
    ]);
    expect(visibility.changes).toBe(true);
  });

  it('honors explicit off even after first use', () => {
    const visibility = resolveModuleVisibility([
      { moduleKey: 'billing', enabled: false, firstUsedAt: new Date('2026-01-01') },
    ]);
    expect(visibility.billing).toBe(false);
  });

  it('falls back to firstUsedAt when enabled is null (auto)', () => {
    const used = resolveModuleVisibility([
      { moduleKey: 'documents', enabled: null, firstUsedAt: new Date('2026-01-01') },
    ]);
    const unused = resolveModuleVisibility([
      { moduleKey: 'documents', enabled: null, firstUsedAt: null },
    ]);
    expect(used.documents).toBe(true);
    expect(unused.documents).toBe(false);
  });
});
