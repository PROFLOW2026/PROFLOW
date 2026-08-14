import { describe, expect, it } from 'vitest';
import {
  fieldMeasureDtoHasMoney,
  toFieldMeasureItems,
} from '@/modules/boq/domain/field-measure';
import {
  FIELD_MEASURE_FORBIDDEN_MONEY_KEYS,
  maskBoqNodeMoney,
  maskProgressLineMoney,
} from '@/modules/boq/domain/mask-money';

const pricedNode = {
  id: '11111111-1111-4111-8111-111111111111',
  parentId: '22222222-2222-4222-8222-222222222222',
  nodeKind: 'item' as const,
  itemCode: '03.01',
  description: 'Concrete slab',
  unit: 'm2',
  status: 'active',
  sortOrder: 1,
  currentQuantity: '100',
  openingApprovedQuantity: '10',
  openingBilledQuantity: '8',
  originalUnitPrice: '250',
  originalAmount: '25000',
  currentUnitPrice: '320',
  currentAmount: '32000',
};

describe('maskBoqNodeMoney', () => {
  it('zeros unit prices and amounts without touching quantities', () => {
    const masked = maskBoqNodeMoney(pricedNode);
    expect(masked.currentUnitPrice).toBe('0');
    expect(masked.originalUnitPrice).toBe('0');
    expect(masked.currentAmount).toBe('0');
    expect(masked.originalAmount).toBe('0');
    expect(masked.currentQuantity).toBe('100');
    expect(masked.description).toBe('Concrete slab');
  });
});

describe('maskProgressLineMoney', () => {
  it('zeros snapshot price and period amount', () => {
    const masked = maskProgressLineMoney({
      boqNodeId: pricedNode.id,
      measuredQuantity: '4',
      approvedQuantity: '4',
      unitPriceSnapshot: '320',
      periodAmount: '1280',
    });
    expect(masked.unitPriceSnapshot).toBe('0');
    expect(masked.periodAmount).toBe('0');
    expect(masked.measuredQuantity).toBe('4');
  });
});

describe('toFieldMeasureItems', () => {
  it('strips prices, profit-like keys, and commercial totals from the field DTO', () => {
    const items = toFieldMeasureItems(
      [
        {
          id: pricedNode.parentId!,
          parentId: null,
          nodeKind: 'chapter',
          itemCode: '03',
          description: 'Concrete',
          unit: null,
          status: 'active',
          sortOrder: 0,
          currentQuantity: '0',
          openingApprovedQuantity: '0',
          openingBilledQuantity: '0',
        },
        pricedNode,
      ],
      [
        {
          status: 'approved',
          lines: [
            {
              boqNodeId: pricedNode.id,
              measuredQuantity: '20',
              approvedQuantity: '20',
            },
          ],
        },
        {
          status: 'draft',
          lines: [
            {
              boqNodeId: pricedNode.id,
              measuredQuantity: '5',
              approvedQuantity: '0',
            },
          ],
        },
      ],
    );

    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.itemCode).toBe('03.01');
    expect(item.description).toBe('Concrete slab');
    expect(item.unit).toBe('m2');
    expect(item.chapterLabel).toBe('Concrete');
    expect(item.currentQuantity).toBe('100');
    expect(item.performedQuantity).toBe('30');
    expect(item.remainingQuantity).toBe('70');
    expect(item.pendingMeasuredQuantity).toBe('5');

    expect(fieldMeasureDtoHasMoney(item)).toBe(false);
    for (const key of FIELD_MEASURE_FORBIDDEN_MONEY_KEYS) {
      expect(item).not.toHaveProperty(key);
    }
    const serialized = JSON.stringify(item);
    expect(serialized).not.toContain('320');
    expect(serialized).not.toContain('250');
    expect(serialized).not.toContain('32000');
    expect(serialized).not.toMatch(/unitPrice|unitRate|periodAmount|profit/i);
  });

  it('clamps remaining quantity at zero and skips chapters', () => {
    const items = toFieldMeasureItems(
      [
        {
          id: 'c',
          parentId: null,
          nodeKind: 'chapter',
          itemCode: null,
          description: 'Chapter',
          unit: null,
          status: 'active',
          sortOrder: 0,
          currentQuantity: '0',
          openingApprovedQuantity: '0',
          openingBilledQuantity: '0',
        },
        {
          id: 'i',
          parentId: 'c',
          nodeKind: 'item',
          itemCode: '01',
          description: 'Over-performed',
          unit: 'ea',
          status: 'active',
          sortOrder: 1,
          currentQuantity: '10',
          openingApprovedQuantity: '12',
          openingBilledQuantity: '12',
        },
      ],
      [],
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.remainingQuantity).toBe('0');
    expect(items[0]?.performedQuantity).toBe('12');
  });
});
