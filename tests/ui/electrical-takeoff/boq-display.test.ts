import { describe, expect, it } from 'vitest';
import { boqLineDisplayLabel, boqLineStatus, detectionDisplayLabel } from '@/modules/electrical-takeoff/ui/boq-display';
import type { BoqLine, CatalogType } from '@/modules/electrical-takeoff/domain/contracts';

const catalog: CatalogType[] = [
  {
    key: 'power.socket.single',
    nameHe: 'שקע',
    category: 'power',
    role: 'device',
    unit: "יח'",
    keywordsHe: [],
    colorHex: '#2563eb',
    builtIn: true,
    archived: false,
  },
];

function line(partial: Partial<BoqLine>): BoqLine {
  return {
    key: 'k',
    typeKey: 'power.socket.single',
    label: 'p1#1',
    category: 'power',
    lineKind: 'device_count',
    unit: "יח'",
    quantity: 1,
    floor: null,
    areaId: null,
    ruleId: 'default',
    detectionIds: ['a'],
    breakdown: { high: 1, medium: 0, low: 0, unclassified: 0, userAdded: 0, userConfirmed: 0 },
    verified: false,
    excluded: false,
    ...partial,
  };
}

describe('boqLineDisplayLabel', () => {
  it('prefers catalog Hebrew name over technical ids', () => {
    expect(boqLineDisplayLabel(line({ label: 'p1#1' }), catalog, 'לא מסווג')).toBe('שקע');
  });

  it('shows unclassified label when type is missing', () => {
    expect(boqLineDisplayLabel(line({ typeKey: null, label: 'p2#3' }), catalog, 'לא מסווג — לבדיקה')).toBe(
      'לא מסווג — לבדיקה',
    );
  });

  it('does not present a raw block name as the device type', () => {
    expect(
      boqLineDisplayLabel(line({ typeKey: null, label: 'SOCKET_BLOCK — לבדיקה' }), catalog, 'לא מסווג — לבדיקה'),
    ).toBe('לא מסווג — לבדיקה');
    expect(boqLineStatus(line({ typeKey: null, verified: true }), false)).toBe('forReview');
  });

  it('uses the catalog Hebrew name on a typed detection', () => {
    expect(
      detectionDisplayLabel(
        { id: 'p1#1', typeKey: 'power.socket.single', rawClass: 'BLOCK_SOCKET' },
        catalog,
        'לא מסווג — לבדיקה',
      ),
    ).toBe('שקע');
    expect(
      detectionDisplayLabel({ id: 'p1#4', typeKey: null, rawClass: 'BLOCK_SOCKET', tagText: 'T22' }, catalog, 'לא מסווג — לבדיקה'),
    ).toBe('לא מסווג — לבדיקה');
  });
});