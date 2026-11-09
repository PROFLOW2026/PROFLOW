export const WORK_PERMIT_STATUSES = [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'closed',
] as const;

export type WorkPermitStatus = (typeof WORK_PERMIT_STATUSES)[number];

export interface WorkPermitRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly title: string;
  readonly permitType: string;
  readonly status: WorkPermitStatus;
  readonly requestedByUserId: string | null;
  readonly decidedByUserId: string | null;
  readonly validFrom: string | null;
  readonly validUntil: string | null;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
