import { Receipt, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listVendorCredits, type ApCreditLifecycleDisplayStatus } from '@/modules/ap';
import { money } from '@/shared/money/money';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { OcrEntryLink } from '@/modules/ocr/ui/ocr-entry-link';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ProcurementSectionNav } from '../../procurement-section-nav';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ap' });
  return { title: t('credits.listTitle') };
}

function creditStatusShape(status: string): StatusShape {
  switch (status as ApCreditLifecycleDisplayStatus) {
    case 'draft':
      return 'draft';
    case 'pending_approval':
      return 'pending';
    case 'open':
      return 'active';
    case 'applied':
      return 'completed';
    case 'void':
      return 'void';
    default:
      return 'archived';
  }
}

export default async function VendorCreditsPage() {
  const t = await getTranslations('ap');
  const locale = await getLocale();

  const { credits, canManage, canRead } = await withOrgContext(async (context) => ({
    credits: hasPermission(context, PERMISSIONS.AP_READ)
      ? await listVendorCredits(context)
      : [],
    canManage: hasPermission(context, PERMISSIONS.AP_MANAGE),
    canRead: hasPermission(context, PERMISSIONS.AP_READ),
  }));

  if (!canRead) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <PageHeader title={t('credits.listTitle')} description={t('credits.listDescription')} />
        <ProcurementSectionNav active="credits" />
        <EmptyState title={t('empty.noAccess.title')} description={t('empty.noAccess.body')} />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={t('credits.listTitle')}
        description={t('credits.listDescription')}
        actions={
          canManage ? (
            <div className="flex max-w-full flex-wrap gap-2">
              <OcrEntryLink workflow="vendor_credit" />
              <Button asChild className="max-w-full">
                <Link href="/procurement/ap/credits/new">
                  <Plus aria-hidden />
                  {t('credits.newCredit')}
                </Link>
              </Button>
            </div>
          ) : null
        }
      />

      <ProcurementSectionNav active="credits" />

      {credits.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={t('credits.emptyList.title')}
          description={t('credits.emptyList.body')}
          action={
            canManage ? (
              <Button asChild>
                <Link href="/procurement/ap/credits/new">{t('credits.emptyList.action')}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ResponsiveTable
          items={credits}
          getRowKey={(credit) => credit.id}
          desktop={
            <div className="min-w-0 rounded-lg border border-[var(--pf-border-default)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('credits.list.columns.reference')}</TableHead>
                    <TableHead>{t('credits.list.columns.vendor')}</TableHead>
                    <TableHead>{t('credits.list.columns.status')}</TableHead>
                    <TableHead numeric>{t('credits.list.columns.amount')}</TableHead>
                    <TableHead>{t('credits.list.columns.creditDate')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {credits.map((credit) => (
                    <TableRow key={credit.id}>
                      <TableCell className="max-w-[12rem] truncate font-medium">
                        <Link
                          href={`/procurement/ap/credits/${credit.id}`}
                          className={cn(textNavLinkClassName, 'rounded-sm')}
                        >
                          {credit.reference?.trim() || t('credits.list.noReference')}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[10rem] truncate">
                        {credit.vendorName ?? '-'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          shape={creditStatusShape(credit.displayStatus)}
                          label={t(
                            `credits.statuses.${credit.displayStatus}` as 'credits.statuses.open',
                          )}
                        />
                      </TableCell>
                      <TableCell numeric>
                        <MoneyText value={money(credit.amount, credit.currency)} />
                      </TableCell>
                      <TableCell>
                        <span dir="ltr">
                          {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                            new Date(credit.creditDate),
                          )}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          }
          renderMobileCard={(credit) => (
            <Link
              href={`/procurement/ap/credits/${credit.id}`}
              className="flex min-h-11 min-w-0 flex-col gap-2 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <span className="min-w-0 break-words font-semibold">
                  {credit.reference?.trim() || t('credits.list.noReference')}
                </span>
                <StatusBadge
                  shape={creditStatusShape(credit.displayStatus)}
                  label={t(
                    `credits.statuses.${credit.displayStatus}` as 'credits.statuses.open',
                  )}
                />
              </div>
              <p className="break-words text-sm text-[var(--pf-text-secondary)]">
                {credit.vendorName ?? '-'}
              </p>
              <MoneyText value={money(credit.amount, credit.currency)} />
              <p className="text-xs text-[var(--pf-text-muted)]" dir="ltr">
                {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                  new Date(credit.creditDate),
                )}
              </p>
            </Link>
          )}
        />
      )}
    </div>
  );
}
