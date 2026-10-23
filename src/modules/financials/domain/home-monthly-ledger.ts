/**
 * Month-by-month business picture.
 * Movement is dated. Balances are as of that month, not today's balance repeated.
 */

import type { BillingKind, BillingRecordStatus } from '@/modules/billing/domain/types';
import {
  computeRecordRevenuePosition,
  invoiceBilledTriplet,
  resolvePaymentTriplet,
  type RevenueTriplet,
} from '@/modules/billing/domain/revenue-position';
import { businessDate, endOfMonth, type BusinessDate } from '@/shared/dates';
import {
  addMoney,
  compareMoney,
  isMaterialPositiveMoney,
  isPositiveMoney,
  isZeroMoney,
  roundMoney,
  subtractMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import { recordedNetPortion } from './business-cash-position';

export interface HomeMonthlyLedgerPair {
  readonly net: MoneyValue;
  readonly gross: MoneyValue;
}

export interface HomeMonthlyLedgerLine {
  readonly id: string;
  readonly name: string;
  readonly date: string | null;
  readonly net: MoneyValue;
  readonly gross: MoneyValue;
  readonly hasVat: boolean;
  readonly status: string | null;
  readonly href: string | null;
}

export interface HomeMonthlyLedgerMonth {
  readonly yearMonth: string;
  readonly asOf: BusinessDate;
  readonly invoiced: HomeMonthlyLedgerPair | null;
  readonly collected: HomeMonthlyLedgerPair | null;
  readonly receivablesEnd: HomeMonthlyLedgerPair | null;
  readonly expensesRecorded: HomeMonthlyLedgerPair | null;
  readonly expensesPaid: HomeMonthlyLedgerPair | null;
  readonly payrollPaid: HomeMonthlyLedgerPair | null;
  readonly cashOut: HomeMonthlyLedgerPair | null;
  readonly payableEnd: HomeMonthlyLedgerPair | null;
  readonly recognizedCost: HomeMonthlyLedgerPair | null;
  readonly monthDifference: HomeMonthlyLedgerPair | null;
  readonly cumulativeDifference: HomeMonthlyLedgerPair | null;
  readonly invoices: readonly HomeMonthlyLedgerLine[];
  readonly collections: readonly HomeMonthlyLedgerLine[];
  readonly recordedExpenses: readonly HomeMonthlyLedgerLine[];
  readonly expensePayments: readonly HomeMonthlyLedgerLine[];
  readonly payrollPayments: readonly HomeMonthlyLedgerLine[];
  readonly employerCosts: readonly HomeMonthlyLedgerLine[];
  readonly payables: readonly HomeMonthlyLedgerLine[];
  readonly receivables: readonly HomeMonthlyLedgerLine[];
  readonly costParts: readonly HomeMonthlyLedgerLine[];
  readonly otherCashOut: readonly HomeMonthlyLedgerLine[];
}

export interface HomeMonthlyLedger {
  readonly months: readonly HomeMonthlyLedgerMonth[];
  readonly collectedNet: MoneyValue | null;
  readonly cashOutNet: MoneyValue | null;
  readonly differenceNet: MoneyValue | null;
  readonly dashboardCollectedNet: MoneyValue | null;
  readonly dashboardCashOutNet: MoneyValue | null;
  readonly collectedGapNet: MoneyValue | null;
  readonly cashOutGapNet: MoneyValue | null;
}

export interface LedgerBillingFact {
  readonly id: string;
  readonly reference: string | null;
  readonly clientName: string | null;
  readonly issueDate: BusinessDate;
  readonly dueDate: BusinessDate | null;
  readonly status: BillingRecordStatus;
  readonly kind: BillingKind;
  readonly subtotalAmount: MoneyValue;
  readonly taxAmount: MoneyValue | null;
  readonly totalAmount: MoneyValue;
  readonly retentionHeldRemaining: MoneyValue | null;
  readonly applications: readonly {
    readonly id: string;
    readonly paymentDate: BusinessDate;
    readonly amount: MoneyValue;
    readonly basis: 'net' | 'gross';
    readonly status: 'recorded' | 'void';
  }[];
}

export interface LedgerCashLine {
  readonly id: string;
  readonly source: 'expense' | 'payroll' | 'ap' | 'subcontract_advance';
  readonly name: string;
  readonly document: string;
  readonly date: BusinessDate;
  readonly net: MoneyValue;
  readonly gross: MoneyValue;
  readonly href: string | null;
}

export interface LedgerCostLine {
  readonly id: string;
  readonly yearMonth: string;
  readonly kind: 'expense' | 'ap_bill' | 'employer_cost';
  readonly name: string;
  readonly net: MoneyValue;
  readonly gross: MoneyValue;
  readonly href: string | null;
  readonly estimate?: boolean;
}

export interface LedgerPayrollFact {
  readonly id: string;
  readonly name: string;
  readonly yearMonth: string;
  readonly dueDate: BusinessDate | null;
  readonly paidAt: BusinessDate | null;
  readonly expected: MoneyValue;
  readonly paid: MoneyValue;
  readonly href: string | null;
  readonly voided: boolean;
}

export interface LedgerExpenseFact {
  readonly id: string;
  readonly name: string;
  readonly expenseDate: BusinessDate;
  readonly dueDate: BusinessDate | null;
  readonly net: MoneyValue;
  readonly gross: MoneyValue;
  readonly href: string | null;
  readonly voided: boolean;
}

export interface LedgerApFact {
  readonly id: string;
  readonly name: string;
  readonly billDate: BusinessDate | null;
  readonly dueDate: BusinessDate | null;
  readonly status: string;
  readonly net: MoneyValue;
  readonly gross: MoneyValue;
  readonly href: string | null;
  readonly applications: readonly { readonly date: BusinessDate; readonly gross: MoneyValue }[];
}

function nextYearMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number) as [number, number];
  if (month === 12) return `${year + 1}-01`;
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export function yearMonthsThrough(start: string, end: string): string[] {
  const months: string[] = [];
  let cursor = start;
  while (cursor <= end && months.length < 240) {
    months.push(cursor);
    cursor = nextYearMonth(cursor);
  }
  return months;
}

