'use server';

import { revalidatePath } from 'next/cache';
import { askAssistant } from '@/modules/assistant';
import { withOrgContext } from '@/shared/auth/session';

export interface AssistantFormState {
  error?: string;
  content?: string;
  conversationId?: string;
}

export async function askAssistantAction(
  _prev: AssistantFormState,
  formData: FormData,
): Promise<AssistantFormState> {
  const question = String(formData.get('question') ?? '').trim();
  const conversationId = String(formData.get('conversationId') ?? '').trim() || undefined;
  if (!question) return { error: 'empty' };
  try {
    const result = await withOrgContext((context) =>
      askAssistant(context, { question, conversationId }),
    );
    revalidatePath('/assistant');
    return { content: result.content, conversationId: result.conversationId };
  } catch {
    return { error: 'failed' };
  }
}
