import { FinancialYearBookExport } from './financial-year-book-export';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { todayInTimeZone } from '@/shared/dates';

export async function FinancialYearBookExportGate() {
  const gate = await withOrgContext(async (context) => {
    const canExport = hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);
    const today = todayInTimeZone(context.organization.timezone);
    const currentYear = Number(today.slice(0, 4));
    return {
      canExport,
      defaultYear: currentYear,
      minYear: currentYear - 10,
      maxYear: currentYear + 1,
    };
  });

  if (!gate.canExport) return null;

  return (
    <FinancialYearBookExport
      defaultYear={gate.defaultYear}
      minYear={gate.minYear}
      maxYear={gate.maxYear}
    />
  );
}