export function monthAsOf(yearMonth: string, today: BusinessDate): BusinessDate {
  const end = endOfMonth(businessDate(`${yearMonth}-01`));
  return end < today ? end : today;
}

function pair(net: MoneyValue, gross: MoneyValue): HomeMonthlyLedgerPair {
  return { net: roundMoney(net), gross: roundMoney(gross) };
}

function zeroPair(currency: string): HomeMonthlyLedgerPair {
  return pair(zeroMoney(currency), zeroMoney(currency));
}

function addPair(
  left: HomeMonthlyLedgerPair,
  net: MoneyValue,
  gross: MoneyValue,
): HomeMonthlyLedgerPair {
  return pair(addMoney(left.net, net), addMoney(left.gross, gross));
}

function hasVat(net: MoneyValue, gross: MoneyValue): boolean {
  return net.currency === gross.currency && compareMoney(net, gross) !== 0;
}

function line(input: {
  readonly id: string;
  readonly name: string;
  readonly date: string | null;
  readonly net: MoneyValue;
  readonly gross: MoneyValue;
  readonly status: string | null;
  readonly href: string | null;
}): HomeMonthlyLedgerLine {
  return { ...input, hasVat: hasVat(input.net, input.gross) };
}

function inMonth(date: string, yearMonth: string, asOf: BusinessDate): boolean {
  return date >= `${yearMonth}-01` && date <= asOf;
}

function gap(left: MoneyValue | null, right: MoneyValue | null): MoneyValue | null {
  if (!left || !right || left.currency !== right.currency) return null;
  const difference = roundMoney(subtractMoney(left, right));
  return isZeroMoney(difference) ? null : difference;
}

function billingPosition(record: LedgerBillingFact, asOf: BusinessDate) {
  return computeRecordRevenuePosition(
    {
      kind: record.kind,
      status: record.status,
      totalAmount: record.totalAmount,
      subtotalAmount: record.subtotalAmount,
      taxAmount: record.taxAmount,
      retentionHeldRemaining: record.retentionHeldRemaining ?? undefined,
      payments: record.applications
        .filter((payment) => payment.paymentDate <= asOf)
        .map((payment) => ({
          amount: payment.amount,
          amountBasis: payment.basis,
          status: payment.status,
        })),
    },
    record.totalAmount.currency,
  );
}

