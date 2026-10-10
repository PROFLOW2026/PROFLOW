import {
  listContractorProjectClaims,
  listContractorProjectPayments,
  type ClaimListItem,
  type ContractorAgreementPayments,
} from '@/modules/subcontract-claims';
import { getTranslations } from 'next-intl/server';
import { NotFoundError } from '@/shared/errors';
import {
  EXTERNAL_CAPABILITIES as CAP,
  hasExternalScope,
  type ExternalContext,
} from '@/shared/external';
import { isZeroMoney, money } from '@/shared/money';
import { buildPortalHref, portalRoute } from '../../domain/routes';
import type {
  PortalProjectTarget,
  PortalSectionItem,
  PortalSectionProvider,
  PortalSectionScope,
} from '../../domain/sections';
import { BADGE } from './shared';

const OPEN_CLAIM_STATUSES = new Set<ClaimListItem['status']>(['draft', 'submitted', 'under_review', 'returned']);

function claimHref(projectId: string, claimId: string): string {
  return buildPortalHref(portalRoute('project.claim').path, { projectId, claimId });
}

function paymentsHref(projectId: string): string {
  return buildPortalHref(portalRoute('project.payments').path, { projectId });
}

/** NET claim figures only when the grant may see contract value. Titles stay either way. */
export function claimShowsNetAmount(
  context: ExternalContext,
  organizationId: string,
  claim: Pick<ClaimListItem, 'projectId' | 'vendorId' | 'agreementId'>,
): boolean {
  return hasExternalScope(
    context,
    {
      organizationId,
      projectId: claim.projectId,
      vendorId: claim.vendorId,
      subcontractAgreementId: claim.agreementId,
    },
    CAP.CONTRACT_VIEW_VALUE,
  );
}

/** NET payment / retention figures only when the grant may see payments for that agreement. */
export function paymentShowsNetAmount(
  context: ExternalContext,
  target: PortalProjectTarget,
  agreementId: string,
): boolean {
  return target.vendorIds.some((vendorId) =>
    hasExternalScope(
      context,
      {
        organizationId: target.organizationId,
        projectId: target.projectId,
        vendorId,
        subcontractAgreementId: agreementId,
      },
      CAP.PAYMENT_VIEW,
    ),
  );
}

function netAmount(
  allowed: boolean,
  value: string | null | undefined,
  currency: string,
): PortalSectionItem['amount'] {
  if (!allowed || value == null) return null;
  return { value, currency };
}

function needsContractorAction(status: ClaimListItem['status']): boolean {
  return status === 'draft' || status === 'returned';
}

function claimItem(
  claim: ClaimListItem,
  showAmount: boolean,
  certified: boolean,
  claimReference: (claimNumber: number) => string,
): PortalSectionItem {
  const action = needsContractorAction(claim.status);
  return {
    id: claim.id,
    projectId: claim.projectId,
    title: claimReference(claim.claimNumber),
    subtitle: claim.agreementTitle,
    dueAt: certified ? null : claim.periodEnd,
    statusKey: `subcontractClaims.status.${claim.status}`,
    tone: certified ? 'success' : action ? 'attention' : 'neutral',
    href: claimHref(claim.projectId, claim.id),
    amount: netAmount(
      showAmount,
      certified ? claim.currentCertified : claim.currentSubmitted,
      claim.currency,
    ),
  };
}

async function loadClaims(
  context: ExternalContext,
  scope: PortalSectionScope,
): Promise<{ organizationId: string; claim: ClaimListItem }[]> {
  const claims: { organizationId: string; claim: ClaimListItem }[] = [];
  for (const target of scope.targets) {
    try {
      const rows = await listContractorProjectClaims(context, target.organizationId, target.projectId);
      for (const claim of rows) claims.push({ organizationId: target.organizationId, claim });
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
    }
  }
  return claims;
}

async function loadPayments(
  context: ExternalContext,
  scope: PortalSectionScope,
): Promise<{ target: PortalProjectTarget; row: ContractorAgreementPayments }[]> {
  const rows: { target: PortalProjectTarget; row: ContractorAgreementPayments }[] = [];
  for (const target of scope.targets) {
    try {
      const listed = await listContractorProjectPayments(context, target.organizationId, target.projectId);
      for (const row of listed) rows.push({ target, row });
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
    }
  }
  return rows;
}

