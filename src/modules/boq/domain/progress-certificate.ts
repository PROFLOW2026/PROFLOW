import Decimal from 'decimal.js';
import { addMoney, money, type MoneyValue } from '@/shared/money';
import { parseQuantity, periodLineValue } from './amounts';
import type { BoqPricingType } from './types';

export interface ProgressCertificateLine {
  readonly boqNodeId: string;
  readonly itemCode: string | null;
  readonly description: string;
  readonly contractQuantity: string;
  readonly previousQuantity: string;
  readonly currentQuantity: string;
  readonly cumulativeQuantity: string;
  readonly remainingQuantity: string;
  readonly unitPrice: MoneyValue;
  readonly previousValue: MoneyValue;
  readonly currentValue: MoneyValue;
  readonly cumulativeValue: MoneyValue;
  readonly remainingValue: MoneyValue;
}

export interface ProgressCertificateSummary {
  readonly lines: readonly ProgressCertificateLine[];
  readonly previousCumulativeValue: MoneyValue;
  readonly currentPeriodValue: MoneyValue;
  readonly newCumulativeValue: MoneyValue;
  readonly remainingContractValue: MoneyValue;
}

export function buildProgressCertificate(input: {
  readonly currency: string;
  readonly lines: readonly {
    readonly boqNodeId: string;
    readonly itemCode: string | null;
    readonly description: string;
    readonly pricingType: BoqPricingType;
    readonly contractQuantity: string;
    readonly previousQuantity: string;
    readonly currentPeriodApproved: string;
    readonly unitPrice: MoneyValue;
  }[];
}): ProgressCertificateSummary {
  const currency = input.currency;
  let previousCumulativeValue = money('0', currency);
  let currentPeriodValue = money('0', currency);
  let newCumulativeValue = money('0', currency);
  let remainingContractValue = money('0', currency);

  const lines: ProgressCertificateLine[] = input.lines.map((line) => {
    const cumulative = parseQuantity(line.previousQuantity)
      .plus(parseQuantity(line.currentPeriodApproved))
      .toFixed();
    const remaining = parseQuantity(line.contractQuantity).minus(cumulative).toFixed();
    const previousValue = periodLineValue({
      approvedThisPeriod: line.previousQuantity,
      unitPrice: line.unitPrice,
      pricingType: line.pricingType,
    });
    const currentValue = periodLineValue({
      approvedThisPeriod: line.currentPeriodApproved,
      unitPrice: line.unitPrice,
      pricingType: line.pricingType,
    });
    const cumulativeValue = addMoney(previousValue, currentValue);
    const contractValue = periodLineValue({
      approvedThisPeriod: line.contractQuantity,
      unitPrice: line.unitPrice,
      pricingType: line.pricingType,
    });
    const remainingValue = money(
      new Decimal(contractValue.amount).minus(cumulativeValue.amount).toFixed(),
      currency,
    );

    previousCumulativeValue = addMoney(previousCumulativeValue, previousValue);
    currentPeriodValue = addMoney(currentPeriodValue, currentValue);
    newCumulativeValue = addMoney(newCumulativeValue, cumulativeValue);
    remainingContractValue = addMoney(remainingContractValue, remainingValue);

    return {
      boqNodeId: line.boqNodeId,
      itemCode: line.itemCode,
      description: line.description,
      contractQuantity: line.contractQuantity,
      previousQuantity: line.previousQuantity,
      currentQuantity: line.currentPeriodApproved,
      cumulativeQuantity: cumulative,
      remainingQuantity: remaining,
      unitPrice: line.unitPrice,
      previousValue,
      currentValue,
      cumulativeValue,
      remainingValue,
    };
  });

  return {
    lines,
    previousCumulativeValue,
    currentPeriodValue,
    newCumulativeValue,
    remainingContractValue,
  };
}
