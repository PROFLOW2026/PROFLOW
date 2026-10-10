import {
  listContractorCertifiedReceiptForecast,
  sumCertifiedPayableNet,
} from '@/modules/subcontract-claims/application/certified-receipt-forecast';
import { getTranslations } from 'next-intl/server';
import { NotFoundError } from '@/shared/errors';
import { EXTERNAL_CAPABILITIES as CAP } from '@/shared/external';
import { buildPortalHref, portalRoute } from '../../domain/routes';
import type { PortalSectionItem, PortalSectionProvider } from '../../domain/sections';
import { claimShowsNetAmount } from './claims';

function claimHref(projectId: string, claimId: string): string {
  return buildPortalHref(portalRoute('project.claim').path, { projectId, claimId });
}

/** FINANCE tab: expected receipts from certified NET payables (not bank payment). */
export const certifiedCashFlowProvider: PortalSectionProvider = {
  id: 'claims.cashFlowForecast',
  section: 'cashFlowForecast',
  capability: CAP.PAYMENT_VIEW,
  async load(context, scope) {
    const t = await getTranslations('subcontractClaims');
    const items: PortalSectionItem[] = [];
    const allEntries = [];

    for (const target of scope.targets) {
      try {
        const entries = await listContractorCertifiedReceiptForecast(
          context,
          target.organizationId,
          target.projectId,
        );
        allEntries.push(...entries);
        for (const entry of entries) {
          const payableLine = entry.lines.find((line) => line.lineKey === 'payable');
          if (!payableLine) continue;
          const showAmount = claimShowsNetAmount(context, target.organizationId, {
            projectId: entry.facts.projectId,
            vendorId: target.vendorIds[0] ?? '',
            agreementId: entry.facts.agreementId,
          });
          items.push({
            id: `${entry.facts.payableBasisId}:payable`,
            projectId: entry.facts.projectId,
            title: t('list.claimReference', { number: entry.facts.claimNumber }),
            subtitle: entry.facts.agreementTitle,
            dueAt: payableLine.dueDate,
            statusKey: 'contractorPortal.cashFlow.expectedReceipt',
            tone: payableLine.certainty === 'uncertain' ? 'attention' : 'neutral',
            href: claimHref(entry.facts.projectId, entry.facts.claimId),
            amount: showAmount
              ? { value: payableLine.amount.amount, currency: payableLine.amount.currency }
              : null,
          });
        }
      } catch (error) {
        if (!(error instanceof NotFoundError)) throw error;
      }
    }

    items.sort((a, b) => (a.dueAt ?? '9999-12-31').localeCompare(b.dueAt ?? '9999-12-31'));
    const totalNet = sumCertifiedPayableNet(allEntries);

    return {
      count: items.length,
      attentionCount: items.filter((item) => item.tone === 'attention').length,
      items: items.slice(0, scope.limit),
      metrics: totalNet
        ? [
            {
              labelKey: 'contractorPortal.cashFlow.totalExpected',
              value: Number.parseFloat(totalNet),
            },
          ]
        : undefined,
    };
  },
};
