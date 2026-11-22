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
  {
    key: 'custom.control.stair',
    nameHe: 'לחצן חדר מדרגות',
    category: 'control',
    role: 'device',
    unit: "יח'",
    keywordsHe: [],
    colorHex: '#7f7f7f',
    builtIn: false,
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

  it('keeps the planner legend name even when a catalog type exists', () => {
    expect(
      boqLineDisplayLabel(
        line({ typeKey: 'power.socket.single', originalLabel: 'לחצן חדר מדרגות', identitySource: 'legend', label: 'לחצן חדר מדרגות' }),
        catalog,
        'לא מסווג',
      ),
    ).toBe('לחצן חדר מדרגות');
  });

  it('prefers a saved user label over the original legend sentence', () => {
    expect(
      boqLineDisplayLabel(
        line({
          typeKey: null,
          identitySource: 'legend',
          label: 'שקע יחיד מואר',
          originalLabel: 'תוצרת אלקטרולייט שקע יחיד',
        }),
        catalog,
        'לא מסווג',
      ),
    ).toBe('שקע יחיד מואר');
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
    expect(boqLineStatus(line({ typeKey: null, verified: true }), false)).toBe('manuallyApproved');
  });

  it('shows an org-custom accessory name', () => {
    expect(
      boqLineDisplayLabel(line({ typeKey: 'custom.control.stair', label: 'custom.control.stair' }), catalog, 'לא מסווג'),
    ).toBe('לחצן חדר מדרגות');
    expect(
      detectionDisplayLabel({ id: 'p1#9', typeKey: 'custom.control.stair' }, catalog, 'לא מסווג'),
    ).toBe('לחצן חדר מדרגות');
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
    expect(
      detectionDisplayLabel(
        { id: 'p1#8', typeKey: null, originalText: 'לחצן חדר מדרגות' },
        catalog,
        'לא מסווג — לבדיקה',
      ),
    ).toBe('לחצן חדר מדרגות');
  });

  it('keeps stored legend digits and isolates them so RTL cannot flip 1.5', () => {
    const storedVisual = 'צינור 02 + מוליכים 5.1 ממ"ר';
    const shownVisual = boqLineDisplayLabel(
      line({ typeKey: null, originalLabel: storedVisual, identitySource: 'legend', label: storedVisual }),
      catalog,
      'לא מסווג',
    );
    expect(shownVisual).toContain('5.1');
    expect(shownVisual).toContain('02');
    expect(shownVisual).not.toContain('1.5');
    const shownLogical = boqLineDisplayLabel(
      line({
        typeKey: null,
        originalLabel: 'חתך 1.5 ממ"ר',
        identitySource: 'legend',
        label: 'חתך 1.5 ממ"ר',
      }),
      catalog,
      'לא מסווג',
    );
    expect(shownLogical).toContain('\u20661.5\u2069');
    expect(shownLogical).not.toContain('5.1');
    expect(
      detectionDisplayLabel({ id: 'layout:F0#10', typeKey: null, originalText: storedVisual }, catalog, 'לא מסווג'),
    ).toContain('5.1');
  });
});

describe('boqLineStatus', () => {
  it('does not send an unambiguous legend quantity line to check-and-approve', () => {
    expect(
      boqLineStatus(
        line({
          typeKey: null,
          identitySource: 'legend',
          originalLabel: 'תוצרת אלקטרולייט שקע יחיד',
          quantity: 50,
          verified: false,
        }),
        false,
      ),
    ).toBe('autoIdentified');
  });

  it('treats a fully confirmed legend line as manually approved even without a catalog type', () => {
    expect(
      boqLineStatus(
        line({
          typeKey: null,
          identitySource: 'legend',
          originalLabel: 'מפסק בטחון 3-קוטבי',
          breakdown: { high: 0, medium: 0, low: 72, unclassified: 0, userAdded: 0, userConfirmed: 72 },
          verified: false,
        }),
        false,
      ),
    ).toBe('manuallyApproved');
  });

  it('keeps mixed rows separate from fully unapproved rows', () => {
    const mixed = line({
      key: 'mixed',
      typeKey: null,
      identitySource: 'legend',
      originalLabel: 'מפסק בטחון 3-קוטבי',
      breakdown: { high: 0, medium: 0, low: 72, unclassified: 1, userAdded: 0, userConfirmed: 72 },
      verified: false,
    });
    const pending = line({
      key: 'pending',
      typeKey: null,
      identitySource: 'legend',
      originalLabel: 'מפסק מאור',
      breakdown: { high: 0, medium: 0, low: 0, unclassified: 5, userAdded: 0, userConfirmed: 0 },
      verified: false,
    });
    expect(boqLineStatus(mixed, false)).toBe('partiallyApproved');
    expect(boqLineStatus(pending, false)).toBe('needsCheck');
    const grouped = groupBoqLinesForDisplay([mixed, pending], catalog, 'לא מסווג', false);
    expect(grouped.map((row) => boqLineStatus(row, false))).toEqual(['needsCheck', 'partiallyApproved']);
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