import type { CoordinationFormOptions } from '../application/queries';
import type {
  CoordinationAcknowledgementItem,
  CoordinationEventKind,
  CoordinationEventStatus,
  CoordinationIssueStatus,
  CoordinationOutcome,
  CoordinationResponseStatus,
} from '../domain/types';
import type { EventReadinessState, PartyReadinessState } from '../domain/readiness';

/** Serializable view models handed to client components (dates pre-formatted in the org time zone). */

export type CoordinationFormOptionsView = CoordinationFormOptions;

export interface MatrixRowView {
  readonly participantId: string;
  readonly partyName: string;
  readonly agreementTitle: string | null;
  readonly tradeLabel: string | null;
  readonly isRequired: boolean;
  readonly state: PartyReadinessState;
  readonly missingAcknowledgementLabels: readonly string[];
  readonly acknowledgementsDone: number;
  readonly acknowledgementsTotal: number;
  readonly lastNote: string | null;
  readonly lastAnsweredAt: string | null;
  readonly lastAnsweredBy: { readonly type: 'internal' | 'external'; readonly name: string | null } | null;
  readonly requestedAt: string | null;
  readonly openIssueCount: number;
}

export interface IssueRowView {
  readonly id: string;
  readonly participantId: string;
  readonly partyName: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: CoordinationIssueStatus;
  readonly raisedBy: { readonly type: 'internal' | 'external'; readonly name: string | null };
  readonly createdAt: string;
}

export interface ManagePanelView {
  readonly projectId: string;
  readonly eventId: string;
  readonly status: CoordinationEventStatus;
  readonly title: string;
  readonly description: string | null;
  readonly kind: CoordinationEventKind;
  readonly locationId: string | null;
  readonly locationNote: string | null;
  readonly workPackageId: string | null;
  readonly phaseId: string | null;
  /** datetime-local values in the org time zone. */
  readonly startsAtLocal: string;
  readonly endsAtLocal: string;
  readonly preparationDeadlineLocal: string;
  readonly overridden: boolean;
  readonly allowedOutcomes: readonly CoordinationOutcome[];
  readonly canReschedule: boolean;
  readonly canEdit: boolean;
  readonly acceptsResponses: boolean;
  readonly invitedAgreementIds: readonly string[];
  readonly invitedUserIds: readonly string[];
  readonly linkedDocumentIds: readonly string[];
}

export interface DocumentRowView {
  readonly id: string;
  readonly title: string;
  readonly contractorVisible: boolean;
}

export interface PortalRespondView {
  readonly projectId: string;
  readonly eventId: string;
  readonly participantId: string;
  readonly partyName: string;
  readonly latestStatus: CoordinationResponseStatus | null;
  readonly acknowledgements: readonly (CoordinationAcknowledgementItem & { readonly done: boolean })[];
}

export type { EventReadinessState };
