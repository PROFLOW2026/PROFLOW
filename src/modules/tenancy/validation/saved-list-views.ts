import { z } from 'zod';
import {
  SAVED_LIST_KEYS,
  SAVED_LIST_VIEW_NAME_MAX,
  SAVED_LIST_VIEW_QUERY_KEY_MAX,
  SAVED_LIST_VIEW_QUERY_KEYS_MAX,
  SAVED_LIST_VIEW_QUERY_VALUE_MAX,
} from '../domain/saved-list-views';

const queryKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(SAVED_LIST_VIEW_QUERY_KEY_MAX)
  .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/);

export const savedListQuerySchema = z
  .record(queryKeySchema, z.string().trim().max(SAVED_LIST_VIEW_QUERY_VALUE_MAX))
  .refine((value) => Object.keys(value).length <= SAVED_LIST_VIEW_QUERY_KEYS_MAX, {
    message: 'Too many query keys',
  });

export const saveSavedListViewSchema = z.object({
  listKey: z.enum(SAVED_LIST_KEYS),
  name: z.string().trim().min(1).max(SAVED_LIST_VIEW_NAME_MAX),
  query: savedListQuerySchema.default({}),
  isDefault: z.boolean().optional().default(false),
});

export const deleteSavedListViewSchema = z.object({
  id: z.string().uuid(),
});

export type SaveSavedListViewInput = z.input<typeof saveSavedListViewSchema>;
