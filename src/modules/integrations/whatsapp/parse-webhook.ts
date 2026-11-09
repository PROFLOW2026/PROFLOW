export interface ParsedWhatsAppInboundMessage {
  readonly externalMessageId: string;
  readonly fromPhone: string;
  readonly businessPhone: string | null;
}

export function parseWhatsAppInboundPayload(
  payload: unknown,
): ParsedWhatsAppInboundMessage | null {
  if (!payload || typeof payload !== 'object') return null;
  const entry = (payload as { entry?: unknown }).entry;
  if (!Array.isArray(entry) || entry.length === 0) return null;

  for (const item of entry) {
    if (!item || typeof item !== 'object') continue;
    const changes = (item as { changes?: unknown }).changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      if (!change || typeof change !== 'object') continue;
      const value = (change as { value?: unknown }).value;
      if (!value || typeof value !== 'object') continue;

      const messages = (value as { messages?: unknown }).messages;
      const metadata = (value as { metadata?: { display_phone_number?: string } }).metadata;
      const businessPhone = metadata?.display_phone_number ?? null;

      if (!Array.isArray(messages)) continue;
      for (const message of messages) {
        if (!message || typeof message !== 'object') continue;
        const id = (message as { id?: unknown }).id;
        const from = (message as { from?: unknown }).from;
        if (typeof id !== 'string' || typeof from !== 'string') continue;
        return {
          externalMessageId: id,
          fromPhone: from,
          businessPhone,
        };
      }
    }
  }

  return null;
}
