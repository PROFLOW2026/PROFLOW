import type {
  AssistantCompletionInput,
  AssistantCompletionOutput,
  AssistantProviderStatus,
} from './types';

export interface AssistantProvider {
  readonly id: string;
  isConfigured(): boolean;
  getStatus(): AssistantProviderStatus;
  complete(input: AssistantCompletionInput): Promise<AssistantCompletionOutput>;
}
