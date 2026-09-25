import { sql, type SQL } from 'drizzle-orm';
import { apBills } from '@drizzle/schema';
import {
  isPositiveMoney,
  isZeroMoney,
  money,
  multiplyMoney,
  subtractMoney,
  toDecimalValue,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';

/** A fully stock bill has no operating actual. A mixed bill still does. */
export function apBillContributesOperatingActual(fullyStockPurchase: boolean): boolean {
  return !fullyStockPurchase;
}

/**
 * Drop bills whose every line is stock. Mixed bills stay in the query;
 * their stock line net is removed by `operatingSliceAfterStockLines`.
 * Open payable stays on the full bill.
 */
export function apBillNotStockPurchaseSql(): SQL {
  return sql`not (
    exists (
      select 1 from ap_bill_lines stock_line
      where stock_line.ap_bill_id = ${apBills.id}
        and stock_line.organization_id = ${apBills.organizationId}
        and stock_line.inventory_item_id is not null
    )
    and not exists (
      select 1 from ap_bill_lines operating_line
      where operating_line.ap_bill_id = ${apBills.id}
        and operating_line.organization_id = ${apBills.organizationId}
        and operating_line.inventory_item_id is null
    )
  )`;
}

/** Net of lines that buy stock. Callers subtract this from operating actual. */
export function apBillStockLineNetSql(): SQL<string> {
  return sql`coalesce((
    select sum(stock_line.net_amount)
    from ap_bill_lines stock_line
    where stock_line.ap_bill_id = ${apBills.id}
      and stock_line.organization_id = ${apBills.organizationId}
      and stock_line.inventory_item_id is not null
  ), 0)`;
}

/** Remove the stock share of a recognized slice. Consumption recognizes that share later. */
export function operatingSliceAfterStockLines(input: {
  readonly sliceAmount: string;
  readonly billNetAmount: string;
  readonly stockLineNet: string;
  readonly currency: string;
}): MoneyValue {
  const slice = money(input.sliceAmount, input.currency);
  const stock = money(input.stockLineNet || '0', input.currency);
  if (isZeroMoney(stock) || !isPositiveMoney(stock) || !isPositiveMoney(slice)) return slice;
  const billNet = money(input.billNetAmount, input.currency);
  if (!isPositiveMoney(billNet)) return slice;
  const ratio = toDecimalValue(slice).div(toDecimalValue(billNet));
  const stockInSlice = ratio.gte(1) ? stock : multiplyMoney(stock, ratio);
  const next = subtractMoney(slice, stockInSlice);
  return isPositiveMoney(next) ? next : zeroMoney(input.currency);
}
