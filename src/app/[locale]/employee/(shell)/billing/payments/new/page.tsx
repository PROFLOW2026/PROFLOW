import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { listBillingRecords } from '@/modules/billing';
import { listClientsForOrg } from '@/modules/clients';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { todayInTimeZone } from '@/shared/dates';
import { formatMoneyDisplay } from '@/shared/money';
import { employeeRecordPaymentAction } from '../../actions';

export default async function EmployeeRecordPaymentPage() {
  const t = await getTranslations('employeeApp.billing.paymentForm');

  const payload = await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    if (!employeeHasPermission(context, PERMISSIONS.BILLING_MANAGE)) return null;

    const [records, clients] = await Promise.all([
      listBillingRecords(context, { filter: 'outstanding', limit: 100 }),
      employeeHasPermission(context, PERMISSIONS.CLIENTS_READ)
        ? listClientsForOrg(context, { status: 'active', limit: 200 }).catch(() => [])
        : Promise.resolve([]),
    ]);

    const payable = records.filter(
      (record) => record.status === 'finalized' && record.kind !== 'credit_note' && record.clientId,
    );

    return {
      records: payable,
      clients: clients.map((client) => ({ id: client.id, name: client.name })),
      defaultDate: todayInTimeZone(context.organization.timezone),
      currency: context.organization.baseCurrency ?? 'ILS',
    };
  });

  if (!payload) notFound();

  return (
    <div className="space-y-4">
      <Link
        href="/employee/billing"
        className="inline-flex text-sm text-[var(--pf-text-secondary)] hover:text-[var(--pf-text)]"
      >
        {t('back')}
      </Link>

      <form action={employeeRecordPaymentAction} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="billingRecordId" className="text-sm font-medium">
            {t('invoice')}
          </label>
          <select
            id="billingRecordId"
            name="billingRecordId"
            className="w-full rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm"
          >
            <option value="">{t('unallocated')}</option>
            {payload.records.map((record) => (
              <option key={record.id} value={record.id}>
                {(record.reference ?? record.projectName ?? record.id.slice(0, 8)) +
                  ` — ${formatMoneyDisplay(record.outstandingAmount)}`}
              </option>
            ))}
          </select>
        </div>

        {payload.clients.length > 0 ? (
          <div className="space-y-2">
            <label htmlFor="clientId" className="text-sm font-medium">
              {t('client')}
            </label>
            <select
              id="clientId"
              name="clientId"
              className="w-full rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm"
            >
              <option value="">{t('selectClient')}</option>
              {payload.clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-[var(--pf-text-secondary)]">{t('clientHint')}</p>
          </div>
        ) : null}

        <div className="space-y-2">
          <label htmlFor="amount" className="text-sm font-medium">
            {t('amount', { currency: payload.currency })}
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            className="w-full rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="paymentDate" className="text-sm font-medium">
            {t('paymentDate')}
          </label>
          <input
            id="paymentDate"
            name="paymentDate"
            type="date"
            defaultValue={payload.defaultDate}
            required
            className="w-full rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="method" className="text-sm font-medium">
            {t('method')}
          </label>
          <input
            id="method"
            name="method"
            className="w-full rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="reference" className="text-sm font-medium">
            {t('reference')}
          </label>
          <input
            id="reference"
            name="reference"
            className="w-full rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          className="min-h-[48px] w-full rounded-xl bg-[var(--pf-primary)] px-4 py-3 text-sm font-medium text-white"
        >
          {t('submit')}
        </button>
      </form>
    </div>
  );
}
