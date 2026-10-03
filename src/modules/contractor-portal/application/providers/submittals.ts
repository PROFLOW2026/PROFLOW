import {
  formatSubmittalNumber,
  getContractorSubmittalSummary,
  isSubmittalOverdue,
  listContractorSubmittals,
  submittalNeedsContractorAction,
  type SubmittalListItem,
} from '@/modules/submittals';
import { EXTERNAL_CAPABILITIES as CAP } from '@/shared/external';
import { buildPortalHref, portalRoute } from '../../domain/routes';
import type { PortalSectionItem, PortalSectionMetric, PortalSectionProvider } from '../../domain/sections';
import { BADGE, portalToday } from './shared';

function metric(labelKey: string, value: number, tone: PortalSectionMetric['tone'] = 'neutral'): PortalSectionMetric {
  return { labelKey: `submittals.summary.${labelKey}`, value, tone };
}

function submittalItem(
  row: SubmittalListItem & { readonly overdue: boolean },
  today: string,
): PortalSectionItem {
  const overdue = isSubmittalOverdue(row, today);
  const action = submittalNeedsContractorAction(row.status);
  return {
    id: row.id,
    projectId: row.projectId,
    title: `${formatSubmittalNumber(row.number)} · ${row.title}`,
    subtitle: row.locationName,
    dueAt: row.dueDate,
    statusKey: overdue ? BADGE.overdue : `submittals.status.${row.status}`,
    tone: overdue ? 'danger' : action ? 'attention' : 'neutral',
    href: buildPortalHref(portalRoute('project.submittal').path, { projectId: row.projectId, submittalId: row.id }),
  };
}

/** Track KL: open submittals (awaiting review, drafts, and those returned to the contractor). */
export const submittalsProvider: PortalSectionProvider = {
  id: 'submittals.open',
  section: 'submittals',
  capability: CAP.SUBMITTAL_SUBMIT,
  async load(context, scope) {
    const today = portalToday(scope);
    let drafts = 0;
    let pendingReview = 0;
    let actionRequired = 0;
    let overdue = 0;
    const items: PortalSectionItem[] = [];
    for (const target of scope.targets) {
      const summary = await getContractorSubmittalSummary(context, {
        organizationId: target.organizationId,
        projectId: target.projectId,
        today,
      });
      drafts += summary.drafts;
      pendingReview += summary.pendingReview;
      actionRequired += summary.actionRequired;
      overdue += summary.overdueReview;
      const pending = await listContractorSubmittals(context, {
        organizationId: target.organizationId,
        projectId: target.projectId,
        status: 'pending',
        limit: 50,
      });
      const action = await listContractorSubmittals(context, {
        organizationId: target.organizationId,
        projectId: target.projectId,
        status: 'action_required',
        limit: 50,
      });
      const seen = new Set<string>();
      for (const row of [...action, ...pending]) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        items.push(submittalItem(row, today));
      }
    }
    items.sort((a, b) => (a.dueAt ?? '9999-12-31').localeCompare(b.dueAt ?? '9999-12-31'));
    return {
      count: drafts + pendingReview + actionRequired,
      attentionCount: drafts + actionRequired + overdue,
      items: items.slice(0, scope.limit),
      metrics: [
        metric('pendingReview', pendingReview),
        metric('actionRequired', actionRequired, actionRequired > 0 ? 'attention' : 'neutral'),
        metric('drafts', drafts),
        metric('overdue', overdue, overdue > 0 ? 'danger' : 'neutral'),
      ],
    };
  },
};
