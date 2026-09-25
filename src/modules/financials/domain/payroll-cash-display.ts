/** Human-readable payroll period label for monthly paid-cash drilldown (not a UUID). */
export function formatPayrollPeriodDocument(yearMonth: string, locale: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth.trim());
  if (!match) return yearMonth;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!year || month < 1 || month > 12) return yearMonth;

  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long' }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );

  if (locale.startsWith('he')) return `שכר ${monthLabel} ${year}`;
  if (locale.startsWith('ar')) return `رواتب ${monthLabel} ${year}`;
  return `Payroll ${monthLabel} ${year}`;
}
