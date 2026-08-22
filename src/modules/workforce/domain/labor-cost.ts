import Decimal from 'decimal.js';
import {
  fromNumericString,
  money,
  multiplyMoney,
  percentOfMoney,
  sumMoney,
  type MoneyValue,
} from '@/shared/money';
import type { LaborCostComponentRecord, RateUnit } from './types';
import type { WorkCalendarRates } from './work-calendar';

export interface LaborCostBreakdown {
  readonly basePortion: MoneyValue;
  readonly burdenPortion: MoneyValue;
  readonly componentPortions: readonly MoneyValue[];
  readonly total: MoneyValue;
}

function toHoursDecimal(hours: string): Decimal {
  const trimmed = hours.trim();
  if (trimmed === '' || !/^[+]?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid hours quantity: "${hours}"`);
  }
  const value = new Decimal(trimmed);
  if (!value.isFinite() || value.lte(0)) {
    throw new Error(`Hours must be positive, received "${hours}"`);
  }
  return value;
}

/** Converts logged hours into the multiplier applied to the stored base rate. */
export function hoursToRateUnits(
  hours: string,
  rateUnit: RateUnit,
  calendar?: Pick<WorkCalendarRates, 'standardHoursPerDay' | 'standardHoursPerMonth'>,
): string {
  const quantity = toHoursDecimal(hours);
  switch (rateUnit) {
    case 'hourly':
      return quantity.toString();
    case 'daily': {
      const hoursPerDay = calendar?.standardHoursPerDay;
      if (!hoursPerDay || Number(hoursPerDay) <= 0) {
        throw new Error('Daily rate conversion requires configured standardHoursPerDay');
      }
      return quantity.dividedBy(hoursPerDay).toString();
    }
    case 'monthly': {
      const hoursPerMonth = calendar?.standardHoursPerMonth;
      if (!hoursPerMonth || Number(hoursPerMonth) <= 0) {
        throw new Error('Monthly rate conversion requires configured standardHoursPerMonth');
      }
      return quantity.dividedBy(hoursPerMonth).toString();
    }
    default:
      return quantity.toString();
  }
}

export interface CalculateLaborCostInput {
  readonly baseRate: string;
  readonly currency: string;
  readonly rateUnit: RateUnit;
  readonly hours: string;
  readonly burdenPercent: string | null;
  readonly components?: readonly Pick<
    LaborCostComponentRecord,
    'basis' | 'amount' | 'percent' | 'currency'
  >[];
  readonly calendar?: Pick<WorkCalendarRates, 'standardHoursPerDay' | 'standardHoursPerMonth'>;
}

/**
 * Computes fully loaded labor cost for a time entry (doc 06 §4).
 *
 * Base wage is scaled by rate unit, employer burden applies on top of base,
 * and optional components add flat amounts or extra percentages.
 */
export function calculateLaborCost(input: CalculateLaborCostInput): LaborCostBreakdown {
  const currency = input.currency;
  const baseRate = money(input.baseRate, currency);
  const units = hoursToRateUnits(input.hours, input.rateUnit, input.calendar);
  const basePortion = multiplyMoney(baseRate, units);

  const burdenPortion =
    input.burdenPercent && input.burdenPercent.trim() !== ''
      ? percentOfMoney(basePortion, input.burdenPercent)
      : money('0', currency);

  const componentPortions = (input.components ?? []).map((component) => {
    if (component.basis === 'percent') {
      return percentOfMoney(basePortion, component.percent ?? '0');
    }
    const amount = fromNumericString(component.amount, component.currency ?? currency);
    return amount ?? money('0', currency);
  });

  const total = sumMoney([basePortion, burdenPortion, ...componentPortions], currency);

  return { basePortion, burdenPortion, componentPortions, total };
}

/** Convenience wrapper returning only the total loaded cost. */
export function calculateLaborCostTotal(input: CalculateLaborCostInput): MoneyValue {
  return calculateLaborCost(input).total;
}
