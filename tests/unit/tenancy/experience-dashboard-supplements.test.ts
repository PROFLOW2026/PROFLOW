import { describe, expect, it } from 'vitest';
import {
  ALL_CAPABILITIES_CARD_SUPPLEMENTS,
  selectAllCapabilitiesSupplements,
} from '@/modules/tenancy/domain/experience-dashboard-layout';

describe('selectAllCapabilitiesSupplements', () => {
  it('omits firstActions when owner quick actions are visible (default all_capabilities)', () => {
    const visible = (_id: string) => true;
    const supplements = selectAllCapabilitiesSupplements(visible);
    expect(supplements).not.toContain('firstActions');
    expect(supplements).toEqual(
      ALL_CAPABILITIES_CARD_SUPPLEMENTS.filter((card) => card !== 'firstActions'),
    );
  });

  it('includes firstActions when owner quick actions are hidden', () => {
    const visible = (id: string) => id !== 'owner.quickActions';
    const supplements = selectAllCapabilitiesSupplements(visible);
    expect(supplements).toContain('firstActions');
  });

  it('respects per-card visibility toggles', () => {
    const hidden = new Set(['card.serviceToday', 'owner.quickActions']);
    const visible = (id: string) => !hidden.has(id);
    const supplements = selectAllCapabilitiesSupplements(visible);
    expect(supplements).not.toContain('serviceToday');
    expect(supplements).toContain('firstActions');
  });
});
