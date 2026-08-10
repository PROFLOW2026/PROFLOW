import { FileQuestion, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listRfqsForOrg, type RfqStatus } from '@/modules/procurement';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ProcurementSectionNav } from '../procurement-section-nav';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'procurement' });
  return { title: t('rfq.title') };
}

function rfqStatusShape(status: string): StatusShape {
  switch (status as RfqStatus) {
    case 'draft':
      return 'draft';
    case 'sent':
      return 'active';
    case 'closed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'archived';
  }
}

export default async function RfqsPage() {
  const t = await getTranslations('procurement');
  const locale = await getLocale();

  const { rfqs, canManage } = await withOrgContext(async (context) => ({
    rfqs: await listRfqsForOrg(context),
    canManage: hasPermission(context, PERMISSIONS.PROCUREMENT_MANAGE),
  }));

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={t('rfq.title')}
        description={t('rfq.description')}
        actions={
          canManage ? (
            <Button asChild className="max-w-full">
              <Link href="/procurement/rfqs/new">
                <Plus aria-hidden />
                {t('rfq.new')}
              </Link>
            </Button>
          ) : null
        }
      />

      <ProcurementSectionNav active="rfqs" />

      {rfqs.length === 0 ? (
        <EmptyState
          icon={FileQuestion}
          title={t('empty.rfqs.title')}
          description={t('empty.rfqs.body')}
          action={
            canManage ? (
              <Button asChild>
                <Link href="/procurement/rfqs/new">{t('empty.rfqs.action')}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ResponsiveTable
          items={rfqs}
          getRowKey={(rfq) => rfq.id}
          desktop={
            <div className="min-w-0 rounded-lg border border-[var(--pf-border-default)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('rfq.list.columns.title')}</TableHead>
                    <TableHead>{t('rfq.list.columns.status')}</TableHead>
                    <TableHead>{t('rfq.list.columns.dueDate')}</TableHead>
                    <TableHead>{t('rfq.list.columns.created')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rfqs.map((rfq) => (
                    <TableRow key={rfq.id}>
                      <TableCell className="max-w-[16rem] truncate font-medium">
                        <Link
                          href={`/procurement/rfqs/${rfq.id}`}
                          className={cn(textNavLinkClassName, 'rounded-sm')}
                        >
                          {rfq.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          shape={rfqStatusShape(rfq.status)}
                          label={t(`rfq.statuses.${rfq.status}` as 'rfq.statuses.draft')}
                        />
                      </TableCell>
                      <TableCell>
                        {rfq.dueDate ? (
                          <span dir="ltr">
                            {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                              new Date(rfq.dueDate),
                            )}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <span dir="ltr">
                          {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                            rfq.createdAt,
                          )}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          }
          renderMobileCard={(rfq) => (
            <Link
              href={`/procurement/rfqs/${rfq.id}`}
              className="flex min-h-11 min-w-0 flex-col gap-2 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <span className="min-w-0 break-words font-semibold">{rfq.title}</span>
                <StatusBadge
                  shape={rfqStatusShape(rfq.status)}
                  label={t(`rfq.statuses.${rfq.status}` as 'rfq.statuses.draft')}
                />
              </div>
              <p className="text-sm text-[var(--pf-text-secondary)]" dir={rfq.dueDate ? 'ltr' : undefined}>
                {rfq.dueDate
                  ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                      new Date(rfq.dueDate),
                    )
                  : t('rfq.noDueDate')}
              </p>
            </Link>
          )}
        />
      )}
    </div>
  );
}
