import { FileSpreadsheet, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MoneyText } from '@/components/patterns/money-text';
import { listQuotesForOrg, type QuoteStatus } from '@/modules/quotes';
import { money } from '@/shared/money';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { pressableCardLinkClassName, textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import { CommercialDocsHub } from '@/modules/quotes/ui/commercial-docs-hub';
import { SavedListViewsBar } from '@/modules/tenancy/ui/saved-list-views-bar';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'quotes' });
  return { title: t('title') };
}

function quoteShape(status: QuoteStatus): StatusShape {
  switch (status) {
    case 'draft':
    case 'ready':
      return 'pending';
    case 'sent':
      return 'active';
    case 'accepted':
    case 'converted':
      return 'completed';
    case 'rejected':
    case 'cancelled':
    case 'expired':
      return 'cancelled';
    default:
      return 'archived';
  }
}

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations('quotes');
  const tStatus = await getTranslations('status.estimateQuote');
  const params = await searchParams;

  const { items, canManage } = await withOrgContext(async (context) => ({
    items: await listQuotesForOrg(context),
    canManage: hasPermission(context, PERMISSIONS.QUOTES_MANAGE),
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/quotes/new">
                <Plus aria-hidden />
                {t('newQuote')}
              </Link>
            </Button>
          ) : null
        }
      />

      <Alert tone="info">{t('salesVsCrmBanner')}</Alert>
      <CommercialDocsHub current="quotes" />
      <SavedListViewsBar listKey="quotes" searchParams={params} />

      {items.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title={t('empty.title')}
          description={t('empty.body')}
          action={
            canManage ? (
              <Button asChild>
                <Link href="/quotes/new">{t('empty.action')}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ResponsiveTable
          items={items}
          getRowKey={(item) => item.id}
          desktop={
            <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('list.columns.title')}</TableHead>
                    <TableHead>{t('list.columns.client')}</TableHead>
                    <TableHead>{t('list.columns.status')}</TableHead>
                    <TableHead>{t('list.columns.total')}</TableHead>
                    <TableHead>{t('list.columns.validUntil')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Link href={`/quotes/${item.id}`} className={cn(textNavLinkClassName, 'font-medium')}>
                          {item.title}
                        </Link>
                      </TableCell>
                      <TableCell>{item.clientName ?? '-'}</TableCell>
                      <TableCell>
                        <StatusBadge shape={quoteShape(item.status)} label={tStatus(item.status)} />
                      </TableCell>
                      <TableCell>
                        {item.totalAmount ? (
                          <MoneyText value={money(item.totalAmount, item.currency)} />
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        {item.validityDate ? (
                          <span className="pf-ltr-island" dir="ltr">
                            {item.validityDate}
                          </span>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          }
          renderMobileCard={(item) => (
            <Link href={`/quotes/${item.id}`} className={pressableCardLinkClassName}>
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1 font-semibold">{item.title}</span>
                <StatusBadge shape={quoteShape(item.status)} label={tStatus(item.status)} />
              </div>
              <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                {item.clientName ?? '-'}
                {item.totalAmount ? ` · ${item.totalAmount} ${item.currency}` : ''}
              </p>
            </Link>
          )}
        />
      )}
    </div>
  );
}
