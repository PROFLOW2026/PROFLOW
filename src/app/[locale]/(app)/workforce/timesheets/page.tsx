import type { Metadata } from 'next';
import { ClipboardList } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listTimesheetsForOrg, timesheetFiltersSchema } from '@/modules/workforce';
import { WorkforceSubNav } from '@/modules/workforce/ui/workforce-sub-nav';
import { withOrgContext } from '@/shared/auth/session';
import { AuthorizationError } from '@/shared/errors';
import { hasAnyPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { businessDate } from '@/shared/dates/dates';
import { formatBusinessDate } from '@/shared/dates/format';
import { Link } from '@/shared/i18n/navigation';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'workforce' });
  return { title: t('timesheets.title') };
}

export default async function TimesheetsListPage({
  searchParams,
}: {
  searchParams: Promise<{ employeeId?: string; status?: string }>;
}) {
  const [t, locale, raw] = await Promise.all([
    getTranslations('workforce'),
    getLocale(),
    searchParams,
  ]);
  const parsed = timesheetFiltersSchema.safeParse({
    employeeId: raw.employeeId || undefined,
    status: raw.status || undefined,
  });
  const filters = parsed.success ? parsed.data : {};

  const sheets = await withOrgContext(async (context) => {
    if (
      !hasAnyPermission(context, [
        PERMISSIONS.WORKFORCE_READ,
        PERMISSIONS.TIME_MANAGE,
        PERMISSIONS.TIME_APPROVE,
      ])
    ) {
      throw new AuthorizationError(PERMISSIONS.WORKFORCE_READ);
    }
    return listTimesheetsForOrg(context, { ...filters, status: filters.status ?? 'all' });
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('timesheets.title')} description={t('timesheets.description')} />
      <WorkforceSubNav active="timesheets" />
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('timesheets.notPayroll')}</p>

      {sheets.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={t('timesheets.empty.title')}
          description={t('timesheets.empty.description')}
        />
      ) : (
        <ResponsiveTable
          items={sheets}
          getRowKey={(sheet) => sheet.id}
          desktop={
            <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('timesheets.columns.employee')}</TableHead>
                    <TableHead>{t('timesheets.columns.period')}</TableHead>
                    <TableHead>{t('timesheets.columns.status')}</TableHead>
                    <TableHead numeric>{t('timesheets.columns.hours')}</TableHead>
                    <TableHead>{t('timesheets.columns.locked')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sheets.map((sheet) => (
                    <TableRow key={sheet.id}>
                      <TableCell>
                        <Link href={`/workforce/timesheets/${sheet.id}`} className="underline">
                          {sheet.employeeName}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span dir="ltr">
                          {formatBusinessDate(businessDate(sheet.periodStart), locale, 'short')}
                          {' – '}
                          {formatBusinessDate(businessDate(sheet.periodEnd), locale, 'short')}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          shape={
                            sheet.status === 'approved'
                              ? 'approved'
                              : sheet.status === 'submitted'
                                ? 'pending'
                                : sheet.status === 'returned'
                                  ? 'onHold'
                                  : 'draft'
                          }
                          label={t(`time.approvalStatus.${sheet.status}`)}
                        />
                      </TableCell>
                      <TableCell numeric>{sheet.totalHours}</TableCell>
                      <TableCell>{sheet.lockedAt ? t('timesheets.lockedYes') : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          }
          renderMobileCard={(sheet) => (
            <Link
              href={`/workforce/timesheets/${sheet.id}`}
              className="block min-h-11 rounded-lg border border-[var(--pf-border-default)] p-4"
            >
              <p className="font-medium">{sheet.employeeName}</p>
              <p className="text-xs text-[var(--pf-text-muted)]" dir="ltr">
                {formatBusinessDate(businessDate(sheet.periodStart), locale, 'short')}
                {' – '}
                {formatBusinessDate(businessDate(sheet.periodEnd), locale, 'short')}
              </p>
              <p className="mt-1 text-sm">
                {sheet.totalHours} {t('time.hoursAbbrev')} · {t(`time.approvalStatus.${sheet.status}`)}
              </p>
            </Link>
          )}
        />
      )}
    </div>
  );
}
