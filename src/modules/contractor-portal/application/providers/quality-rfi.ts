import { getContractorQualitySummary } from '@/modules/defects';
import { getContractorRfiSummary } from '@/modules/rfi';
import { EXTERNAL_CAPABILITIES as CAP } from '@/shared/external';
import type { PortalSectionMetric, PortalSectionProvider } from '../../domain/sections';
import { portalToday } from './shared';

function metric(labelKey: string, value: number, tone: PortalSectionMetric['tone'] = 'neutral'): PortalSectionMetric {
  return { labelKey: `contractorPortal.metrics.${labelKey}`, value, tone };
}

/** Track KL: RFI counts per project (the domain exposes counts, not a dashboard item list). */
export const rfiSummaryProvider: PortalSectionProvider = {
  id: 'rfi.summary',
  section: 'rfis',
  capability: { anyOf: [CAP.RFI_VIEW, CAP.RFI_RAISE] },
  async load(context, scope) {
    const today = portalToday(scope);
    let drafts = 0;
    let awaitingAnswer = 0;
    let answered = 0;
    let overdue = 0;
    for (const target of scope.targets) {
      const summary = await getContractorRfiSummary(context, {
        organizationId: target.organizationId,
        projectId: target.projectId,
        today,
      });
      drafts += summary.drafts;
      awaitingAnswer += summary.awaitingAnswer;
      answered += summary.answered;
      overdue += summary.overdue;
    }
    return {
      count: drafts + awaitingAnswer + answered,
      attentionCount: overdue,
      items: [],
      metrics: [
        metric('rfiAwaitingAnswer', awaitingAnswer),
        metric('rfiAnswered', answered, answered > 0 ? 'success' : 'neutral'),
        metric('rfiDrafts', drafts),
        metric('overdue', overdue, overdue > 0 ? 'danger' : 'neutral'),
      ],
    };
  },
};

/** Track MN: defects assigned to the contractor's vendors on each project. */
export const defectSummaryProvider: PortalSectionProvider = {
  id: 'defects.summary',
  section: 'defects',
  capability: CAP.DEFECT_WORK,
  async load(context, scope) {
    let toFix = 0;
    let overdue = 0;
    let reopened = 0;
    let awaitingVerification = 0;
    for (const target of scope.targets) {
      const summary = await getContractorQualitySummary(context, {
        organizationId: target.organizationId,
        projectId: target.projectId,
      });
      toFix += summary.defectsToFix;
      overdue += summary.defectsOverdue;
      reopened += summary.defectsReopened;
      awaitingVerification += summary.defectsAwaitingVerification;
    }
    return {
      count: toFix + awaitingVerification,
      attentionCount: overdue,
      items: [],
      metrics: [
        metric('defectsToFix', toFix, toFix > 0 ? 'attention' : 'neutral'),
        metric('overdue', overdue, overdue > 0 ? 'danger' : 'neutral'),
        metric('defectsReopened', reopened, reopened > 0 ? 'attention' : 'neutral'),
        metric('awaitingVerification', awaitingVerification),
      ],
    };
  },
};
