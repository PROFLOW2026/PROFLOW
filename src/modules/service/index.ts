/** Service module - work orders / dispatch (Agent 6) + recurrence (Agent 7). */

export { createWorkOrder } from './application/create-work-order';
export { updateWorkOrder, updateServiceStatus } from './application/update-work-order';
export { listWorkOrdersForOrg, getWorkOrderDetail } from './application/list-work-orders';
export type { WorkOrderDetail } from './application/list-work-orders';
export {
  createWorkOrderBilling,
  getWorkOrderBillingLink,
} from './application/create-work-order-billing';
export type { CreateWorkOrderBillingResult } from './application/create-work-order-billing';
export { listDispatchBoard, rescheduleWorkOrder } from './application/dispatch';
export { upsertWorkOrderDispatchBooking } from './application/dispatch-booking';
export {
  listWorkOrderChecklistTemplateOptions,
  getWorkOrderChecklistGateState,
} from './application/work-order-checklist';
export type {
  WorkOrderChecklistTemplateOption,
  WorkOrderChecklistGateState,
} from './application/work-order-checklist';

export {
  SERVICE_STATUSES,
  SERVICE_PRIORITIES,
  DISPATCH_WINDOWS,
} from './domain/types';
export type {
  ServiceStatus,
  ServicePriority,
  DispatchWindow,
  ProjectServiceDetailsRecord,
  WorkOrderListItem,
  DispatchListItem,
} from './domain/types';

export {
  canTransitionServiceStatus,
  isTerminalServiceStatus,
  isServiceStatus,
  projectStatusForServiceStatus,
} from './domain/service-status';

export {
  composeWorkOrderBillingAmount,
} from './domain/work-order-billing';
export type {
  WorkOrderBillingComposition,
  WorkOrderBillingCompositionInput,
} from './domain/work-order-billing';

export {
  isWorkOrderChecklistRequired,
  hasSubmittedWorkOrderChecklist,
  assertWorkOrderCompletionChecklist,
} from './domain/checklist-gate';
export type { WorkOrderChecklistSubmissionRef } from './domain/checklist-gate';
export { resolveDispatchBookingUpsert, resolveDispatchWindowEnd } from './domain/dispatch-booking';
export type { DispatchBookingUpsert } from './domain/dispatch-booking';

export {
  createWorkOrderSchema,
  updateWorkOrderSchema,
  updateServiceStatusSchema,
  listWorkOrdersSchema,
  listDispatchSchema,
  rescheduleWorkOrderSchema,
  createWorkOrderBillingSchema,
} from './validation/schemas';
export type {
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
  UpdateServiceStatusInput,
  ListWorkOrdersInput,
  ListDispatchInput,
  RescheduleWorkOrderInput,
  CreateWorkOrderBillingInput,
} from './validation/schemas';

/** Recurrence (Agent 7) */
export {
  createRecurrenceDefinition,
  updateRecurrenceDefinition,
  pauseRecurrenceDefinition,
  resumeRecurrenceDefinition,
  endRecurrenceDefinition,
  skipRecurrenceOccurrence,
} from './recurrence/application/manage-recurrence';

export { generateRecurrenceOccurrences } from './recurrence/application/generate-occurrences';
export type { GenerateOccurrencesResult } from './recurrence/application/generate-occurrences';

export {
  listRecurrenceDefinitionsForOrg,
  getRecurrenceDefinitionDetail,
} from './recurrence/application/queries';
export type { RecurrenceDefinitionDetail } from './recurrence/application/queries';

export {
  advanceOccurrenceDate,
  enumerateOccurrenceDates,
  computeNextOccurrenceDate,
} from './recurrence/domain/occurrence-calendar';

export {
  RECURRENCE_FREQUENCIES,
  RECURRENCE_DEFINITION_STATUSES,
  RECURRENCE_OCCURRENCE_STATUSES,
  RECURRENCE_PRICING_MODES,
} from './recurrence/domain/types';
export type {
  RecurrenceFrequency,
  RecurrenceDefinitionStatus,
  RecurrenceOccurrenceStatus,
  RecurrencePricingMode,
  RecurrenceDefinitionRecord,
  RecurrenceOccurrenceRecord,
  RecurrenceDefinitionListItem,
  RecurrenceOccurrenceListItem,
} from './recurrence/domain/types';

export {
  createRecurrenceDefinitionSchema,
  updateRecurrenceDefinitionSchema,
  skipOccurrenceSchema,
  generateOccurrencesSchema,
  listRecurrenceDefinitionsSchema,
} from './recurrence/validation/schemas';
