import { z } from 'zod';
import { SITE_DAILY_LOG_ENTRY_TYPES } from '../domain/daily-log';
import {
  isoDate,
  optionalNonNegativeDecimal,
  optionalNonNegativeInt,
  optionalText,
  optionalUuid,
} from '../shared/validation';

export const dailyLogKeySchema = z.object({
  projectId: z.string().uuid(),
  logDate: isoDate,
});

export const updateDailyLogHeaderSchema = dailyLogKeySchema.extend({
  weather: optionalText(500),
  notes: optionalText(8000),
});
export type UpdateDailyLogHeaderInput = z.input<typeof updateDailyLogHeaderSchema>;

const entryFields = {
  entryType: z.enum(SITE_DAILY_LOG_ENTRY_TYPES),
  vendorId: optionalUuid,
  subcontractAgreementId: optionalUuid,
  locationId: optionalUuid,
  description: optionalText(4000),
  headcount: optionalNonNegativeInt,
  hours: optionalNonNegativeDecimal,
  quantity: optionalNonNegativeDecimal,
  unit: optionalText(40),
};

export const addDailyLogEntrySchema = dailyLogKeySchema.extend(entryFields);
export type AddDailyLogEntryInput = z.input<typeof addDailyLogEntrySchema>;

export const updateDailyLogEntrySchema = z.object({
  projectId: z.string().uuid(),
  entryId: z.string().uuid(),
  ...entryFields,
});
export type UpdateDailyLogEntryInput = z.input<typeof updateDailyLogEntrySchema>;

export const removeDailyLogEntrySchema = z.object({
  projectId: z.string().uuid(),
  entryId: z.string().uuid(),
});

const reportFields = {
  reportDate: isoDate,
  locationId: optionalUuid,
  manpowerCount: optionalNonNegativeInt,
  workPerformed: optionalText(8000),
  equipment: optionalText(4000),
  deliveries: optionalText(4000),
  delays: optionalText(4000),
  blockingIssues: optionalText(4000),
  safetyNotes: optionalText(4000),
  notes: optionalText(8000),
};

/** Internal user records a contractor's report on its behalf (e.g. paper / phone report). */
export const recordContractorReportSchema = z.object({
  projectId: z.string().uuid(),
  vendorId: z.string().uuid(),
  subcontractAgreementId: optionalUuid,
  ...reportFields,
});
export type RecordContractorReportInput = z.input<typeof recordContractorReportSchema>;

/** Contractor submits its own report from the portal. */
export const submitContractorReportSchema = z.object({
  projectId: z.string().uuid(),
  vendorId: optionalUuid,
  subcontractAgreementId: optionalUuid,
  ...reportFields,
});
export type SubmitContractorReportInput = z.input<typeof submitContractorReportSchema>;
