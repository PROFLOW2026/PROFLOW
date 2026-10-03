import { formatInstant } from '@/shared/dates';
import { allowedOutcomes, canEditDetails, canReschedule, acceptsResponses } from '../domain/lifecycle';
import { instantToWallClock } from '../domain/time';
import type { CoordinationEventDetail } from '../domain/types';
import type { DocumentRowView, IssueRowView, ManagePanelView, MatrixRowView } from './types';

/** Server-side mapping of the event detail into serializable client view models. */
export function buildDetailViews(detail: CoordinationEventDetail, locale: string, timeZone: string) {
  const fmt = (value: Date | null) => (value ? formatInstant(value, locale, timeZone) : null);
  const ackLabel = new Map(detail.requiredAcknowledgements.map((item) => [item.key, item.label]));
  const partyName = new Map(detail.contractors.map((party) => [party.id, party.tradeLabel ?? party.partyName]));

  const matrix: MatrixRowView[] = detail.contractors.map((party) => ({
    participantId: party.id,
    partyName: party.partyName,
    agreementTitle: party.agreementTitle,
    tradeLabel: party.tradeLabel,
    isRequired: party.isRequired,
    state: party.readiness.state,
    missingAcknowledgementLabels: party.readiness.missingAcknowledgementKeys.map((key) => ackLabel.get(key) ?? key),
    acknowledgementsDone: detail.requiredAcknowledgements.length - party.readiness.missingAcknowledgementKeys.length,
    acknowledgementsTotal: detail.requiredAcknowledgements.length,
    lastNote: party.latestResponse?.note ?? null,
    lastAnsweredAt: fmt(party.latestResponse?.createdAt ?? null),
    lastAnsweredBy: party.latestResponse
      ? { type: party.latestResponse.actor.type, name: party.latestResponse.actor.displayName }
      : null,
    requestedAt: fmt(party.readinessRequestedAt),
    openIssueCount: party.openIssueCount,
  }));

  const issues: IssueRowView[] = detail.issues.map((issue) => ({
    id: issue.id,
    participantId: issue.participantId,
    partyName: partyName.get(issue.participantId) ?? '',
    title: issue.title,
    description: issue.description,
    status: issue.status,
    raisedBy: { type: issue.raisedBy.type, name: issue.raisedBy.displayName },
    createdAt: fmt(issue.createdAt) ?? '',
  }));

  const documents: DocumentRowView[] = detail.documents.map((document) => ({
    id: document.id,
    title: document.title,
    contractorVisible: document.contractorVisible,
  }));

  const manage: ManagePanelView = {
    projectId: detail.projectId,
    eventId: detail.id,
    status: detail.status,
    title: detail.title,
    description: detail.description,
    kind: detail.kind,
    locationId: detail.locationId,
    locationNote: detail.locationNote,
    workPackageId: detail.workPackageId,
    phaseId: detail.phaseId,
    startsAtLocal: instantToWallClock(detail.startsAt, timeZone),
    endsAtLocal: detail.endsAt ? instantToWallClock(detail.endsAt, timeZone) : '',
    preparationDeadlineLocal: detail.preparationDeadline ? instantToWallClock(detail.preparationDeadline, timeZone) : '',
    overridden: detail.readiness.overridden,
    allowedOutcomes: allowedOutcomes(detail.status),
    canReschedule: canReschedule(detail.status),
    canEdit: canEditDetails(detail.status),
    acceptsResponses: acceptsResponses(detail.status),
    invitedAgreementIds: detail.contractors.map((party) => party.subcontractAgreementId).filter((id): id is string => Boolean(id)),
    invitedUserIds: detail.internalParticipants.map((participant) => participant.userId),
    linkedDocumentIds: detail.documents.map((document) => document.documentId),
  };

  return { matrix, issues, documents, manage };
}
