import type { BusinessDate } from '@/shared/dates';

export function financialOverviewRecognizedHref(
  fromDate: BusinessDate,
  toDate: BusinessDate,
): string {
  return `/financials/overview/recognized?fromDate=${fromDate}&toDate=${toDate}`;
}

export function financialOverviewCashPaidHref(
  fromDate: BusinessDate,
  toDate: BusinessDate,
): string {
  return `/financials/overview/cash-paid?fromDate=${fromDate}&toDate=${toDate}`;
}
