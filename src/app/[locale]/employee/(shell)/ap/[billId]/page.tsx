import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { Link } from '@/shared/i18n/navigation';
import { getApBillDetail, type ApBillStatus } from '@/modules/ap';
import { getVendorById } from '@/modules/vendors';
import { withOrgContext } from '@/shared/auth/session';
import { intlDateTimeFormat } from '@/shared/i18n/intl-locale';
import { money } from '@/shared/money/money';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';

function billStatusShape(status: string): StatusShape {
  switch (status as ApBillStatus) {
    case 'draft':
      return 'draft';
    case 'open':
      return 'active';
    case 'partially_matched':
      return 'pending';
    case 'matched':
      return 'completed';
    case 'void':
      return 'cancelled';
    default:
      return 'archived';
  }
}

export default async function EmployeeApBillDetailPage({
  params,
}: {
  params: Promise<{ billId: string }>;
}) {
  const { billId } = await params;
  const t = await getTranslations('employeeApp.ap');
  const tAp = await getTranslations('ap');
  const locale = await getLocale();

  const data = await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    if (!employeeHasPermission(context, PERMISSIONS.AP_READ)) return null;
    const detail = await getApBillDetail(context, billId);
    if (!detail) return null;
    let vendorName: string | null = null;
    if (employeeHasPermission(context, PERMISSIONS.VENDORS_READ)) {
      try {
        vendorName = (await getVendorById(context, detail.bill.vendorId)).name;
      } catch {
        vendorName = null;
      }
    }
    return {
      ...detail,
      vendorName,
      canReadProcurement: employeeHasPermission(context, PERMISSIONS.PROCUREMENT_READ),
    };
  });

  if (!data) notFound();

  const { bill, lines, vendorName, canReadProcurement } = data;
  const formatDate = (value: string | null) =>
    value
      ? intlDateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value))
      : '—';

  return (
    <div className="space-y-4">
      <Link
        href="/employee/ap"
        className="inline-flex text-sm text-[var(--pf-text-secondary)] hover:text-[var(--pf-text)]"
      >
        {t('detail.back')}
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">
          {bill.reference?.trim() || tAp('list.noReference')}
        </h1>
        <StatusBadge
          shape={billStatusShape(bill.status)}
          label={tAp(`statuses.${bill.status}` as 'statuses.open')}
        />
      </div>
      {vendorName ? <p className="text-sm">{vendorName}</p> : null}
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-[var(--pf-text-muted)]">{tAp('list.columns.billDate')}</dt>
          <dd dir="ltr">{formatDate(bill.billDate)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--pf-text-muted)]">{tAp('detail.dueDate')}</dt>
          <dd dir="ltr">{formatDate(bill.dueDate)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--pf-text-muted)]">{tAp('list.columns.gross')}</dt>
          <dd>
            <MoneyText value={money(bill.grossAmount ?? bill.totalAmount, bill.currency)} />
          </dd>
        </div>
      </dl>
      {bill.purchaseOrderId && canReadProcurement ? (
        <p className="text-sm">
          <Link href={`/employee/procurement/${bill.purchaseOrderId}`} className="underline">
            {t('detail.purchaseOrder')}
          </Link>
        </p>
      ) : null}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{t('detail.lines')}</h2>
        <ul className="space-y-2">
          {lines.map((line) => (
            <li
              key={line.id}
              className="rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm"
            >
              <p className="font-medium">{line.description}</p>
              <p className="text-[var(--pf-text-secondary)]" dir="ltr">
                {line.quantity} · <MoneyText value={money(line.lineTotal, line.currency)} />
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
