import { z } from 'zod';
import {
  ARTIFACT_KINDS,
  ARTIFACT_STATUSES,
  MANUAL_ARTIFACT_STATUSES,
  SUBJECT_TYPES,
} from '../domain/types';

const emptyToNull = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return null;
  return value;
};

const optionalText = z.preprocess(emptyToNull, z.string().trim().max(2000).nullable().optional());

const optionalDate = z.preprocess(
  emptyToNull,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .nullable()
    .optional(),
);

const optionalUuid = z.preprocess(emptyToNull, z.string().uuid().nullable().optional());

/** `auto` means derive from expires_on; pending/revoked are manual. */
export const STATUS_MODE_VALUES = ['auto', ...MANUAL_ARTIFACT_STATUSES] as const;

export const createComplianceArtifactSchema = z.object({
  artifactKind: z.enum(ARTIFACT_KINDS),
  name: z.string().trim().min(1, 'Name is required').max(200),
  referenceNumber: optionalText,
  issuer: optionalText,
  issuedOn: optionalDate,
  expiresOn: optionalDate,
  statusMode: z.enum(STATUS_MODE_VALUES).optional().default('auto'),
  subjectType: z.enum(SUBJECT_TYPES),
  subjectId: optionalUuid,
  notes: optionalText,
});

export type CreateComplianceArtifactInput = z.input<typeof createComplianceArtifactSchema>;

export const updateComplianceArtifactSchema = z.object({
  artifactId: z.string().uuid(),
  artifactKind: z.enum(ARTIFACT_KINDS).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  referenceNumber: optionalText,
  issuer: optionalText,
  issuedOn: optionalDate,
  expiresOn: optionalDate,
  statusMode: z.enum(STATUS_MODE_VALUES).optional(),
  subjectType: z.enum(SUBJECT_TYPES).optional(),
  subjectId: optionalUuid,
  notes: optionalText,
});

export type UpdateComplianceArtifactInput = z.input<typeof updateComplianceArtifactSchema>;

export const archiveComplianceArtifactSchema = z.object({
  artifactId: z.string().uuid(),
});

export const listComplianceArtifactsSchema = z.object({
  search: z.string().trim().optional(),
  kind: z.enum([...ARTIFACT_KINDS, 'all'] as const).optional(),
  status: z.enum([...ARTIFACT_STATUSES, 'all'] as const).optional(),
  subjectType: z.enum([...SUBJECT_TYPES, 'all'] as const).optional(),
  includeArchived: z.boolean().optional(),
});
