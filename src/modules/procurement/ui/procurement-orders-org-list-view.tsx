import {
  AdaptiveListBody,
  AdaptiveListTableShell,
  MainAppPage,
  MainAppSection,
} from '@/components/patterns/main-app';
import { ProcurementOrdersListFilters } from '@/modules/procurement/ui/procurement-orders-list-filters';
import { ClipboardList, Plus } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listPurchaseOrdersWithCommittedForOrg, type PurchaseOrderStatus } from '@/modules/procurement';
import { loadMaterialMarketDashboard } from '@/modules/material-market';
import { MarketPressureContextBanner } from '@/modules/material-market/ui/market-pressure-context-banner';
import { money } from '@/shared/money/money';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import { intlDateTimeFormat } from '@/shared/i18n/intl-locale';
import {
  orgListHasPermission,
  type OrgListSurface,
} from '@/modules/employee-app/application/org-list-permissions';
import { IssuePurchaseOrderButton } from './issue-purchase-order-button';
import { ProcurementSectionNav } from './procurement-section-nav';

export interface ProcurementOrdersOrgListViewProps {
  readonly routeBase: string;
  readonly surface: OrgListSurface;
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function purchaseOrderStatusShape(status: string): StatusShape {
  switch (status as PurchaseOrderStatus) {
    case 'draft':
      return 'draft';
    case 'issued':
      return 'active';
    case 'partially_received':
      return 'pending';
    case 'closed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'archived';
  }
}

const PO_STATUS_VALUES = [
  'draft',
  'issued',
  'partially_received',
  'closed',
  'cancelled',
] as const;

export async function ProcurementOrdersOrgListView({
  routeBase,
  surface,
  searchParams,
}: ProcurementOrdersOrgListViewProps) {
  const [t, tMarket, locale, rawParams, tCommon] = await Promise.all([
    getTranslations('procurement'),
    getTranslations('materialMarket'),
    getLocale(),
    searchParams ?? Promise.resolve({}),
    getTranslations('common'),
  ]);
  const isOwner = surface === 'owner';
  const q = typeof rawParams.q === 'string' ? rawParams.q.trim() : '';
  const statusRaw = typeof rawParams.status === 'string' ? rawParams.status : 'all';
  const statusFilter = PO_STATUS_VALUES.includes(statusRaw as (typeof PO_STATUS_VALUES)[number])
    ? statusRaw
    : undefined;
  const filtersActive = Boolean(q || (statusFilter && statusFilter !== 'all'));

  const { orders, canManage, canRead, marketEntries } = await withOrgContext(async (context) => {
    const allowed = orgListHasPermission(context, PERMISSIONS.PROCUREMENT_READ, surface);
    if (!allowed) {
      return {
        orders: [] as Awaited<ReturnType<typeof listPurchaseOrdersWithCommittedForOrg>>,
        canManage: false,
        canRead: false,
        marketEntries: [] as Awaited<ReturnType<typeof loadMaterialMarketDashboard>>,
      };
    }

    const [orders, marketEntries] = await Promise.all([
      listPurchaseOrdersWithCommittedForOrg(context, undefined, {
        ...(statusFilter && statusFilter !== 'all' ? { status: statusFilter } : {}),
        ...(q ? { search: q } : {}),
      }),
      loadMaterialMarketDashboard(context.db).catch(() => []),
    ]);

    return {
      orders,
      canManage: orgListHasPermission(context, PERMISSIONS.PROCUREMENT_MANAGE, surface),
      canRead: true,
      marketEntries,
    };
  });

  const marketSnapshots = marketEntries
    .map((entry) => entry.snapshot)
    .filter((snapshot): snapshot is NonNullable<typeof snapshot> => snapshot != null);

  if (!canRead) {
    const tEmployee =
      surface === 'employee' ? await getTranslations('employeeApp.procurement') : null;
    return (
      <MainAppPage>
        {isOwner ? <PageHeader title={t('title')} description={t('description')} /> : null}
        {isOwner ? <ProcurementSectionNav active="orders" /> : null}
        <MainAppSection>
        <EmptyState
          icon={ClipboardList}
          title={tEmployee?.('noAccess.title') ?? t('empty.orders.title')}
          description={tEmployee?.('noAccess.description') ?? t('empty.orders.body')}
        />
        </MainAppSection>
      </MainAppPage>
    );
  }

  const showManageActions = isOwner && canManage;

  return (
    <MainAppPage>
      {isOwner ? (
        <PageHeader
          title={t('title')}
          description={t('description')}
          actions={
            canManage ? (
              <Button asChild className="max-w-full">
                <Link href={`${routeBase}/new`}>
                  <Plus aria-hidden />
                  {t('newOrder')}
                </Link>
              </Button>
            ) : null
          }
        />
      ) : null}

      {isOwner ? <ProcurementSectionNav active="orders" /> : null}

      <MainAppSection>
        <AdaptiveListBody surface={surface}>
      <ProcurementOrdersListFilters
        routeBase={routeBase}
        initialQuery={q}
        initialStatus={statusRaw}
      />
      {/* Market pressure context — indication only, not a forecast */}
      {marketSnapshots.length > 0 && canRead ? (
        <MarketPressureContextBanner
          snapshots={marketSnapshots}
          title={tMarket('banner.title')}
          tradeLabels={{
            electrical: tMarket('trades.electrical'),
            plumbing: tMarket('trades.plumbing'),
            steel_rebar: tMarket('trades.steel_rebar'),
            concrete: tMarket('trades.concrete'),
          }}
          pressureLabels={{
            low: tMarket('banner.pressure.low'),
            medium: tMarket('banner.pressure.medium'),
            high: tMarket('banner.pressure.high'),
          }}
          disclaimerText={tMarket('banner.disclaimer')}
        />
      ) : null}

      {orders.length === 0 ? (
        filtersActive ? (
          <p className="text-sm text-[var(--pf-text-muted)]">{tCommon('states.noResults')}</p>
        ) : (
        <EmptyState
          icon={ClipboardList}
          title={t('empty.orders.title')}
          description={t('empty.orders.body')}
          action={
            showManageActions ? (
              <Button asChild>
                <Link href={`${routeBase}/new`}>{t('empty.orders.action')}</Link>
              </Button>
            ) : undefined
          }
        />
        )
      ) : (
        <ResponsiveTable
          items={orders}
          getRowKey={(order) => order.id}
          desktop={
            <AdaptiveListTableShell surface={surface}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('list.columns.reference')}</TableHead>
                    <TableHead>{t('list.columns.status')}</TableHead>
                    <TableHead numeric>{t('list.columns.committed')}</TableHead>
                    <TableHead>{t('list.columns.committedStatus')}</TableHead>
                    <TableHead>{t('list.columns.orderedOn')}</TableHead>
                    <TableHead>{t('list.columns.created')}</TableHead>
                    {showManageActions ? (
                      <TableHead>{t('list.columns.actions')}</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="max-w-[12rem] truncate font-medium">
                        <Link
                          href={`${routeBase}/${order.id}`}
                          className={cn(textNavLinkClassName, 'rounded-sm')}
                        >
                          {order.reference?.trim() || t('list.noReference')}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          shape={purchaseOrderStatusShape(order.status)}
                          label={t(`statuses.${order.status}` as 'statuses.draft')}
                        />
                      </TableCell>
                      <TableCell numeric>
                        <MoneyText value={money(order.committedAmount, order.currency)} />
                      </TableCell>
                      <TableCell>
                        {order.committedCost ? (
                          <StatusBadge
                            shape={
                              order.committedCost.status === 'open'
                                ? 'active'
                                : order.committedCost.status === 'cancelled'
                                  ? 'cancelled'
                                  : 'completed'
                            }
                            label={t(
                              `committedStatuses.${order.committedCost.status}` as 'committedStatuses.open',
                            )}
                          />
                        ) : order.status === 'issued' ||
                          order.status === 'partially_received' ||
                          order.status === 'closed' ? (
                          <span className="text-sm text-[var(--pf-text-secondary)]">
                            {t('committedStatuses.missing')}
                          </span>
                        ) : (
                          <span className="text-sm text-[var(--pf-text-secondary)]">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {order.orderedOn ? (
                          <span dir="ltr">
                            {intlDateTimeFormat(locale, { dateStyle: 'medium' }).format(
                              new Date(order.orderedOn),
                            )}
                          </span>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        <span dir="ltr">
                          {intlDateTimeFormat(locale, { dateStyle: 'medium' }).format(
                            order.createdAt,
                          )}
                        </span>
                      </TableCell>
                      {showManageActions ? (
                        <TableCell>
                          {order.status === 'draft' ? (
                            <IssuePurchaseOrderButton purchaseOrderId={order.id} />
                          ) : (
                            '-'
                          )}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AdaptiveListTableShell>
          }
          renderMobileCard={(order) => (
            <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
              <div className="flex min-w-0 items-start justify-between gap-2">
                <Link
                  href={`${routeBase}/${order.id}`}
                  className={cn(textNavLinkClassName, 'min-w-0 break-words rounded-sm font-semibold')}
                >
                  {order.reference?.trim() || t('list.noReference')}
                </Link>
                <StatusBadge
                  shape={purchaseOrderStatusShape(order.status)}
                  label={t(`statuses.${order.status}` as 'statuses.draft')}
                />
              </div>
              <p className="text-sm text-[var(--pf-text-secondary)]">
                <MoneyText value={money(order.committedAmount, order.currency)} />
                {order.committedCost
                  ? ` · ${t(`committedStatuses.${order.committedCost.status}` as 'committedStatuses.open')}`
                  : ''}
              </p>
              {order.orderedOn ? (
                <p className="text-xs text-[var(--pf-text-muted)]" dir="ltr">
                  {intlDateTimeFormat(locale, { dateStyle: 'medium' }).format(
                    new Date(order.orderedOn),
                  )}
                </p>
              ) : null}
              {showManageActions && order.status === 'draft' ? (
                <div className="flex flex-wrap gap-2">
                  <IssuePurchaseOrderButton purchaseOrderId={order.id} />
                </div>
              ) : null}
            </div>
          )}
        />
      )}
        </AdaptiveListBody>
      </MainAppSection>
    </MainAppPage>
  );
}
