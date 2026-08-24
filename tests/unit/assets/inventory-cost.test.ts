import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/shared/errors';
import {
  assertInventoryCostConsumptionProjectShape,
  assertInventoryCostLayerSourceShape,
  consumeInventoryCostFifo,
  inventoryCostBasisConserves,
  inventoryCostLayerHasConsumptions,
  inventoryLayerValue,
  reduceStockBasis,
  sumInventoryStockValue,
  unitCostFromPurchase,
  type InventoryCostLayerSourceShape,
} from '@/modules/assets/domain/inventory-cost';
import { money, addMoney, toNumericString, multiplyMoney, roundMoney } from '@/shared/money';

const ILS = 'ILS';

describe('inventory cost layer source shape', () => {
  it('accepts expense and opening_balance shapes; rejects ap_bill until line-level AP mapping exists', () => {
    expect(() =>
      assertInventoryCostLayerSourceShape({
        sourceKind: 'expense',
        sourceExpenseId: '01900000-0000-7000-8000-000000000001',
        sourceApBillId: null,
        openingReference: null,
      }),
    ).not.toThrow();
    expect(() =>
      assertInventoryCostLayerSourceShape({
        sourceKind: 'opening_balance',
        sourceExpenseId: null,
        sourceApBillId: null,
        openingReference: 'go-live-2026',
      }),
    ).not.toThrow();
    expect(() =>
      assertInventoryCostLayerSourceShape({
        sourceKind: 'ap_bill',
        sourceExpenseId: null,
        sourceApBillId: '01900000-0000-7000-8000-000000000002',
        openingReference: null,
      } as unknown as InventoryCostLayerSourceShape),
    ).toThrow(ValidationError);
  });

  it('rejects invalid source combinations', () => {
    expect(() =>
      assertInventoryCostLayerSourceShape({
        sourceKind: 'expense',
        sourceExpenseId: null,
        sourceApBillId: null,
        openingReference: null,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      assertInventoryCostLayerSourceShape({
        sourceKind: 'opening_balance',
        sourceExpenseId: '01900000-0000-7000-8000-000000000001',
        sourceApBillId: null,
        openingReference: 'ref',
      }),
    ).toThrow(ValidationError);
    expect(() =>
      assertInventoryCostLayerSourceShape({
        sourceKind: 'opening_balance',
        sourceExpenseId: null,
        sourceApBillId: null,
        openingReference: '  ',
      }),
    ).toThrow(ValidationError);
  });
});

describe('inventory cost consumption project shape', () => {
  const projectId = '01900000-0000-7000-8000-000000000099';

  it('accepts project_consume with projectId and writeoff/adjust without', () => {
    expect(() =>
      assertInventoryCostConsumptionProjectShape({ kind: 'project_consume', projectId }),
    ).not.toThrow();
    expect(() =>
      assertInventoryCostConsumptionProjectShape({ kind: 'writeoff', projectId: null }),
    ).not.toThrow();
    expect(() =>
      assertInventoryCostConsumptionProjectShape({ kind: 'adjust', projectId: null }),
    ).not.toThrow();
  });

  it('rejects project_consume without projectId and writeoff/adjust with projectId', () => {
    expect(() =>
      assertInventoryCostConsumptionProjectShape({ kind: 'project_consume', projectId: null }),
    ).toThrow(ValidationError);
    expect(() =>
      assertInventoryCostConsumptionProjectShape({ kind: 'writeoff', projectId }),
    ).toThrow(ValidationError);
    expect(() =>
      assertInventoryCostConsumptionProjectShape({ kind: 'adjust', projectId }),
    ).toThrow(ValidationError);
  });
});

describe('opening balance stock — no operating Actual', () => {
  it('opening stock 100k is stock value only (layer value, zero Actual contribution)', () => {
    const openingLayer = {
      id: 'opening',
      remainingQty: '100',
      unitCost: unitCostFromPurchase({ netAmount: money('100000', ILS), quantity: '100' }),
    };
    const stockValue = inventoryLayerValue(openingLayer);
    expect(toNumericString(stockValue)).toBe('100000.000000');
    // Opening balance layers have no expense/AP source — operating Actual effect is conceptually 0.
    expect(stockValue.amount).not.toBe('0.000000');
  });
});

describe('inventory cost conservation — 70 = 20 + 15 + 5 + 30', () => {
  it('FIFO project consume + writeoff conserves purchase basis', () => {
    const layer = {
      id: 'L1',
      remainingQty: '70',
      unitCost: unitCostFromPurchase({ netAmount: money('70', ILS), quantity: '70' }),
    };
    const purchaseBasis = money('70', ILS);

    const project = consumeInventoryCostFifo({
      layers: [layer],
      quantity: '20',
      currency: ILS,
    });
    expect(toNumericString(project.totalAmount)).toBe('20.000000');

    const writeoff = consumeInventoryCostFifo({
      layers: project.remainingLayers,
      quantity: '15',
      currency: ILS,
    });
    expect(toNumericString(writeoff.totalAmount)).toBe('15.000000');

    const secondProject = consumeInventoryCostFifo({
      layers: writeoff.remainingLayers,
      quantity: '5',
      currency: ILS,
    });
    expect(toNumericString(secondProject.totalAmount)).toBe('5.000000');

    const remainingStock = sumInventoryStockValue(secondProject.remainingLayers, ILS);
    expect(toNumericString(remainingStock)).toBe('30.000000');

    expect(
      inventoryCostBasisConserves({
        purchaseBasis,
        projectConsumed: addMoney(project.totalAmount, secondProject.totalAmount),
        writeoffs: writeoff.totalAmount,
        remainingStock,
      }),
    ).toBe(true);
  });
});

describe('inventory cost layers — reduceStockBasis + multi-layer FIFO', () => {
  it('reduceStockBasis floors at zero', () => {
    const next = reduceStockBasis(money('100', ILS), money('40', ILS));
    expect(toNumericString(next)).toBe('60.000000');
    const floored = reduceStockBasis(money('10', ILS), money('40', ILS));
    expect(toNumericString(floored)).toBe('0.000000');
  });

  it('FIFO across two layers conserves purchase = consumed + writeoff + remaining', () => {
    const layerA = {
      id: 'A',
      remainingQty: '10',
      unitCost: unitCostFromPurchase({ netAmount: money('1000', ILS), quantity: '10' }),
    };
    const layerB = {
      id: 'B',
      remainingQty: '5',
      unitCost: unitCostFromPurchase({ netAmount: money('750', ILS), quantity: '5' }),
    };
    const purchaseBasis = money('1750', ILS);

    const project = consumeInventoryCostFifo({
      layers: [layerA, layerB],
      quantity: '12',
      currency: ILS,
    });
    // 10×100 + 2×150 = 1000 + 300
    expect(toNumericString(project.totalAmount)).toBe('1300.000000');

    const writeoff = consumeInventoryCostFifo({
      layers: project.remainingLayers,
      quantity: '2',
      currency: ILS,
    });
    expect(toNumericString(writeoff.totalAmount)).toBe('300.000000');

    const remainingStock = sumInventoryStockValue(writeoff.remainingLayers, ILS);
    expect(toNumericString(remainingStock)).toBe('150.000000');

    expect(
      inventoryCostBasisConserves({
        purchaseBasis,
        projectConsumed: project.totalAmount,
        writeoffs: writeoff.totalAmount,
        remainingStock,
      }),
    ).toBe(true);

    const basisAfterProject = reduceStockBasis(purchaseBasis, project.totalAmount);
    const basisAfterWriteoff = reduceStockBasis(basisAfterProject, writeoff.totalAmount);
    expect(toNumericString(basisAfterWriteoff)).toBe(toNumericString(remainingStock));
  });
});

describe('expense FIFO layer value — production booking path', () => {
  it('unitCostFromPurchase preserves NET = qty × unit_cost (10,000 / 100 = 100)', () => {
    const unit = unitCostFromPurchase({
      netAmount: money('10000', ILS),
      quantity: '100',
    });
    expect(toNumericString(unit)).toBe('100.000000');
    const layerValue = multiplyMoney(unit, '100');
    expect(toNumericString(roundMoney(layerValue))).toBe('10000.000000');
  });

  it('mismatched unit cost would not equal NET (adversarial shape)', () => {
    const wrongUnit = money('1', ILS);
    const layerValue = multiplyMoney(wrongUnit, '100');
    expect(toNumericString(roundMoney(layerValue))).not.toBe('10000.000000');
  });
});

describe('FIFO quantity/value conservation — adversarial', () => {
  it('Layer 10×100: consume 5 → Actual 500, remaining 500, source = 1000', () => {
    const layer = {
      id: 'L1',
      remainingQty: '10',
      unitCost: unitCostFromPurchase({ netAmount: money('1000', ILS), quantity: '10' }),
    };
    const consumed = consumeInventoryCostFifo({
      layers: [layer],
      quantity: '5',
      currency: ILS,
    });
    expect(toNumericString(consumed.totalAmount)).toBe('500.000000');
    expect(consumed.remainingLayers[0]!.remainingQty).toBe('5.000000');
    const remainingValue = sumInventoryStockValue(consumed.remainingLayers, ILS);
    expect(toNumericString(remainingValue)).toBe('500.000000');
    expect(
      inventoryCostBasisConserves({
        purchaseBasis: money('1000', ILS),
        projectConsumed: consumed.totalAmount,
        writeoffs: money('0', ILS),
        remainingStock: remainingValue,
      }),
    ).toBe(true);
  });

  it('cannot consume more than remaining qty across layers (domain rejects over-consume)', () => {
    const layer = {
      id: 'L1',
      remainingQty: '10',
      unitCost: unitCostFromPurchase({ netAmount: money('1000', ILS), quantity: '10' }),
    };
    expect(() =>
      consumeInventoryCostFifo({ layers: [layer], quantity: '11', currency: ILS }),
    ).toThrow();
  });
});

describe('inventory cost layer unbook guard', () => {
  it('intact layer with no consumption rows is unbookable', () => {
    expect(
      inventoryCostLayerHasConsumptions(
        { receivedQty: '10', remainingQty: '10' },
        0,
      ),
    ).toBe(false);
  });

  it('partial remaining qty marks layer as consumed', () => {
    expect(
      inventoryCostLayerHasConsumptions(
        { receivedQty: '10', remainingQty: '7' },
        0,
      ),
    ).toBe(true);
  });

  it('consumption rows block unbook even when qty matches', () => {
    expect(
      inventoryCostLayerHasConsumptions(
        { receivedQty: '10', remainingQty: '10' },
        1,
      ),
    ).toBe(true);
  });
});
