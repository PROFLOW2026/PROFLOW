import { EXTERNAL_CAPABILITIES, hasExternalScope, type ExternalContext } from '@/shared/external';
import { resolveExternalProjectTargets } from '@/modules/site-log/shared/external-scope';
import {
  listPublicationActions,
  listVisiblePublicationsInProject,
  type PublicationRow,
} from '../data/site-meetings.repository';

export interface ContractorMinutesAction {
  readonly title: string;
  readonly dueDate: string | null;
  readonly taskId: string | null;
}

export interface ContractorMinutesView {
  readonly publicationId: string;
  readonly meetingId: string;
  readonly version: number;
  readonly title: string;
  readonly meetingType: PublicationRow['meetingType'];
  readonly scheduledAt: Date;
  readonly heldAt: Date | null;
  readonly location: string | null;
  readonly agenda: string | null;
  readonly minutes: string | null;
  readonly decisions: PublicationRow['decisions'];
  readonly attendees: PublicationRow['attendees'];
  readonly publishedAt: Date;
  /** Only the action items assigned to the viewer's own company. */
  readonly myActions: readonly ContractorMinutesAction[];
}

/** Latest published minutes of meetings the contractor attended (RLS: own vendor party row). */
export async function listContractorMeetingMinutes(
  context: ExternalContext,
  projectId: string,
  options: { readonly limit?: number } = {},
): Promise<ContractorMinutesView[]> {
  const targets = await resolveExternalProjectTargets(context, projectId, EXTERNAL_CAPABILITIES.PROJECT_VIEW);
  if (targets.length === 0) return [];
  const rows = await listVisiblePublicationsInProject(
    context.db,
    projectId,
    [...new Set(targets.map((target) => target.organizationId))],
    Math.min(options.limit ?? 40, 100) * 3,
  );
  const latestByMeeting = new Map<string, PublicationRow>();
  for (const row of rows) {
    const current = latestByMeeting.get(row.meetingId);
    if (!current || row.version > current.version) latestByMeeting.set(row.meetingId, row);
  }
  const latest = [...latestByMeeting.values()]
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, Math.min(options.limit ?? 40, 100));
  const actions = await listPublicationActions(
    context.db,
    latest.map((row) => row.id),
  );
  return latest.map((row) => ({
    publicationId: row.id,
    meetingId: row.meetingId,
    version: row.version,
    title: row.title,
    meetingType: row.meetingType,
    scheduledAt: row.scheduledAt,
    heldAt: row.heldAt,
    location: row.location,
    agenda: row.agenda,
    minutes: row.minutes,
    decisions: row.decisions,
    attendees: row.attendees,
    publishedAt: row.publishedAt,
    myActions: actions
      .filter(
        (action) =>
          action.publicationId === row.id &&
          action.vendorId !== null &&
          hasExternalScope(
            context,
            {
              organizationId: action.organizationId,
              projectId: action.projectId,
              vendorId: action.vendorId,
              subcontractAgreementId: action.subcontractAgreementId,
            },
            EXTERNAL_CAPABILITIES.PROJECT_VIEW,
          ),
      )
      .map((action) => ({ title: action.title, dueDate: action.dueDate, taskId: action.taskId })),
  }));
}
