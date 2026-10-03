import { z } from 'zod';
import { SAFETY_SEVERITIES } from '../domain/types';
import { CONTRACTOR_SAFETY_RECORD_TYPES } from './domain';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nullableUuid = z.string().uuid().optional().nullable().transform((value) => value ?? null);
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null));

const reportBase = {
  projectId: z.string().uuid(),
  agreementId: nullableUuid,
  locationId: nullableUuid,
  recordType: z.enum(CONTRACTOR_SAFETY_RECORD_TYPES),
  severity: z.enum(SAFETY_SEVERITIES).default('low'),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000),
  immediateAction: nullableText(2000),
  occurredAt: z.coerce.date(),
};

export const reportContractorSafetySchema = z.object({
  ...reportBase,
  vendorId: z.string().uuid(),
  dueDate: isoDate.optional().nullable().transform((value) => value ?? null),
  contractorVisible: z.boolean().default(true),
});
export type ReportContractorSafetyInput = z.input<typeof reportContractorSafetySchema>;

export const externalSafetyReportSchema = z.object({
  ...reportBase,
  organizationId: z.string().uuid(),
  vendorId: nullableUuid,
});
export type ExternalSafetyReportInput = z.input<typeof externalSafetyReportSchema>;

export const addContractorCorrectiveActionSchema = z.object({
  projectId: z.string().uuid(),
  safetyRecordId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: nullableText(2000),
  dueDate: isoDate.optional().nullable().transform((value) => value ?? null),
  ownerUserId: nullableUuid,
  /** Create a follow-up task in the tasks system (createLinkedTask). */
  createTask: z.boolean().default(true),
  /** Assign the task to the contractor company (portal) instead of an internal user. */
  assignToContractor: z.boolean().default(true),
});
export type AddContractorCorrectiveActionInput = z.input<typeof addContractorCorrectiveActionSchema>;

export const closeContractorSafetySchema = z.object({
  projectId: z.string().uuid(),
  safetyRecordId: z.string().uuid(),
  verificationNote: z.string().trim().max(2000).optional().nullable(),
});
export type CloseContractorSafetyInput = z.input<typeof closeContractorSafetySchema>;
