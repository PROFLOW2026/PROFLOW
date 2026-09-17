import {
  translateMessageKey,
  type MessageTranslator,
} from '@/shared/errors';

export interface ClientMessageTranslators {
  readonly tErrors: MessageTranslator;
  readonly tValidation?: MessageTranslator;
  readonly namespaces?: Readonly<Record<string, MessageTranslator>>;
}

/** Resolve a dotted API messageKey on the client without surfacing English fallback text. */
export function translateClientMessageKey(
  messageKey: string | null | undefined,
  translators: ClientMessageTranslators,
  fallback: string,
): string {
  if (!messageKey) return fallback;
  return translateMessageKey(messageKey, translators) ?? fallback;
}

/** Parse `{ error: messageKey }` JSON from a failed fetch and localize it. */
export async function readApiErrorMessage(
  response: Response,
  translators: ClientMessageTranslators,
  fallback: string,
): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return translateClientMessageKey(body.error, translators, fallback);
  } catch {
    return fallback;
  }
}
