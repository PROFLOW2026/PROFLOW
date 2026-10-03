import { z } from 'zod';

export const ensureCloseoutSchema = z.object({
  projectId: z.string().uuid(),
  agreementId: z.string().uuid(),
});

export const closeAgreementSchema = z.object({
  projectId: z.string().uuid(),
  agreementId: z.string().uuid(),
  overrideReason: z.string().trim().optional(),
});

export const submitHandoverItemSchema = z.object({
  organizationId: z.string().uuid(),
  projectId: z.string().uuid(),
  agreementId: z.string().uuid(),
  vendorId: z.string().uuid(),
  itemId: z.string().uuid(),
  notes: z.string().trim().optional(),
});

export const warrantyReportSchema = z.object({
  projectId: z.string().uuid(),
  agreementId: z.string().uuid(),
  title: z.string().trim().min(1),
  notes: z.string().trim().optional(),
  warrantyCoverageId: z.string().uuid().optional(),
  defectId: z.string().uuid().optional(),
  retentionFlag: z.boolean().optional(),
  guaranteeFlag: z.boolean().optional(),
});

export type EnsureCloseoutInput = z.infer<typeof ensureCloseoutSchema>;
export type CloseAgreementInput = z.infer<typeof closeAgreementSchema>;
export type SubmitHandoverItemInput = z.infer<typeof submitHandoverItemSchema>;
export type WarrantyReportInput = z.infer<typeof warrantyReportSchema>;
