/**
 * Project AP Payment Status panel (FIN-MEDIUM-001).
 *
 * Shows the three-way split for vendor cost on a project:
 *   1. עלות מוכרת  — Recognized: vendor bills posted to project Actual.
 *   2. שולם בפועל  — Cash Paid: AP payments applied to those bills.
 *   3. יתרה לתשלום — Outstanding: open AP payable (un-matched / unpaid).
 *
 * Embedded inside the advanced details section of ProjectFinancialsPanel.
 */

import { getTranslations } from 'next-intl/server';
import { Separator } from '@/components/ui/separator';
import { MoneyText } from '@/components/patterns/money-text';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { areApPaymentsAvailable } from '@/modules/ap/domain/vendor-payments';
import { loadCachedProjectFinancials } from '../application/load-cached-project-financials';
import { loadProjectApCashPaid } from '../data/project-ap-cash-paid.repository';

export interface ProjectApPaymentStatusPanelProps {
  readonly projectId: string;
}

export async function ProjectApPaymentStatusPanel({
  projectId,
}: ProjectApPaymentStatusPanelProps) {
  const t = await getTranslations('financial.apPaymentStatus');

  const payload = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.AP_READ)) return null;

    const financials = await loadCachedProjectFinancials(projectId);
    const cashPaid = await loadProjectApCashPaid(
      context.db,
      context.organizationId,
      projectId,
      financials.currency,
    );

    return {
      recognized: financials.cost.vendorActual,
      cashPaid,
      outstanding: financials.cost.openApPayable,
      paymentsAvailable: areApPaymentsAvailable(),
    };
  });

  if (!payload) return null;

  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm font-medium">{t('title')}</p>

      <div className="flex justify-between gap-2 text-sm">
        <span className="text-[var(--pf-text-secondary)]">{t('recognized')}</span>
        <MoneyText value={payload.recognized} />
      </div>

      <div className="flex justify-between gap-2 text-sm">
        <span className="text-[var(--pf-text-secondary)]">{t('cashPaid')}</span>
        {payload.paymentsAvailable ? (
          <MoneyText value={payload.cashPaid} />
        ) : (
          <span className="text-xs text-[var(--pf-text-muted)]">{t('paymentsPending')}</span>
        )}
      </div>

      <Separator />

      <div className="flex justify-between gap-2 text-sm">
        <span className="font-medium">{t('outstanding')}</span>
        <MoneyText value={payload.outstanding} className="font-semibold" />
      </div>

      <p className="text-xs text-[var(--pf-text-muted)]">{t('hint')}</p>
    </section>
  );
}
