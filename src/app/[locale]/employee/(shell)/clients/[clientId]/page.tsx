import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { getClientById } from '@/modules/clients';
import { listOrgContracts } from '@/modules/projects';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { formatMoneyDisplay, money } from '@/shared/money';
import { cn } from '@/shared/ui/cn';
import {
  employeeListPanelClass,
  employeeListRowClass,
  employeePageStackClass,
} from '@/modules/employee-app/ui/employee-surface-styles';

interface PageProps {
  params: Promise<{ clientId: string }>;
}

export default async function EmployeeClientDetailPage({ params }: PageProps) {
  const { clientId } = await params;
  const t = await getTranslations('employeeApp.clients.detail');
  const tContracts = await getTranslations('employeeApp.contracts');

  const payload = await withOrgContext(async (context) => {
    if (!employeeHasPermission(context, PERMISSIONS.CLIENTS_READ)) return null;

    const client = await getClientById(context, clientId);
    const canReadContracts = employeeHasPermission(context, PERMISSIONS.CONTRACTS_READ);
    const contracts = canReadContracts
      ? await listOrgContracts(context, { clientId, limit: 20 })
      : [];

    return { client, contracts, canReadContracts };
  });

  if (!payload) notFound();

  const { client, contracts, canReadContracts } = payload;

  return (
    <div className={employeePageStackClass}>
      <Link
        href="/employee/clients"
        className="inline-flex text-sm text-[var(--pf-text-secondary)] hover:text-[var(--pf-text)]"
      >
        {t('back')}
      </Link>

      <header className="space-y-1">
        <h2 className="text-xl font-bold text-[var(--pf-text-primary)]">{client.name}</h2>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('status')}: {client.status}</p>
      </header>

      <dl className="space-y-2 rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-surface)] px-4 py-3 text-sm">
        {client.phone ? (
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--pf-text-secondary)]">{t('phone')}</dt>
            <dd>{client.phone}</dd>
          </div>
        ) : null}
        {client.email ? (
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--pf-text-secondary)]">{t('email')}</dt>
            <dd className="truncate">{client.email}</dd>
          </div>
        ) : null}
        {client.city ? (
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--pf-text-secondary)]">{t('city')}</dt>
            <dd>{client.city}</dd>
          </div>
        ) : null}
      </dl>

      {canReadContracts ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-[var(--pf-text-primary)]">{t('contracts')}</h3>
          <ul className={employeeListPanelClass}>
            {contracts.map((contract) => (
              <li
                key={contract.id}
                className={cn(employeeListRowClass, 'flex items-center justify-between gap-3')}
              >
                <span className="min-w-0 truncate text-sm">
                  {contract.name ?? contract.contractNumber ?? contract.projectName}
                </span>
                <span className="shrink-0 text-sm text-[var(--pf-text-secondary)]">
                  {contract.currentAmount
                    ? formatMoneyDisplay(money(contract.currentAmount, contract.currency))
                    : contract.status}
                </span>
              </li>
            ))}
            {contracts.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-[var(--pf-text-secondary)]">
                {tContracts('empty')}
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
