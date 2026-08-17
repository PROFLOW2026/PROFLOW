import { and, desc, eq, sql } from 'drizzle-orm';
import { assistantConversations, assistantMessages } from '@drizzle/schema';
import { getAdminDb } from '@/shared/db';
import { ORG_LIST_HARD_CAP, resolveListLimit } from '@/shared/db/list-limits';
import type { DbExecutor } from '@/shared/db/types';
import type {
  AssistantCitation,
  AssistantConversationRecord,
  AssistantMessageRecord,
  AssistantMessageRole,
} from '../domain/types';

function mapConversation(
  row: typeof assistantConversations.$inferSelect,
): AssistantConversationRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    title: row.title,
    status: row.status as 'active' | 'archived',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseCitations(value: unknown): AssistantCitation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      if (typeof record.label !== 'string') return null;
      return {
        label: record.label,
        href: typeof record.href === 'string' ? record.href : null,
        claimKind: record.claimKind === 'inference' ? 'inference' : 'fact',
      } satisfies AssistantCitation;
    })
    .filter((item): item is AssistantCitation => item !== null);
}

export async function listAssistantConversations(
  db: DbExecutor,
  organizationId: string,
  userId: string,
): Promise<AssistantConversationRecord[]> {
  const rows = await db
    .select()
    .from(assistantConversations)
    .where(
      and(
        eq(assistantConversations.organizationId, organizationId),
        eq(assistantConversations.userId, userId),
      ),
    )
    .orderBy(desc(assistantConversations.updatedAt))
    .limit(resolveListLimit(20, { hardCap: ORG_LIST_HARD_CAP }));
  return rows.map(mapConversation);
}

export async function insertAssistantConversation(
  db: DbExecutor,
  values: { organizationId: string; userId: string; title: string | null },
): Promise<AssistantConversationRecord> {
  const [row] = await db
    .insert(assistantConversations)
    .values({
      organizationId: values.organizationId,
      userId: values.userId,
      title: values.title,
      status: 'active',
    })
    .returning();
  if (!row) throw new Error('Failed to insert assistant conversation');
  return mapConversation(row);
}

export async function listAssistantMessages(
  db: DbExecutor,
  organizationId: string,
  conversationId: string,
  userId: string,
): Promise<AssistantMessageRecord[]> {
  const [conversation] = await db
    .select()
    .from(assistantConversations)
    .where(
      and(
        eq(assistantConversations.id, conversationId),
        eq(assistantConversations.organizationId, organizationId),
        eq(assistantConversations.userId, userId),
      ),
    )
    .limit(1);
  if (!conversation) return [];

  const rows = await db
    .select()
    .from(assistantMessages)
    .where(
      and(
        eq(assistantMessages.organizationId, organizationId),
        eq(assistantMessages.conversationId, conversationId),
      ),
    )
    .orderBy(assistantMessages.createdAt)
    .limit(resolveListLimit(200, { hardCap: ORG_LIST_HARD_CAP }));

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    conversationId: row.conversationId,
    role: row.role as AssistantMessageRole,
    content: row.content,
    citations: parseCitations(row.citationsJson),
    createdAt: row.createdAt,
  }));
}

export async function insertAssistantMessage(
  db: DbExecutor,
  values: {
    organizationId: string;
    conversationId: string;
    userId: string;
    role: AssistantMessageRole;
    content: string;
    citations: readonly AssistantCitation[];
    accessScope?: {
      readonly permissions?: readonly string[];
      readonly projectIds?: readonly string[];
      readonly documentIds?: readonly string[];
    };
  },
): Promise<AssistantMessageRecord> {
  const [owned] = await db
    .select({ id: assistantConversations.id })
    .from(assistantConversations)
    .where(
      and(
        eq(assistantConversations.id, values.conversationId),
        eq(assistantConversations.organizationId, values.organizationId),
        eq(assistantConversations.userId, values.userId),
      ),
    )
    .limit(1);
  if (!owned) throw new Error('Assistant conversation not found for this user');

  if (values.role !== 'user') {
    const scope = {
      permissions: values.accessScope?.permissions ?? [],
      projectIds: values.accessScope?.projectIds ?? [],
      documentIds: values.accessScope?.documentIds ?? [],
    };
    const inserted = await getAdminDb().execute(sql`
      SELECT app.insert_assistant_trusted_message(
        ${values.organizationId}::uuid,
        ${values.conversationId}::uuid,
        ${values.role},
        ${values.content},
        ${JSON.stringify(values.citations)}::jsonb,
        ${JSON.stringify(scope)}::jsonb
      ) AS id
    `);
    const insertedId = Array.isArray(inserted)
      ? (inserted[0] as { id?: string } | undefined)?.id
      : (inserted as { rows?: Array<{ id?: string }> }).rows?.[0]?.id;
    if (!insertedId) throw new Error('Failed to insert assistant message');
    return {
      id: insertedId,
      organizationId: values.organizationId,
      conversationId: values.conversationId,
      role: values.role,
      content: values.content,
      citations: values.citations,
      createdAt: new Date(),
    };
  }

  const [row] = await db
    .insert(assistantMessages)
    .values({
      organizationId: values.organizationId,
      conversationId: values.conversationId,
      role: 'user',
      content: values.content,
      citationsJson: values.citations,
      accessScopeJson: {},
    })
    .returning();
  if (!row) throw new Error('Failed to insert assistant message');
  return {
    id: row.id,
    organizationId: row.organizationId,
    conversationId: row.conversationId,
    role: row.role as AssistantMessageRole,
    content: row.content,
    citations: parseCitations(row.citationsJson),
    createdAt: row.createdAt,
  };
}
