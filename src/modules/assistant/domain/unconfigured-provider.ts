import type { AssistantProvider } from './provider';
import type {
  AssistantCitation,
  AssistantCompletionInput,
  AssistantCompletionOutput,
  AssistantProviderStatus,
} from './types';

function formatToolBody(input: AssistantCompletionInput): {
  content: string;
  citations: AssistantCitation[];
} {
  if (input.toolResults.length === 0) {
    return {
      content:
        input.locale.startsWith('he')
          ? 'אין מודל חי מחובר. לא נמצאו כלים להרצה על השאלה הזו.'
          : 'No live model is connected. No local tools ran for this question.',
      citations: [],
    };
  }

  const lines: string[] = [];
  const citations: AssistantCitation[] = [];
  const denied = input.toolResults.filter((item) => item.permissionDenied);
  const usable = input.toolResults.filter((item) => !item.permissionDenied);

  if (input.locale.startsWith('he')) {
    lines.push('אין עוזר חי מחובר. התשובה מבוססת על רשומות שמותר לכם לראות.');
  } else {
    lines.push('A live assistant is not connected. Answers use ProjectFlow records you can already see.');
  }

  for (const result of usable) {
    const kindLabel =
      result.claimKind === 'fact'
        ? input.locale.startsWith('he')
          ? 'עובדה'
          : 'Fact'
        : input.locale.startsWith('he')
          ? 'הסקה'
          : 'Inference';
    lines.push(`${kindLabel}: ${result.title}`);
    lines.push(result.body);
    if (result.draftOnly) {
      lines.push(
        input.locale.startsWith('he') ? 'הוכנה טיוטה. לא נרשם דבר.' : 'This prepared a draft. Nothing was posted.',
      );
    }
    citations.push(...result.citations);
  }

  for (const result of denied) {
    lines.push(
      input.locale.startsWith('he')
        ? `אין הרשאה: ${result.title}`
        : `No permission: ${result.title}`,
    );
  }

  return { content: lines.join('\n\n'), citations };
}

export class UnconfiguredAssistantProvider implements AssistantProvider {
  readonly id = 'unconfigured';

  isConfigured(): boolean {
    return false;
  }

  getStatus(): AssistantProviderStatus {
    return {
      configured: false,
      connected: false,
      messageKey: 'assistant.unconfigured',
    };
  }

  async complete(input: AssistantCompletionInput): Promise<AssistantCompletionOutput> {
    return formatToolBody(input);
  }
}

let defaultProvider: AssistantProvider | null = null;

export function getAssistantProvider(): AssistantProvider {
  if (!defaultProvider) defaultProvider = new UnconfiguredAssistantProvider();
  return defaultProvider;
}

export function setAssistantProviderForTests(provider: AssistantProvider | null): void {
  defaultProvider = provider;
}
