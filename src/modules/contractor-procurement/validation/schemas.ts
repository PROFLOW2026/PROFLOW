import { z } from 'zod';

export const createTenderPackageSchema = z.object({
  projectId: z.string().uuid(),
  tradeKey: z.string().trim().min(1),
  title: z.string().trim().min(1),
  scopeDescription: z.string().trim().optional(),
  workPackageId: z.string().uuid().optional(),
});

export const inviteVendorSchema = z.object({
  projectId: z.string().uuid(),
  packageId: z.string().uuid(),
  vendorId: z.string().uuid(),
});

export const awardTenderSchema = z.object({
  projectId: z.string().uuid(),
  packageId: z.string().uuid(),
  offerId: z.string().uuid(),
  subcontractNumber: z.string().trim().optional(),
  title: z.string().trim().optional(),
});

export const submitBidSchema = z.object({
  organizationId: z.string().uuid(),
  projectId: z.string().uuid(),
  packageId: z.string().uuid(),
  notes: z.string().trim().optional(),
  bidAmount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  leadTimeDays: z.number().int().min(0).optional(),
});

export type CreateTenderPackageInput = z.infer<typeof createTenderPackageSchema>;
export type InviteVendorInput = z.infer<typeof inviteVendorSchema>;
export type AwardTenderInput = z.infer<typeof awardTenderSchema>;
export type SubmitBidInput = z.infer<typeof submitBidSchema>;
