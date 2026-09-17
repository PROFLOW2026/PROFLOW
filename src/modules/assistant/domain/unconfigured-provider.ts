import { assistantCopyTranslator } from '@/shared/i18n/sync-namespace-translator';
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
  const t = assistantCopyTranslator(input.locale);

  if (input.toolResults.length === 0) {
    return {
      content: t('unconfiguredReply.noTools'),
      citations: [],
    };
  }

  const lines: string[] = [];
  const citations: AssistantCitation[] = [];
  const denied = input.toolResults.filter((item) => item.permissionDenied);
  const usable = input.toolResults.filter((item) => !item.permissionDenied);

  lines.push(t('unconfigured'));

  for (const result of usable) {
    const kindLabel =
      result.claimKind === 'fact' ? t('facts') : t('inference');
    lines.push(`${kindLabel}: ${result.title}`);
    lines.push(result.body);
    if (result.draftOnly) {
      lines.push(t('actions.draftOnly'));
    }
    citations.push(...result.citations);
  }

  for (const result of denied) {
    lines.push(t('unconfiguredReply.permissionDenied', { title: result.title }));
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