function applicationTriplet(record: LedgerBillingFact, payment: LedgerBillingFact['applications'][number]): RevenueTriplet {
  return resolvePaymentTriplet(payment.amount, payment.basis, {
    totalAmount: record.totalAmount,
    subtotalAmount: record.subtotalAmount,
    taxAmount: record.taxAmount,
  });
}

export function composeHomeMonthlyLedger(input: {
  readonly currency: string;
  readonly today: BusinessDate;
  readonly startYearMonth?: string;
  readonly billingLoaded: boolean;
  readonly cashLoaded: boolean;
  readonly costLoaded: boolean;
  readonly billing: readonly LedgerBillingFact[];
  readonly collectionsByMonth: Readonly<Record<string, RevenueTriplet>>;
  readonly cashLines: readonly LedgerCashLine[];
  readonly costs: readonly LedgerCostLine[];
  readonly payroll: readonly LedgerPayrollFact[];
  readonly expenses: readonly LedgerExpenseFact[];
  readonly apBills: readonly LedgerApFact[];
  readonly dashboardCollectedNet: MoneyValue | null;
  readonly dashboardCashOutNet: MoneyValue | null;
}): HomeMonthlyLedger {
  const currency = input.currency.toUpperCase();
  const end = input.today.slice(0, 7);
  const months = yearMonthsThrough(input.startYearMonth ?? '2026-01', end);
  let cumulativeNet = zeroMoney(currency);
  let cumulativeGross = zeroMoney(currency);
  let collectedSum = zeroMoney(currency);
  let cashOutSum = zeroMoney(currency);
  let sawCollected = false;
  let sawCashOut = false;

  const built = months.map((yearMonth) => {
    const asOf = monthAsOf(yearMonth, input.today);
    const monthStart = `${yearMonth}-01`;

    const invoices: HomeMonthlyLedgerLine[] = [];
    let invoiced = zeroPair(currency);
    let sawInvoice = false;
    if (input.billingLoaded) {
      for (const record of input.billing) {
        if (record.issueDate < monthStart || record.issueDate > asOf) continue;
        const billed = invoiceBilledTriplet(record);
        if (!billed) continue;
        sawInvoice = true;
        invoiced = addPair(invoiced, billed.net, billed.gross);
        invoices.push(
          line({
            id: record.id,
            name: record.clientName || record.reference || record.id,
            date: record.issueDate,
            net: billed.net,
            gross: billed.gross,
            status: record.status,
            href: `/billing/${record.id}`,
          }),
        );
      }
    }

    const collections: HomeMonthlyLedgerLine[] = [];
    let collectedFromLines = zeroPair(currency);
    if (input.billingLoaded) {
      for (const record of input.billing) {
        for (const payment of record.applications) {
          if (payment.status !== 'recorded') continue;
          if (!inMonth(payment.paymentDate, yearMonth, asOf)) continue;
          const triplet = applicationTriplet(record, payment);
          collectedFromLines = addPair(collectedFromLines, triplet.net, triplet.gross);
          collections.push(
            line({
              id: payment.id,
              name: record.clientName || record.reference || record.id,
              date: payment.paymentDate,
              net: triplet.net,
              gross: triplet.gross,
              status: payment.status,
              href: `/billing/${record.id}`,
            }),
          );
        }
      }
    }
    const canonical = input.collectionsByMonth[yearMonth];
    const collected = input.billingLoaded
      ? canonical
        ? pair(canonical.net, canonical.gross)
        : collectedFromLines
      : null;
    if (collected && canonical) {
      const netGap = roundMoney(subtractMoney(canonical.net, collectedFromLines.net));
      const grossGap = roundMoney(subtractMoney(canonical.gross, collectedFromLines.gross));
      if (!isZeroMoney(netGap) || !isZeroMoney(grossGap)) {
        collections.push(
          line({
            id: `unallocated:${yearMonth}`,
            name: 'unallocated',
            date: null,
            net: netGap,
            gross: grossGap,
            status: 'recorded',
            href: '/billing',
          }),
        );
      }
    }

    const receivablesLines: HomeMonthlyLedgerLine[] = [];
    let receivables = zeroPair(currency);
    let sawReceivable = false;
    if (input.billingLoaded) {
      for (const record of input.billing) {
        if (record.issueDate > asOf) continue;
        const position = billingPosition(record, asOf);
        if (!position || !isMaterialPositiveMoney(position.open.net)) continue;
        sawReceivable = true;
        receivables = addPair(receivables, position.open.net, position.open.gross);
        receivablesLines.push(
          line({
            id: record.id,
            name: record.clientName || record.reference || record.id,
            date: record.dueDate,
            net: position.open.net,
            gross: position.open.gross,
            status: record.dueDate && record.dueDate < asOf ? 'overdue' : 'open',
            href: `/billing/${record.id}`,
          }),
        );
      }
    }

    const expensePayments: HomeMonthlyLedgerLine[] = [];
    const payrollPayments: HomeMonthlyLedgerLine[] = [];
    const otherCashOut: HomeMonthlyLedgerLine[] = [];
    let expensesPaid = zeroPair(currency);
    let payrollPaid = zeroPair(currency);
    let cashOut = zeroPair(currency);
    if (input.cashLoaded) {
      for (const cash of input.cashLines) {
        if (!inMonth(cash.date, yearMonth, asOf)) continue;
        cashOut = addPair(cashOut, cash.net, cash.gross);
        const row = line({
          id: cash.id,
          name: cash.name,
          date: cash.date,
          net: cash.net,
          gross: cash.gross,
          status: 'paid',
          href: cash.href,
        });
        if (cash.source === 'expense') {
          expensesPaid = addPair(expensesPaid, cash.net, cash.gross);
          expensePayments.push({ ...row, name: cash.document ? `${cash.name} · ${cash.document}` : cash.name });
        } else if (cash.source === 'payroll') {
          payrollPaid = addPair(payrollPaid, cash.net, cash.gross);
          payrollPayments.push({ ...row, name: cash.document ? `${cash.name} · ${cash.document}` : cash.name });
        } else {
          otherCashOut.push(row);
        }
      }
    }

    const recordedExpenses: HomeMonthlyLedgerLine[] = [];
    const employerCosts: HomeMonthlyLedgerLine[] = [];
    const costParts: HomeMonthlyLedgerLine[] = [];
    let expensesRecorded = zeroPair(currency);
    let recognized = zeroPair(currency);
    if (input.costLoaded) {
      for (const cost of input.costs) {
        if (cost.estimate || cost.yearMonth !== yearMonth) continue;
        recognized = addPair(recognized, cost.net, cost.gross);
        const row = line({
          id: cost.id,
          name: cost.name,
          date: `${yearMonth}-01`,
          net: cost.net,
          gross: cost.gross,
          status: cost.kind,
          href: cost.href,
        });
        costParts.push(row);
        if (cost.kind === 'expense') {
          expensesRecorded = addPair(expensesRecorded, cost.net, cost.gross);
          recordedExpenses.push(row);
        }
        if (cost.kind === 'employer_cost') employerCosts.push(row);
      }
    }

    const payables: HomeMonthlyLedgerLine[] = [];
    let payable = zeroPair(currency);
    if (input.cashLoaded) {
      for (const row of input.payroll) {
        if (row.voided || row.yearMonth > yearMonth) continue;
        if (!isPositiveMoney(row.expected) && !isPositiveMoney(row.paid)) continue;
        const paidByThen = row.paidAt && row.paidAt <= asOf ? row.paid : zeroMoney(currency);
        const remaining = roundMoney(subtractMoney(row.expected, paidByThen));
        if (!isMaterialPositiveMoney(remaining)) continue;
        payable = addPair(payable, remaining, remaining);
        payables.push(
          line({
            id: row.id,
            name: `${row.name} · ${row.yearMonth}`,
            date: row.dueDate,
            net: remaining,
            gross: remaining,
            status: 'unpaid',
            href: row.href,
          }),
        );
      }
      const paidTowardExpense = new Map<string, MoneyValue>();
      for (const cash of input.cashLines) {
        if (cash.source !== 'expense' || cash.date > asOf) continue;
        const expenseId = cash.id.startsWith('expense:') ? cash.id.slice('expense:'.length).split(':')[0] : null;
        if (!expenseId) continue;
        paidTowardExpense.set(
          expenseId,
          addMoney(paidTowardExpense.get(expenseId) ?? zeroMoney(currency), cash.gross),
        );
      }
      for (const expense of input.expenses) {
        if (expense.voided || expense.expenseDate > asOf) continue;
        const paidGross = paidTowardExpense.get(expense.id) ?? zeroMoney(currency);
        const remainingGross = roundMoney(
          compareMoney(expense.gross, paidGross) > 0
            ? subtractMoney(expense.gross, paidGross)
            : zeroMoney(currency),
        );
        if (!isMaterialPositiveMoney(remainingGross)) continue;
        const remainingNet = recordedNetPortion(expense.net, expense.gross, remainingGross);
        payable = addPair(payable, remainingNet, remainingGross);
        payables.push(
          line({
            id: expense.id,
            name: expense.name,
            date: expense.dueDate ?? expense.expenseDate,
            net: remainingNet,
            gross: remainingGross,
            status: 'unpaid',
            href: expense.href,
          }),
        );
      }
      for (const bill of input.apBills) {
        if (bill.status === 'draft' || bill.status === 'void' || bill.status === 'cancelled') continue;
        const opened = bill.billDate ?? bill.dueDate;
        if (!opened || opened > asOf) continue;
        let paidGross = zeroMoney(currency);
        for (const application of bill.applications) {
          if (application.date <= asOf) paidGross = addMoney(paidGross, application.gross);
        }
        const remainingGross = roundMoney(
          compareMoney(bill.gross, paidGross) > 0 ? subtractMoney(bill.gross, paidGross) : zeroMoney(currency),
        );
        if (!isMaterialPositiveMoney(remainingGross)) continue;
        const remainingNet = recordedNetPortion(bill.net, bill.gross, remainingGross);
        payable = addPair(payable, remainingNet, remainingGross);
        payables.push(
          line({
            id: bill.id,
            name: bill.name,
            date: bill.dueDate,
            net: remainingNet,
            gross: remainingGross,
            status: bill.status,
            href: bill.href,
          }),
        );
      }
    }

    const monthDifference =
      collected && input.cashLoaded
        ? pair(subtractMoney(collected.net, cashOut.net), subtractMoney(collected.gross, cashOut.gross))
        : null;
    let cumulative: HomeMonthlyLedgerPair | null = null;
    if (monthDifference) {
      cumulativeNet = addMoney(cumulativeNet, monthDifference.net);
      cumulativeGross = addMoney(cumulativeGross, monthDifference.gross);
      cumulative = pair(cumulativeNet, cumulativeGross);
      collectedSum = addMoney(collectedSum, collected!.net);
      cashOutSum = addMoney(cashOutSum, cashOut.net);
      sawCollected = true;
      sawCashOut = true;
    }

    return {
      yearMonth,
      asOf,
      invoiced: input.billingLoaded ? (sawInvoice ? invoiced : zeroPair(currency)) : null,
      collected,
      receivablesEnd: input.billingLoaded ? (sawReceivable ? receivables : zeroPair(currency)) : null,
      expensesRecorded: input.costLoaded ? expensesRecorded : null,
      expensesPaid: input.cashLoaded ? expensesPaid : null,
      payrollPaid: input.cashLoaded ? payrollPaid : null,
      cashOut: input.cashLoaded ? cashOut : null,
      payableEnd: input.cashLoaded ? payable : null,
      recognizedCost: input.costLoaded ? recognized : null,
      monthDifference,
      cumulativeDifference: cumulative,
      invoices,
      collections,
      recordedExpenses,
      expensePayments,
      payrollPayments,
      employerCosts,
      payables,
      receivables: receivablesLines,
      costParts,
      otherCashOut,
    };
  });

  const collectedNet = sawCollected ? roundMoney(collectedSum) : null;
  const cashOutNet = sawCashOut ? roundMoney(cashOutSum) : null;
  return {
    months: built,
    collectedNet,
    cashOutNet,
    differenceNet:
      collectedNet && cashOutNet ? roundMoney(subtractMoney(collectedNet, cashOutNet)) : null,
    dashboardCollectedNet: input.dashboardCollectedNet,
    dashboardCashOutNet: input.dashboardCashOutNet,
    collectedGapNet: gap(input.dashboardCollectedNet, collectedNet),
    cashOutGapNet: gap(input.dashboardCashOutNet, cashOutNet),
  };
}
