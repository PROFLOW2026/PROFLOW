import { z } from 'zod';
import { CUSTOM_FIELD_ENTITY_TYPES, CUSTOM_FIELD_TYPES } from '../domain/types';

const emptyToNull = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return null;
  return value;
};

export const createDefinitionSchema = z.object({
  entityType: z.enum(CUSTOM_FIELD_ENTITY_TYPES),
  key: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/, 'Key must be snake_case starting with a letter'),
  label: z.string().trim().min(1).max(120),
  fieldType: z.enum(CUSTOM_FIELD_TYPES),
  config: z.record(z.string(), z.unknown()).optional().default({}),
  required: z.boolean().optional().default(false),
  sortOrder: z.number().int().min(0).max(9999).optional().default(0),
});

export type CreateDefinitionInput = z.input<typeof createDefinitionSchema>;

export const archiveDefinitionSchema = z.object({
  definitionId: z.string().uuid(),
});

export type ArchiveDefinitionInput = z.input<typeof archiveDefinitionSchema>;

export const upsertValueSchema = z.object({
  definitionId: z.string().uuid(),
  entityId: z.string().uuid(),
  valueText: z.preprocess(emptyToNull, z.string().trim().max(4000).nullable().optional()),
  valueNumber: z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .regex(/^-?\d+(\.\d+)?$/, 'Invalid number')
      .nullable()
      .optional(),
  ),
  valueBool: z.boolean().nullable().optional(),
  valueDate: z.preprocess(
    emptyToNull,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
  ),
  valueJson: z.unknown().optional(),
});

export type UpsertValueInput = z.input<typeof upsertValueSchema>;
