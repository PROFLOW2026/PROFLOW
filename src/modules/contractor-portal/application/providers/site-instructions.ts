import { getContractorInstructionSummary } from '@/modules/site-instructions';
import { EXTERNAL_CAPABILITIES as CAP } from '@/shared/external';
import { buildPortalHref, portalRoute } from '../../domain/routes';
import type { PortalSectionItem, PortalSectionProvider } from '../../domain/sections';
import { BADGE, portalToday, projectSet, singleProjectId } from './shared';

const SUMMARY_LIMIT = 50;

/** Track O: site instructions waiting for the contractor's acknowledgement. */
export const siteInstructionAcknowledgementProvider: PortalSectionProvider = {
  id: 'site-instructions.acknowledgements',
  section: 'acknowledgements',
  capability: CAP.SITE_INSTRUCTION_ACK,
  async load(context, scope) {
    const allowed = projectSet(scope.targets);
    const today = portalToday(scope);
    const summary = await getContractorInstructionSummary(context, {
      projectId: singleProjectId(scope.targets),
      limit: SUMMARY_LIMIT,
    });
    const rows = summary.items.filter((item) => allowed.has(item.projectId));
    const items = rows.map<PortalSectionItem>((row) => {
      const overdue = Boolean(row.dueDate && row.dueDate < today);
      return {
        id: row.id,
        projectId: row.projectId,
        title: `#${row.instructionNumber} · ${row.title}`,
        dueAt: row.dueDate ?? row.issuedAt.toISOString(),
        statusKey: overdue ? BADGE.overdue : BADGE.awaitingAcknowledgement,
        tone: overdue ? 'danger' : 'attention',
        href: buildPortalHref(portalRoute('project.instruction').path, {
          projectId: row.projectId,
          instructionId: row.id,
        }),
      };
    });
    const count = scope.targets.length === 1 ? summary.pendingAcknowledgements : rows.length;
    return { count, attentionCount: count, items: items.slice(0, scope.limit) };
  },
};
