/**
 * Meetings module domain types. Framework-free.
 *
 * Canonical records for meeting_records, meeting_attendees,
 * meeting_decisions, and meeting_action_items (schema tasks.ts ─ meetings section).
 *
 * Decision ≠ Task: Decisions are canonical records stored here.
 * Action items may optionally create/link tasks via createTaskFromActionItem.
 */

// ─── Meeting Record ───────────────────────────────────────────────────────────

export interface MeetingRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string | null;
  readonly workspaceId: string | null;
  readonly title: string;
  readonly scheduledAt: Date;
  readonly location: string | null;
  readonly notes: string | null;
  readonly createdByOrgMemberId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface MeetingListItem extends MeetingRecord {
  readonly projectName: string | null;
  readonly workspaceName: string | null;
  readonly attendeeCount: number;
  readonly decisionCount: number;
  readonly actionItemCount: number;
}

// ─── Attendees ────────────────────────────────────────────────────────────────

export interface MeetingAttendee {
  readonly id: string;
  readonly meetingId: string;
  readonly organizationId: string;
  readonly orgMemberId: string | null;
  readonly employeeId: string | null;
  readonly contactId: string | null;
  /** Free-text fallback for external attendees. */
  readonly displayName: string | null;
  /** Resolved display name for rendering (from profile, employee, contact, or free-text). */
  readonly resolvedName: string | null;
}

// ─── Decisions ────────────────────────────────────────────────────────────────

/**
 * Canonical decision record.
 * Decisions are NOT tasks — they are authoritative records of outcomes.
 * Action items under a decision may optionally create/link tasks.
 */
export interface MeetingDecision {
  readonly id: string;
  readonly organizationId: string;
  readonly meetingId: string;
  readonly title: string;
  readonly body: string | null;
  readonly decidedAt: Date | null;
  readonly decidedByOrgMemberId: string | null;
  readonly decidedByEmployeeId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ─── Action Items ─────────────────────────────────────────────────────────────

export const MEETING_ACTION_ITEM_STATUSES = ['open', 'done', 'cancelled'] as const;
export type MeetingActionItemStatus = (typeof MEETING_ACTION_ITEM_STATUSES)[number];

export interface MeetingActionItem {
  readonly id: string;
  readonly organizationId: string;
  readonly meetingId: string;
  readonly decisionId: string | null;
  readonly title: string;
  readonly assignedToOrgMemberId: string | null;
  readonly assignedToEmployeeId: string | null;
  readonly dueDate: string | null;
  /** Linked or created task (null if no task created yet). */
  readonly taskId: string | null;
  readonly status: MeetingActionItemStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ─── Detail ───────────────────────────────────────────────────────────────────

export interface MeetingDetail extends MeetingRecord {
  readonly projectName: string | null;
  readonly workspaceName: string | null;
  readonly attendees: readonly MeetingAttendee[];
  readonly decisions: readonly MeetingDecision[];
  readonly actionItems: readonly MeetingActionItem[];
}

// ─── Input types ─────────────────────────────────────────────────────────────

export interface CreateMeetingInput {
  readonly title: string;
  readonly scheduledAt: Date;
  readonly projectId?: string | null;
  readonly workspaceId?: string | null;
  readonly location?: string | null;
  readonly notes?: string | null;
}

export interface UpdateMeetingInput {
  readonly title?: string;
  readonly scheduledAt?: Date;
  readonly projectId?: string | null;
  readonly workspaceId?: string | null;
  readonly location?: string | null;
  readonly notes?: string | null;
}

export interface MeetingListFilters {
  readonly projectId?: string;
  readonly workspaceId?: string;
  readonly fromDate?: Date;
  readonly toDate?: Date;
  readonly search?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface AddAttendeeInput {
  readonly meetingId: string;
  readonly orgMemberId?: string | null;
  readonly employeeId?: string | null;
  readonly contactId?: string | null;
  readonly displayName?: string | null;
}

export interface CreateDecisionInput {
  readonly meetingId: string;
  readonly title: string;
  readonly body?: string | null;
  readonly decidedAt?: Date | null;
  readonly decidedByOrgMemberId?: string | null;
  readonly decidedByEmployeeId?: string | null;
}

export interface UpdateDecisionInput {
  readonly title?: string;
  readonly body?: string | null;
  readonly decidedAt?: Date | null;
  readonly decidedByOrgMemberId?: string | null;
  readonly decidedByEmployeeId?: string | null;
}

export interface CreateActionItemInput {
  readonly meetingId: string;
  readonly decisionId?: string | null;
  readonly title: string;
  readonly assignedToOrgMemberId?: string | null;
  readonly assignedToEmployeeId?: string | null;
  readonly dueDate?: string | null;
}

export interface UpdateActionItemInput {
  readonly title?: string;
  readonly assignedToOrgMemberId?: string | null;
  readonly assignedToEmployeeId?: string | null;
  readonly dueDate?: string | null;
  readonly status?: MeetingActionItemStatus;
}