function hasRetentionBalance(row: ContractorAgreementPayments): boolean {
  const currency = row.status.currency;
  return [row.status.retention.held, row.status.retention.released, row.status.retention.remaining].some(
    (value) => !isZeroMoney(money(value, currency)),
  );
}

/** Track F: open claims. NET submitted amount only with ext.contract.view_value. */
export const openClaimsProvider: PortalSectionProvider = {
  id: 'claims.open',
  section: 'claims',
  capability: CAP.CLAIM_VIEW,
  async load(context, scope) {
    const t = await getTranslations('subcontractClaims');
    const claimReference = (claimNumber: number) => t('list.claimReference', { number: claimNumber });
    const open = (await loadClaims(context, scope)).filter((entry) => OPEN_CLAIM_STATUSES.has(entry.claim.status));
    const items = open
      .map((entry) =>
        claimItem(entry.claim, claimShowsNetAmount(context, entry.organizationId, entry.claim), false, claimReference),
      )
      .sort((a, b) => (a.dueAt ?? '9999-12-31').localeCompare(b.dueAt ?? '9999-12-31'));
    return {
      count: items.length,
      attentionCount: open.filter((entry) => needsContractorAction(entry.claim.status)).length,
      items: items.slice(0, scope.limit),
    };
  },
};

/** Track F: certified (including reassessed) claims. NET certified amount only with ext.contract.view_value. */
export const certificationsProvider: PortalSectionProvider = {
  id: 'claims.certifications',
  section: 'certifications',
  capability: CAP.CLAIM_VIEW,
  async load(context, scope) {
    const t = await getTranslations('subcontractClaims');
    const claimReference = (claimNumber: number) => t('list.claimReference', { number: claimNumber });
    const certified = (await loadClaims(context, scope))
      .filter((entry) => entry.claim.status === 'certified')
      .sort((a, b) => (b.claim.certifiedAt ?? '').localeCompare(a.claim.certifiedAt ?? ''));
    const items = certified.map((entry) =>
      claimItem(entry.claim, claimShowsNetAmount(context, entry.organizationId, entry.claim), true, claimReference),
    );
    return { count: items.length, attentionCount: 0, items: items.slice(0, scope.limit) };
  },
};

/** Track F: retention still held or released on agreements the contractor may see payments for. */
export const retentionProvider: PortalSectionProvider = {
  id: 'claims.retention',
  section: 'retention',
  capability: CAP.PAYMENT_VIEW,
  async load(context, scope) {
    const items: PortalSectionItem[] = [];
    for (const { target, row } of await loadPayments(context, scope)) {
      if (!hasRetentionBalance(row)) continue;
      items.push({
        id: row.agreementId,
        projectId: target.projectId,
        title: row.title,
        statusKey: null,
        tone: 'neutral',
        href: paymentsHref(target.projectId),
        amount: netAmount(
          paymentShowsNetAmount(context, target, row.agreementId),
          row.status.retention.remaining,
          row.status.currency,
        ),
      });
    }
    return { count: items.length, attentionCount: 0, items: items.slice(0, scope.limit) };
  },
};

/** Track F: payable position per agreement. NET payable only with ext.payment.view. */
export const paymentsProvider: PortalSectionProvider = {
  id: 'claims.payments',
  section: 'payments',
  capability: CAP.PAYMENT_VIEW,
  async load(context, scope) {
    const items: PortalSectionItem[] = [];
    let attention = 0;
    for (const { target, row } of await loadPayments(context, scope)) {
      const blocked = !row.status.eligibility.eligible && row.status.eligibility.holds.length > 0;
      if (blocked) attention += 1;
      items.push({
        id: row.agreementId,
        projectId: target.projectId,
        title: row.title,
        statusKey: blocked ? BADGE.actionRequired : null,
        tone: blocked ? 'attention' : 'neutral',
        href: paymentsHref(target.projectId),
        amount: netAmount(
          paymentShowsNetAmount(context, target, row.agreementId),
          row.status.totals.payableNet,
          row.status.currency,
        ),
      });
    }
    return { count: items.length, attentionCount: attention, items: items.slice(0, scope.limit) };
  },
};
