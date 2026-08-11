/**
 * Service / work-order domain types.
 * Work orders share the `projects` economic entity (`work_kind=work_order`).
 */

export const SERVICE_STATUSES = [
  'new',
  'scheduled',
  'in_progress',
  'waiting',
  'completed',
  'cancelled',
] as const;

export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export const SERVICE_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type ServicePriority = (typeof SERVICE_PRIORITIES)[number];

export const DISPATCH_WINDOWS = ['today', 'tomorrow', 'week'] as const;
export type DispatchWindow = (typeof DISPATCH_WINDOWS)[number];

export interface ProjectServiceDetailsRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly category: string | null;
  readonly priority: ServicePriority;
  readonly serviceStatus: ServiceStatus;
  readonly requestedDate: string | null;
  readonly scheduledStartAt: Date | null;
  readonly scheduledEndAt: Date | null;
  readonly siteAddress: string | null;
  readonly contactName: string | null;
  readonly contactPhone: string | null;
  readonly checklistTemplateId: string | null;
  readonly recurrenceDefinitionId: string | null;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface WorkOrderListItem {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly pricingMode: 'fixed' | 'open' | null;
  readonly clientId: string | null;
  readonly clientName: string | null;
  readonly location: string | null;
  readonly description: string | null;
  readonly startDate: string | null;
  readonly currency: string | null;
  readonly contractCurrency: string | null;
  readonly currentContractValue: string | null;
  readonly archivedAt: Date | null;
  readonly service: ProjectServiceDetailsRecord | null;
  /** Primary assignee display name when team assignment exists (schema gap for dedicated column). */
  readonly assigneeName: string | null;
  readonly assigneeEmployeeId: string | null;
}

export interface DispatchListItem {
  readonly projectId: string;
  readonly name: string;
  readonly clientName: string | null;
  readonly siteAddress: string | null;
  readonly serviceStatus: ServiceStatus;
  readonly priority: ServicePriority;
  readonly scheduledStartAt: Date | null;
  readonly scheduledEndAt: Date | null;
  readonly assigneeName: string | null;
  readonly assigneeEmployeeId: string | null;
}
