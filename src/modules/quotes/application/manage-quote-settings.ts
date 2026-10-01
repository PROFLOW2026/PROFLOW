import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { QUOTE_TEXT_BLOCK_BODY_MAX, type QuoteDefaultTextBlockRecord } from '../domain/text-blocks';
import {
  deleteQuoteDefaultTextBlock,
  insertQuoteDefaultTextBlock,
  listQuoteDefaultTextBlocks,
  updateQuoteDefaultTextBlock,
} from '../data/text-blocks.repository';
import { z } from 'zod';

const upsertBlockSchema = z.object({
  blockId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  body: z.string().max(QUOTE_TEXT_BLOCK_BODY_MAX),
  enabled: z.boolean(),
  sortOrder: z.number().int().min(0),
});

export async function listQuoteSettingsBlocks(
  context: OrgContext,
): Promise<readonly QuoteDefaultTextBlockRecord[]> {
  assertPermission(context, PERMISSIONS.QUOTES_READ);
  return listQuoteDefaultTextBlocks(context.db, context.organizationId);
}

export async function upsertQuoteSettingsBlock(
  context: OrgContext,
  raw: z.input<typeof upsertBlockSchema>,
): Promise<QuoteDefaultTextBlockRecord> {
  assertPermission(context, PERMISSIONS.QUOTES_MANAGE);
  const parsed = upsertBlockSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  const input = parsed.data;
  if (input.blockId) {
    const updated = await updateQuoteDefaultTextBlock(
      context.db,
      context.organizationId,
      input.blockId,
      {
        title: input.title,
        body: input.body,
        enabled: input.enabled,
        sortOrder: input.sortOrder,
      },
    );
    if (!updated) throw new ValidationError([{ path: 'blockId', message: 'Not found' }]);
    return updated;
  }
  return insertQuoteDefaultTextBlock(context.db, {
    organizationId: context.organizationId,
    title: input.title,
    body: input.body,
    enabled: input.enabled,
    sortOrder: input.sortOrder,
  });
}

export async function deleteQuoteSettingsBlock(
  context: OrgContext,
  blockId: string,
): Promise<void> {
  assertPermission(context, PERMISSIONS.QUOTES_MANAGE);
  const ok = await deleteQuoteDefaultTextBlock(context.db, context.organizationId, blockId);
  if (!ok) throw new ValidationError([{ path: 'blockId', message: 'Not found' }]);
}

export async function reorderQuoteSettingsBlock(
  context: OrgContext,
  blockId: string,
  direction: 'up' | 'down',
): Promise<void> {
  assertPermission(context, PERMISSIONS.QUOTES_MANAGE);
  const blocks = [...(await listQuoteDefaultTextBlocks(context.db, context.organizationId))];
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index < 0) {
    throw new ValidationError([{ path: 'blockId', message: 'Not found' }]);
  }
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= blocks.length) return;

  const current = blocks[index]!;
  const neighbor = blocks[targetIndex]!;
  await updateQuoteDefaultTextBlock(context.db, context.organizationId, current.id, {
    sortOrder: neighbor.sortOrder,
  });
  await updateQuoteDefaultTextBlock(context.db, context.organizationId, neighbor.id, {
    sortOrder: current.sortOrder,
  });
}

export async function setQuoteSettingsBlockEnabled(
  context: OrgContext,
  blockId: string,
  enabled: boolean,
): Promise<void> {
  assertPermission(context, PERMISSIONS.QUOTES_MANAGE);
  const updated = await updateQuoteDefaultTextBlock(context.db, context.organizationId, blockId, {
    enabled,
  });
  if (!updated) {
    throw new ValidationError([{ path: 'blockId', message: 'Not found' }]);
  }
}
