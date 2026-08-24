import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { loadProjectVendorActualBreakdown } from '../data/project-vendor-actual.repository';
import { loadCachedProjectFinancials } from '../application/load-cached-project-financials';

export interface ProjectVendorActualPanelProps {
  readonly projectId: string;
}

/** Per-vendor Actual drill-down on a project (R-034). Uses expense + AP data only. */
export async function ProjectVendorActualPanel({ projectId }: ProjectVendorActualPanelProps) {
  const t = await getTranslations('financial.vendorActualPanel');

  const payload = await withOrgContext(async (context) => {
    const canReadExpenses = hasPermission(context, PERMISSIONS.EXPENSES_READ);
    const canReadAp = hasPermission(context, PERMISSIONS.AP_READ);
    if (!canReadExpenses && !canReadAp) {
      return { rows: [], currency: context.organization.baseCurrency, canRead: false };
    }
    const financials = await loadCachedProjectFinancials(projectId);
    const rows = await loadProjectVendorActualBreakdown(
      context.db,
      context.organizationId,
      projectId,
      financials.currency,
    );
    return { rows, currency: financials.currency, canRead: true };
  });

  if (!payload.canRead) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {payload.rows.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-muted)]">{t('empty')}</p>
        ) : (
          payload.rows.map((row) => (
            <div
              key={row.vendorId}
              className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-[var(--pf-border-default)] px-3 py-2 text-sm"
            >
              <Link href={`/vendors/${row.vendorId}`} className={textNavLinkClassName}>
                {row.vendorName}
              </Link>
              <MoneyText value={row.actual} compact />
            </div>
          ))
        )}
        <p className="text-xs text-[var(--pf-text-muted)]">{t('hint')}</p>
      </CardContent>
    </Card>
  );
}
