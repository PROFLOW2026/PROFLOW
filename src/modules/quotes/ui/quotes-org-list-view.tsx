import {
  AdaptiveListBody,
  AdaptiveListTableShell,
  MainAppCompactListCard,
  MainAppPage,
  MainAppSection,
  mainAppListKitEnabled,
} from '@/components/patterns/main-app';
import { QuotesListFilters } from '@/modules/quotes/ui/quotes-list-filters';
import { QUOTE_STATUSES, type QuoteStatus } from '@/modules/quotes/domain/types';
import { FileSpreadsheet, Plus } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MoneyText } from '@/components/patterns/money-text';
import { listQuotesForOrg, type QuoteStatus } from '@/modules/quotes';
import { money } from '@/shared/money';
import { formatMoneyString } from '@/shared/money/format';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { pressableCardLinkClassName, textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import {
  orgListHasPermission,
  type OrgListSurface,
} from '@/modules/employee-app/application/org-list-permissions';

export interface QuotesOrgListViewProps {
  readonly routeBase: string;
  readonly surface: OrgListSurface;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
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

export async function QuotesOrgListView({
  routeBase,
  surface,
  searchParams,
}: QuotesOrgListViewProps) {
  const [t, tStatus, locale, rawParams, tCommon] = await Promise.all([
    getTranslations('quotes'),
    getTranslations('status.estimateQuote'),
    getLocale(),
    searchParams,
    getTranslations('common'),
  ]);
  const isOwner = surface === 'owner';
  const listKit = mainAppListKitEnabled(surface);
  const q = typeof rawParams.q === 'string' ? rawParams.q.trim() : '';
  const statusRaw = typeof rawParams.status === 'string' ? rawParams.status : 'all';
  const statusFilter =
    statusRaw !== 'all' && QUOTE_STATUSES.includes(statusRaw as QuoteStatus)
      ? (statusRaw as QuoteStatus)
      : undefined;
  const filtersActive = Boolean(q || statusFilter);

  const { items, canManage, canRead } = await withOrgContext(async (context) => {
    const allowed = orgListHasPermission(context, PERMISSIONS.QUOTES_READ, surface);
    if (!allowed) {
      return {
        items: [] as Awaited<ReturnType<typeof listQuotesForOrg>>,
        canManage: false,
        canRead: false,
      };
    }

    return {
      items: await listQuotesForOrg(context, {
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(q ? { q } : {}),
      }),
      canManage: orgListHasPermission(context, PERMISSIONS.QUOTES_MANAGE, surface),
      canRead: true,
    };
  });

  if (!canRead) {
    return (
      <MainAppPage>
        {isOwner ? <PageHeader title={t('title')} /> : null}
        <MainAppSection>
          <EmptyState icon={FileSpreadsheet} title={t('empty.title')} description={t('empty.body')} />
        </MainAppSection>
      </MainAppPage>
    );
  }

  return (
    <MainAppPage>
      {isOwner ? (
        <PageHeader
          title={t('title')}
          actions={
            canManage ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild variant="secondary">
                  <Link href="/quotes/settings">{t('settingsLink')}</Link>
                </Button>
                <Button asChild>
                  <Link href={`${routeBase}/new`}>
                    <Plus aria-hidden />
                    {t('newQuote')}
                  </Link>
                </Button>
              </div>
            ) : null
          }
        />
      ) : null}

      <MainAppSection>
        <AdaptiveListBody surface={surface}>
      <QuotesListFilters routeBase={routeBase} initialQuery={q} initialStatus={statusRaw} />
      {items.length === 0 ? (
        filtersActive ? (
          <p className="text-sm text-[var(--pf-text-muted)]">{tCommon('states.noResults')}</p>
        ) : (
        <EmptyState
          icon={FileSpreadsheet}
          title={t('empty.title')}
          description={t('empty.body')}
          action={
            isOwner && canManage ? (
              <Button asChild>
                <Link href={`${routeBase}/new`}>{t('empty.action')}</Link>
              </Button>
            ) : undefined
          }
        />
        )
      ) : (
        <ResponsiveTable
          items={items}
          getRowKey={(item) => item.id}
          desktop={
            <AdaptiveListTableShell surface={surface}>
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
                        <Link
                          href={`${routeBase}/${item.id}`}
                          className={cn(textNavLinkClassName, 'font-medium')}
                        >
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
            </AdaptiveListTableShell>
          }
          mobileListClassName={listKit ? 'pf-ma-compact-mobile-list' : undefined}
          renderMobileCard={(item) => (
            listKit ? (
            <MainAppCompactListCard>
              <Link
                href={`${routeBase}/${item.id}`}
                className={cn(textNavLinkClassName, 'block min-w-0 font-semibold')}
              >
                {item.title}
              </Link>
              <div className="mt-1 flex items-start justify-between gap-2">
                <p className="min-w-0 text-sm text-[var(--pf-text-secondary)]">{item.clientName ?? '-'}</p>
                <StatusBadge shape={quoteShape(item.status)} label={tStatus(item.status)} />
              </div>
            </MainAppCompactListCard>
            ) : (
            <Link href={`${routeBase}/${item.id}`} className={pressableCardLinkClassName}>
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1 font-semibold">{item.title}</span>
                <StatusBadge shape={quoteShape(item.status)} label={tStatus(item.status)} />
              </div>
              <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                {item.clientName ?? '-'}
                {item.totalAmount && item.currency
                  ? ` · ${formatMoneyString(item.totalAmount, item.currency, locale)}`
                  : ''}
              </p>
            </Link>
            )
          )}
        />
      )}
        </AdaptiveListBody>
      </MainAppSection>
    </MainAppPage>
  );
}
