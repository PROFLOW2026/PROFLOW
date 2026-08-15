/**
 * Safety / HSE domain types. Framework-free.
 */

export const SAFETY_RECORD_TYPES = [
  'incident',
  'near_miss',
  'accident',
  'hazard',
  'observation',
  'toolbox_talk',
  'ppe_issue',
] as const;
export type SafetyRecordType = (typeof SAFETY_RECORD_TYPES)[number];

export const SAFETY_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type SafetySeverity = (typeof SAFETY_SEVERITIES)[number];

export const SAFETY_RECORD_STATUSES = ['open', 'in_progress', 'closed', 'cancelled'] as const;
export type SafetyRecordStatus = (typeof SAFETY_RECORD_STATUSES)[number];

export const SAFETY_ACTION_STATUSES = ['open', 'in_progress', 'done', 'cancelled'] as const;
export type SafetyActionStatus = (typeof SAFETY_ACTION_STATUSES)[number];

/** Documents owner type for safety records (documents catalog must accept this). */
export const SAFETY_RECORD_DOCUMENT_OWNER = 'safety_record' as const;

export interface SafetyRecordRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string | null;
  readonly recordType: SafetyRecordType;
  readonly occurredAt: Date;
  readonly reporterUserId: string | null;
  readonly severity: SafetySeverity;
  readonly title: string;
  readonly description: string;
  readonly peopleInvolved: string | null;
  readonly immediateAction: string | null;
  readonly status: SafetyRecordStatus;
  readonly closedAt: Date | null;
  readonly closedByUserId: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SafetyCorrectiveActionRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly safetyRecordId: string;
  readonly title: string;
  readonly description: string | null;
  readonly ownerUserId: string | null;
  readonly dueDate: string | null;
  readonly status: SafetyActionStatus;
  readonly closedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SafetyToolboxTalkRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly safetyRecordId: string;
  readonly topic: string;
  readonly talkDate: string;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SafetyToolboxAttendeeRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly toolboxTalkId: string;
  readonly employeeId: string | null;
  readonly attendeeName: string;
  readonly acknowledgedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SafetyRecordDetail extends SafetyRecordRecord {
  readonly actions: readonly SafetyCorrectiveActionRecord[];
  readonly toolboxTalk: SafetyToolboxTalkRecord | null;
  readonly attendees: readonly SafetyToolboxAttendeeRecord[];
}

export interface SafetyListFilters {
  readonly projectId?: string;
  readonly recordType?: SafetyRecordType;
  readonly status?: SafetyRecordStatus;
  readonly severity?: SafetySeverity;
  readonly limit?: number;
  readonly offset?: number;
}

export interface SafetySummary {
  readonly openRecords: number;
  readonly overdueActions: number;
  readonly bySeverity: Readonly<Record<SafetySeverity, number>>;
  readonly byType: Readonly<Record<SafetyRecordType, number>>;
  readonly byProject: readonly { readonly projectId: string; readonly count: number }[];
}
