import { getContractorCoordinationSummary } from '@/modules/coordination';
import type { ContractorCoordinationSummary } from '@/modules/coordination';
import { EXTERNAL_CAPABILITIES as CAP, type ExternalContext } from '@/shared/external';
import { buildPortalHref, portalRoute } from '../../domain/routes';
import type {
  PortalSectionItem,
  PortalSectionProvider,
  PortalSectionScope,
  PortalSectionSummary,
} from '../../domain/sections';
import { BADGE, dateInPortalZone, portalToday, projectSet, singleProjectId, targetsByOrganization } from './shared';

const SUMMARY_LIMIT = 50;

/** Track H summary per organization of the scope, restricted to the scope's projects. */
async function loadSummaries(
  context: ExternalContext,
  scope: PortalSectionScope,
): Promise<ContractorCoordinationSummary> {
  const allowed = projectSet(scope.targets);
  const upcoming: ContractorCoordinationSummary['upcoming'][number][] = [];
  const pending: ContractorCoordinationSummary['pendingAcknowledgements'][number][] = [];
  for (const [organizationId, targets] of targetsByOrganization(scope.targets)) {
    const summary = await getContractorCoordinationSummary(context, {
      organizationId,
      projectId: singleProjectId(targets) ?? undefined,
      now: scope.now,
      limit: SUMMARY_LIMIT,
    });
    upcoming.push(...summary.upcoming.filter((item) => allowed.has(item.projectId)));
    pending.push(...summary.pendingAcknowledgements.filter((item) => allowed.has(item.projectId)));
  }
  return { upcoming, pendingAcknowledgements: pending };
}

function eventHref(projectId: string, eventId: string): string {
  return buildPortalHref(portalRoute('project.event').path, { projectId, eventId });
}

function eventItem(event: ContractorCoordinationSummary['upcoming'][number]): PortalSectionItem {
  return {
    id: event.id,
    projectId: event.projectId,
    title: event.title,
    subtitle: event.locationName,
    dueAt: event.startsAt.toISOString(),
    statusKey: event.needsAttention ? BADGE.awaitingResponse : null,
    tone: event.needsAttention ? 'attention' : 'neutral',
    href: eventHref(event.projectId, event.id),
  };
}

function summarize(items: readonly PortalSectionItem[], attention: number, limit: number): PortalSectionSummary {
  return { count: items.length, attentionCount: attention, items: items.slice(0, limit) };
}

export const coordinationTodayProvider: PortalSectionProvider = {
  id: 'coordination.today',
  section: 'today',
  capability: CAP.SCHEDULE_VIEW,
  async load(context, scope) {
    const today = portalToday(scope);
    const { upcoming } = await loadSummaries(context, scope);
    const todays = upcoming.filter((event) => dateInPortalZone(event.startsAt) === today);
    return summarize(
      todays.map((event) => ({ ...eventItem(event), statusKey: event.needsAttention ? BADGE.awaitingResponse : BADGE.today })),
      todays.filter((event) => event.needsAttention).length,
      scope.limit,
    );
  },
};

export const coordinationScheduleProvider: PortalSectionProvider = {
  id: 'coordination.schedule',
  section: 'schedule',
  capability: CAP.SCHEDULE_VIEW,
  async load(context, scope) {
    const { upcoming } = await loadSummaries(context, scope);
    return summarize(
      upcoming.map(eventItem),
      upcoming.filter((event) => event.needsAttention).length,
      scope.limit,
    );
  },
};

export const coordinationAcknowledgementProvider: PortalSectionProvider = {
  id: 'coordination.acknowledgements',
  section: 'acknowledgements',
  capability: CAP.EVENT_RESPOND,
  async load(context, scope) {
    const { pendingAcknowledgements } = await loadSummaries(context, scope);
    const items = pendingAcknowledgements.map<PortalSectionItem>((pending) => ({
      id: `${pending.eventId}:${pending.participantId}`,
      projectId: pending.projectId,
      title: pending.title,
      subtitle: pending.partyName,
      dueAt: (pending.preparationDeadline ?? pending.startsAt).toISOString(),
      statusKey: pending.reason === 'response' ? BADGE.awaitingResponse : BADGE.awaitingAcknowledgement,
      tone: 'attention',
      href: eventHref(pending.projectId, pending.eventId),
    }));
    return summarize(items, items.length, scope.limit);
  },
};
