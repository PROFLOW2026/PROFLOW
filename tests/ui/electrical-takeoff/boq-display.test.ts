import { describe, expect, it } from 'vitest';
import { boqLineDisplayLabel, boqLineStatus, detectionCensus, detectionDisplayLabel, groupBoqLinesForDisplay, groupDetectionsForControl } from '@/modules/electrical-takeoff/ui/boq-display';
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

describe('detectionCensus', () => {
  it('keeps a typed mark that still needs a check out of the untyped count', () => {
    const rows = [
      ...Array.from({ length: 74 }, () => ({ typeKey: 'light.recessed', needsReview: false })),
      ...Array.from({ length: 23 }, () => ({ typeKey: 'light.recessed', needsReview: true })),
      ...Array.from({ length: 77 }, () => ({ typeKey: null, needsReview: true })),
    ];
    expect(detectionCensus(rows)).toEqual({
      total: 174,
      typed: 97,
      untyped: 77,
      typedNeedingCheck: 23,
    });
  });
});

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

describe('groupDetectionsForControl', () => {
  it('collapses identical marks into one row and keeps items that need a check first', () => {
    const rows = [
      { id: 'a', typeKey: 'power.socket.single', needsReview: false, tagText: null },
      { id: 'b', typeKey: 'power.socket.single', needsReview: false, tagText: 'X2' },
      { id: 'c', typeKey: null, needsReview: true, tagText: null },
      { id: 'd', typeKey: null, needsReview: true, tagText: null },
    ];
    const groups = groupDetectionsForControl(
      rows,
      (row) => (row.typeKey ? 'שקע' : 'לא מסווג'),
      (row) => (row.tagText === 'X2' ? 2 : 1),
    );
    expect(groups.map((group) => group.label)).toEqual(['לא מסווג', 'שקע']);
    expect(groupBoqLinesForDisplay(
      [line({ key: 'a', typeKey: null, quantity: 4, detectionIds: ['1'] }), line({ key: 'b', typeKey: null, quantity: 7, detectionIds: ['2'] })],
      catalog,
      'לא מסווג — לבדיקה',
      false,
    )).toMatchObject([{ label: 'לא מסווג — לבדיקה', quantity: 11, detectionIds: ['1', '2'] }]);
    expect(groups).toEqual([
      {
        key: 'check::לא מסווג',
        label: 'לא מסווג',
        quantity: 2,
        needsAttention: true,
        detectionIds: ['c', 'd'],
        focusId: 'c',
      },
      {
        key: 'ok::שקע',
        label: 'שקע',
        quantity: 3,
        needsAttention: false,
        detectionIds: ['a', 'b'],
        focusId: 'a',
      },
    ]);
  });
});