import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { Link } from '@/shared/i18n/navigation';
import { getPurchaseOrderById, type PurchaseOrderStatus } from '@/modules/procurement';
import { withOrgContext } from '@/shared/auth/session';
import { intlDateTimeFormat } from '@/shared/i18n/intl-locale';
import { money } from '@/shared/money/money';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';

function orderStatusShape(status: string): StatusShape {
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

export default async function EmployeePurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ purchaseOrderId: string }>;
}) {
  const { purchaseOrderId } = await params;
  const t = await getTranslations('employeeApp.procurement');
  const tProcurement = await getTranslations('procurement');
  const locale = await getLocale();

  const data = await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    if (!employeeHasPermission(context, PERMISSIONS.PROCUREMENT_READ)) return null;
    try {
      return await getPurchaseOrderById(context, purchaseOrderId);
    } catch {
      return null;
    }
  });

  if (!data) notFound();

  const { order, lines, receipts } = data;

  return (
    <div className="space-y-4">
      <Link
        href="/employee/procurement"
        className="inline-flex text-sm text-[var(--pf-text-secondary)] hover:text-[var(--pf-text)]"
      >
        {t('detail.back')}
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">
          {order.reference?.trim() || tProcurement('list.noReference')}
        </h1>
        <StatusBadge
          shape={orderStatusShape(order.status)}
          label={tProcurement(`statuses.${order.status}` as 'statuses.draft')}
        />
      </div>
      <p className="text-sm">
        <span className="text-[var(--pf-text-muted)]">{tProcurement('list.columns.committed')} </span>
        <MoneyText value={money(order.committedAmount, order.currency)} />
      </p>
      {order.orderedOn ? (
        <p className="text-sm text-[var(--pf-text-secondary)]" dir="ltr">
          {intlDateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(order.orderedOn))}
        </p>
      ) : null}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{tProcurement('detail.linesTitle')}</h2>
        <ul className="space-y-2">
          {lines.map((line) => (
            <li
              key={line.id}
              className="rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm"
            >
              <p className="font-medium">{line.description}</p>
              <p className="text-[var(--pf-text-secondary)]" dir="ltr">
                {tProcurement('receive.ordered')}: {line.quantity}
                {' · '}
                {tProcurement('receive.received')}: {line.receivedQuantity}
                {' · '}
                {tProcurement('receive.remaining')}: {line.remainingQuantity}
              </p>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{tProcurement('receive.receiptsTitle')}</h2>
        {receipts.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{tProcurement('receive.emptyReceipts')}</p>
        ) : (
          <ul className="space-y-2">
            {receipts.map((receipt) => (
              <li
                key={receipt.id}
                className="rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm"
              >
                <p dir="ltr">{receipt.receivedOn}</p>
                {receipt.reference ? <p>{receipt.reference}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
