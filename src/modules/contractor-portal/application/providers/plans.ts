import { getContractorPlansPortalSummary, listContractorSharedDocuments } from '@/modules/project-plans';
import { EXTERNAL_CAPABILITIES as CAP, hasExternalScope, type ExternalContext } from '@/shared/external';
import { buildPortalHref, portalRoute } from '../../domain/routes';
import type { PortalProjectTarget, PortalSectionItem, PortalSectionProvider } from '../../domain/sections';
import { BADGE } from './shared';

function planHref(projectId: string, drawingId: string): string {
  return buildPortalHref(portalRoute('project.plan').path, { projectId, drawingId });
}

function documentsHref(projectId: string): string {
  return buildPortalHref(portalRoute('project.documents').path, { projectId });
}

function vendorCan(context: ExternalContext, target: PortalProjectTarget, capability: typeof CAP.PLAN_ACKNOWLEDGE): boolean {
  return target.vendorIds.some((vendorId) =>
    hasExternalScope(
      context,
      { organizationId: target.organizationId, projectId: target.projectId, vendorId },
      capability,
    ),
  );
}

/** Track IJ: revisions published in the domain's recent window. Amounts are never included. */
export const planRevisionsProvider: PortalSectionProvider = {
  id: 'plans.revisions',
  section: 'planRevisions',
  capability: CAP.PLAN_VIEW,
  async load(context, scope) {
    const rows: { publishedAt: string | null; item: PortalSectionItem }[] = [];
    for (const target of scope.targets) {
      const summary = await getContractorPlansPortalSummary(context, {
        organizationId: target.organizationId,
        projectId: target.projectId,
      });
      if (!summary.canViewPlans) continue;
      const pending = new Set(summary.plansAwaitingAcknowledgement.map((plan) => plan.drawingId));
      const canAcknowledge = vendorCan(context, target, CAP.PLAN_ACKNOWLEDGE);
      for (const revision of summary.recentRevisions) {
        const awaiting = canAcknowledge && pending.has(revision.drawingId);
        rows.push({
          publishedAt: revision.publishedAt,
          item: {
            id: revision.drawingId,
            projectId: target.projectId,
            title: `${revision.drawingNumber} · ${revision.title}`,
            subtitle: revision.revisionLabel,
            statusKey: awaiting ? BADGE.awaitingAcknowledgement : null,
            tone: awaiting ? 'attention' : 'neutral',
            href: planHref(target.projectId, revision.drawingId),
          },
        });
      }
    }
    rows.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
    const items = rows.map((row) => row.item);
    return {
      count: items.length,
      attentionCount: items.filter((item) => item.tone === 'attention').length,
      items: items.slice(0, scope.limit),
    };
  },
};

/** Track IJ: published plans still waiting for this principal's acknowledgement. */
export const planAcknowledgementProvider: PortalSectionProvider = {
  id: 'plans.acknowledgements',
  section: 'acknowledgements',
  capability: CAP.PLAN_ACKNOWLEDGE,
  async load(context, scope) {
    const items: PortalSectionItem[] = [];
    for (const target of scope.targets) {
      const summary = await getContractorPlansPortalSummary(context, {
        organizationId: target.organizationId,
        projectId: target.projectId,
      });
      for (const plan of summary.plansAwaitingAcknowledgement) {
        items.push({
          id: plan.drawingId,
          projectId: target.projectId,
          title: `${plan.drawingNumber} · ${plan.title}`,
          subtitle: plan.revisionLabel,
          statusKey: BADGE.awaitingAcknowledgement,
          tone: 'attention',
          href: planHref(target.projectId, plan.drawingId),
        });
      }
    }
    return { count: items.length, attentionCount: items.length, items: items.slice(0, scope.limit) };
  },
};

/** Track IJ: documents shared with the contractor. Pending receipts are flagged; no amounts. */
export const sharedDocumentsProvider: PortalSectionProvider = {
  id: 'plans.documents',
  section: 'documents',
  capability: CAP.DOCUMENT_VIEW,
  async load(context, scope) {
    const rows: { sharedAt: string; item: PortalSectionItem }[] = [];
    for (const target of scope.targets) {
      const listed = await listContractorSharedDocuments(context, {
        organizationId: target.organizationId,
        projectId: target.projectId,
      });
      for (const document of listed.items) {
        const pending = document.acknowledgementRequired && !document.acknowledgedAt;
        rows.push({
          sharedAt: document.sharedAt,
          item: {
            id: document.shareId,
            projectId: target.projectId,
            title: document.title,
            subtitle: document.fileName,
            statusKey: pending ? BADGE.awaitingAcknowledgement : null,
            tone: pending ? 'attention' : 'neutral',
            href: documentsHref(target.projectId),
          },
        });
      }
    }
    rows.sort((a, b) => b.sharedAt.localeCompare(a.sharedAt));
    const items = rows.map((row) => row.item);
    return {
      count: items.length,
      attentionCount: items.filter((item) => item.tone === 'attention').length,
      items: items.slice(0, scope.limit),
    };
  },
};
