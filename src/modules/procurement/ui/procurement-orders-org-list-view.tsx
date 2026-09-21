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

export async function ProcurementOrdersOrgListView({
  routeBase,
  surface,
}: ProcurementOrdersOrgListViewProps) {
  const t = await getTranslations('procurement');
  const locale = await getLocale();
  const isOwner = surface === 'owner';

  const { orders, canManage, canRead } = await withOrgContext(async (context) => {
    const allowed = orgListHasPermission(context, PERMISSIONS.PROCUREMENT_READ, surface);
    if (!allowed) {
      return {
        orders: [] as Awaited<ReturnType<typeof listPurchaseOrdersWithCommittedForOrg>>,
        canManage: false,
        canRead: false,
      };
    }

    return {
      orders: await listPurchaseOrdersWithCommittedForOrg(context),
      canManage: orgListHasPermission(context, PERMISSIONS.PROCUREMENT_MANAGE, surface),
      canRead: true,
    };
  });

  if (!canRead) {
    const tEmployee =
      surface === 'employee' ? await getTranslations('employeeApp.procurement') : null;
    return (
      <div className="flex min-w-0 flex-col gap-6">
        {isOwner ? <PageHeader title={t('title')} description={t('description')} /> : null}
        {isOwner ? <ProcurementSectionNav active="orders" /> : null}
        <EmptyState
          icon={ClipboardList}
          title={tEmployee?.('noAccess.title') ?? t('empty.orders.title')}
          description={tEmployee?.('noAccess.description') ?? t('empty.orders.body')}
        />
      </div>
    );
  }

  const showManageActions = isOwner && canManage;

  return (
    <div className="flex min-w-0 flex-col gap-6">
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

      {orders.length === 0 ? (
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
      ) : (
        <ResponsiveTable
          items={orders}
          getRowKey={(order) => order.id}
          desktop={
            <div className="min-w-0 rounded-lg border border-[var(--pf-border-default)]">
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
            </div>
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
    </div>
  );
}
