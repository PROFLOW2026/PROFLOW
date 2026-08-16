/**
 * Service recurrence / service-contract templates.
 * Generating occurrences creates draft/scheduled work orders only - never Actual.
 */

export const RECURRENCE_FREQUENCIES = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
] as const;

export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export const RECURRENCE_DEFINITION_STATUSES = ['active', 'paused', 'ended'] as const;
export type RecurrenceDefinitionStatus = (typeof RECURRENCE_DEFINITION_STATUSES)[number];

export const RECURRENCE_OCCURRENCE_STATUSES = [
  'planned',
  'generated',
  'skipped',
  'cancelled',
] as const;
export type RecurrenceOccurrenceStatus = (typeof RECURRENCE_OCCURRENCE_STATUSES)[number];

/** Template pricing hint only - never auto-recognized as revenue/Actual. */
export const RECURRENCE_PRICING_MODES = ['fixed', 'open', 'none'] as const;
export type RecurrencePricingMode = (typeof RECURRENCE_PRICING_MODES)[number];

export interface RecurrenceDefinitionRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly clientId: string | null;
  readonly title: string;
  readonly siteAddress: string | null;
  readonly frequency: RecurrenceFrequency;
  readonly intervalCount: number;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly nextOccurrenceDate: string | null;
  readonly defaultDurationMinutes: number | null;
  readonly defaultPricingMode: string | null;
  readonly defaultPriceAmount: string | null;
  readonly currency: string | null;
  readonly defaultChecklistTemplateId: string | null;
  readonly defaultAssigneeEmployeeId: string | null;
  readonly status: RecurrenceDefinitionStatus;
  readonly notes: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface RecurrenceOccurrenceRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly recurrenceDefinitionId: string;
  readonly occurrenceDate: string;
  readonly status: RecurrenceOccurrenceStatus;
  readonly generatedProjectId: string | null;
  readonly skippedReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface RecurrenceDefinitionListItem extends RecurrenceDefinitionRecord {
  readonly clientName: string | null;
}

export interface RecurrenceOccurrenceListItem extends RecurrenceOccurrenceRecord {
  readonly generatedProjectName: string | null;
}
