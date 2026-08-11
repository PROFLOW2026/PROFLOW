import { and, eq } from 'drizzle-orm';
import { commandCenterItemStates } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type {
  CommandCenterItemState,
  CommandCenterItemStateRecord,
} from '../domain/types';

function mapRow(
  row: typeof commandCenterItemStates.$inferSelect,
): CommandCenterItemStateRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    itemKey: row.itemKey,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    state: row.state as CommandCenterItemState,
    snoozedUntil: row.snoozedUntil,
    note: row.note,
    updatedByUserId: row.updatedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listCommandCenterItemStates(
  db: DbExecutor,
  organizationId: string,
): Promise<CommandCenterItemStateRecord[]> {
  const rows = await db
    .select()
    .from(commandCenterItemStates)
    .where(eq(commandCenterItemStates.organizationId, organizationId));
  return rows.map(mapRow);
}

export async function upsertCommandCenterItemState(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly itemKey: string;
    readonly sourceType: string;
    readonly sourceId: string;
    readonly state: CommandCenterItemState;
    readonly snoozedUntil: Date | null;
    readonly note: string | null;
    readonly updatedByUserId: string;
  },
): Promise<CommandCenterItemStateRecord> {
  const [row] = await db
    .insert(commandCenterItemStates)
    .values({
      organizationId: input.organizationId,
      itemKey: input.itemKey,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      state: input.state,
      snoozedUntil: input.snoozedUntil,
      note: input.note,
      updatedByUserId: input.updatedByUserId,
    })
    .onConflictDoUpdate({
      target: [commandCenterItemStates.organizationId, commandCenterItemStates.itemKey],
      set: {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        state: input.state,
        snoozedUntil: input.snoozedUntil,
        note: input.note,
        updatedByUserId: input.updatedByUserId,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!row) {
    const [existing] = await db
      .select()
      .from(commandCenterItemStates)
      .where(
        and(
          eq(commandCenterItemStates.organizationId, input.organizationId),
          eq(commandCenterItemStates.itemKey, input.itemKey),
        ),
      )
      .limit(1);
    if (!existing) throw new Error('Failed to upsert command center item state');
    return mapRow(existing);
  }

  return mapRow(row);
}
