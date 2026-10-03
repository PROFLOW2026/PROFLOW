import type {
  CoordinationAcknowledgementItem,
  CoordinationEventKind,
  CoordinationEventStatus,
  CoordinationIssueStatus,
  CoordinationOutcome,
  CoordinationOverrideDecision,
  CoordinationResponseStatus,
} from '@drizzle/schema';
import type { EventReadiness, EventReadinessState, PartyReadiness } from './readiness';

export type {
  CoordinationAcknowledgementItem,
  CoordinationEventKind,
  CoordinationEventStatus,
  CoordinationIssueStatus,
  CoordinationOutcome,
  CoordinationOverrideDecision,
  CoordinationResponseStatus,
};

export interface ActorView {
  readonly type: 'internal' | 'external';
  readonly displayName: string | null;
}

export interface CoordinationEventSummary {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly kind: CoordinationEventKind;
  readonly status: CoordinationEventStatus;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly preparationDeadline: Date | null;
  readonly locationName: string | null;
  readonly locationNote: string | null;
  readonly readiness: EventReadinessState;
  readonly overridden: boolean;
  readonly requiredCount: number;
  readonly requiredReadyCount: number;
  readonly contractorCount: number;
}

export interface CoordinationResponseView {
  readonly id: string;
  readonly participantId: string;
  readonly status: CoordinationResponseStatus;
  readonly note: string | null;
  readonly acknowledgedKeys: readonly string[];
  readonly issueRaised: boolean;
  readonly eventStartsAtSnapshot: Date;
  /** Recorded before the current readiness epoch (event was rescheduled with reconfirmation). */
  readonly superseded: boolean;
  readonly createdAt: Date;
  readonly actor: ActorView;
}

export interface CoordinationIssueView {
  readonly id: string;
  readonly participantId: string;
  readonly responseId: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly status: CoordinationIssueStatus;
  readonly taskId: string | null;
  readonly raisedBy: ActorView;
  readonly createdAt: Date;
  readonly resolvedAt: Date | null;
}

export interface ContractorPartyView {
  readonly id: string;
  readonly vendorId: string;
  readonly subcontractAgreementId: string | null;
  readonly partyName: string;
  readonly agreementTitle: string | null;
  readonly tradeLabel: string | null;
  readonly isRequired: boolean;
  readonly readinessRequestedAt: Date | null;
  readonly readiness: PartyReadiness;
  readonly latestResponse: CoordinationResponseView | null;
  readonly openIssueCount: number;
}

export interface InternalParticipantView {
  readonly id: string;
  readonly userId: string;
  readonly displayName: string;
  readonly tradeLabel: string | null;
}

export interface CoordinationRescheduleView {
  readonly id: string;
  readonly previousStartsAt: Date;
  readonly previousEndsAt: Date | null;
  readonly newStartsAt: Date;
  readonly newEndsAt: Date | null;
  readonly reason: string;
  readonly requiresReconfirmation: boolean;
  readonly actorName: string | null;
  readonly createdAt: Date;
}

export interface CoordinationOverrideView {
  readonly id: string;
  readonly decision: CoordinationOverrideDecision;
  readonly reason: string;
  readonly actorName: string | null;
  readonly createdAt: Date;
}

export interface CoordinationOutcomeView {
  readonly id: string;
  readonly outcome: CoordinationOutcome;
  readonly actualStartAt: Date | null;
  readonly actualEndAt: Date | null;
  readonly note: string | null;
  readonly actorName: string | null;
  readonly createdAt: Date;
}

export interface CoordinationDocumentView {
  readonly id: string;
  readonly documentId: string;
  readonly title: string;
  readonly contractorVisible: boolean;
}

export interface CoordinationEventDetail {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly title: string;
  readonly description: string | null;
  readonly kind: CoordinationEventKind;
  readonly status: CoordinationEventStatus;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly preparationDeadline: Date | null;
  readonly locationId: string | null;
  readonly locationName: string | null;
  readonly locationNote: string | null;
  readonly workPackageId: string | null;
  readonly workPackageName: string | null;
  readonly phaseId: string | null;
  readonly phaseName: string | null;
  readonly requiredAcknowledgements: readonly CoordinationAcknowledgementItem[];
  readonly readinessEpochAt: Date;
  readonly readiness: EventReadiness;
  readonly contractors: readonly ContractorPartyView[];
  readonly internalParticipants: readonly InternalParticipantView[];
  readonly responses: readonly CoordinationResponseView[];
  readonly issues: readonly CoordinationIssueView[];
  readonly reschedules: readonly CoordinationRescheduleView[];
  readonly overrides: readonly CoordinationOverrideView[];
  readonly outcomes: readonly CoordinationOutcomeView[];
  readonly documents: readonly CoordinationDocumentView[];
  readonly canManage: boolean;
}

/** Calendar/timeline source item (no money, no other-party detail). */
export interface CoordinationCalendarItem {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly status: CoordinationEventStatus;
  readonly readiness: EventReadinessState;
  readonly locationName: string | null;
}

/** One invitation of the calling contractor (portal). */
export interface ContractorInvitationView {
  readonly participantId: string;
  readonly vendorId: string;
  readonly subcontractAgreementId: string | null;
  readonly partyName: string;
  readonly tradeLabel: string | null;
  readonly isRequired: boolean;
  readonly latestStatus: CoordinationResponseStatus | null;
  readonly latestRespondedAt: Date | null;
  readonly missingAcknowledgementKeys: readonly string[];
  readonly canRespond: boolean;
}

export interface ContractorEventListItem {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly title: string;
  readonly kind: CoordinationEventKind;
  readonly status: CoordinationEventStatus;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly preparationDeadline: Date | null;
  readonly locationName: string | null;
  /** Organization display time zone (site times are shown in it). */
  readonly timeZone: string;
  readonly invitations: readonly ContractorInvitationView[];
  /** At least one invitation still needs an answer or an acknowledgement. */
  readonly needsAttention: boolean;
}

export interface ContractorEventDetail extends ContractorEventListItem {
  readonly description: string | null;
  readonly locationNote: string | null;
  readonly requiredAcknowledgements: readonly CoordinationAcknowledgementItem[];
  readonly responses: readonly CoordinationResponseView[];
  readonly issues: readonly CoordinationIssueView[];
  readonly reschedules: readonly CoordinationRescheduleView[];
  readonly documents: readonly CoordinationDocumentView[];
}

/** Portal dashboard summary (Track R). */
export interface ContractorCoordinationSummary {
  readonly upcoming: readonly ContractorEventListItem[];
  readonly pendingAcknowledgements: readonly {
    readonly eventId: string;
    readonly organizationId: string;
    readonly projectId: string;
    readonly title: string;
    readonly startsAt: Date;
    readonly preparationDeadline: Date | null;
    readonly participantId: string;
    readonly partyName: string;
    /** 'response' = no answer yet since the readiness epoch; 'acknowledgement' = required items missing. */
    readonly reason: 'response' | 'acknowledgement';
    readonly missingAcknowledgementKeys: readonly string[];
  }[];
}
