import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getAssistantProvider } from '../domain/unconfigured-provider';
import { selectAssistantTools, collectAssistantAccessScope } from '../domain/tools';
import type {
  AssistantCitation,
  AssistantConversationRecord,
  AssistantMessageRecord,
} from '../domain/types';
import { executeAssistantTool } from './execute-tool';
import {
  insertAssistantConversation,
  insertAssistantMessage,
  listAssistantConversations,
  listAssistantMessages,
} from '../data/assistant.repository';
import { assistantAskSchema, type AssistantAskInput } from '../validation/schemas';

function parseOrThrow<T>(
  result:
    | { success: true; data: T }
    | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } },
): T {
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  return result.data;
}

export async function listMyAssistantConversations(
  context: OrgContext,
): Promise<AssistantConversationRecord[]> {
  assertPermission(context, PERMISSIONS.ASSISTANT_USE);
  try {
    return await listAssistantConversations(context.db, context.organizationId, context.userId);
  } catch {
    return [];
  }
}

export async function getAssistantThread(
  context: OrgContext,
  conversationId: string,
): Promise<{
  readonly conversationId: string;
  readonly messages: readonly AssistantMessageRecord[];
}> {
  assertPermission(context, PERMISSIONS.ASSISTANT_USE);
  try {
    const messages = await listAssistantMessages(
      context.db,
      context.organizationId,
      conversationId,
      context.userId,
    );
    return { conversationId, messages };
  } catch {
    return { conversationId, messages: [] };
  }
}

export async function askAssistant(
  context: OrgContext,
  raw: AssistantAskInput,
): Promise<{
  readonly conversationId: string;
  readonly content: string;
  readonly citations: readonly AssistantCitation[];
  readonly providerConfigured: boolean;
}> {
  assertPermission(context, PERMISSIONS.ASSISTANT_USE);
  const input = parseOrThrow(assistantAskSchema.safeParse(raw));
  const provider = getAssistantProvider();

  let conversationId = input.conversationId ?? null;
  if (!conversationId) {
    const created = await insertAssistantConversation(context.db, {
      organizationId: context.organizationId,
      userId: context.userId,
      title: input.question.slice(0, 80),
    });
    conversationId = created.id;
    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.ASSISTANT_CONVERSATION_CREATED,
      entityType: 'assistant_conversation',
      entityId: created.id,
      after: { title: created.title },
    });
  }

  await insertAssistantMessage(context.db, {
    organizationId: context.organizationId,
    conversationId,
    userId: context.userId,
    role: 'user',
    content: input.question,
    citations: [],
  });

  const tools = selectAssistantTools(input.question);
  const toolResults = [];
  for (const tool of tools.slice(0, 4)) {
    toolResults.push(
      await executeAssistantTool(context, tool, {
        projectId: input.projectId,
        question: input.question,
      }),
    );
  }

  const completion = await provider.complete({
    question: input.question,
    toolResults,
    locale: context.locale,
  });

  await insertAssistantMessage(context.db, {
    organizationId: context.organizationId,
    conversationId,
    userId: context.userId,
    role: 'assistant',
    content: completion.content,
    citations: completion.citations,
    accessScope: collectAssistantAccessScope(toolResults, input.projectId),
  });

  return {
    conversationId,
    content: completion.content,
    citations: completion.citations,
    providerConfigured: provider.isConfigured(),
  };
}
