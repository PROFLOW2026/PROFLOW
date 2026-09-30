'use client';

import { QuoteEditorForm } from '@/modules/quotes/ui/quote-editor-form';
import type { QuoteTextBlockDraft } from '@/modules/quotes/ui/quote-text-blocks-editor';

export function QuoteCreateForm({
  defaultCurrency,
  clients,
  opportunityId,
  defaultTitle,
  defaultClientId,
  defaultTextBlocks,
}: {
  defaultCurrency: string;
  clients: readonly { id: string; name: string }[];
  opportunityId?: string | null;
  defaultTitle?: string;
  defaultClientId?: string | null;
  defaultTextBlocks?: readonly QuoteTextBlockDraft[];
}) {
  return (
    <QuoteEditorForm
      mode="create"
      defaultCurrency={defaultCurrency}
      clients={clients}
      opportunityId={opportunityId}
      defaultTitle={defaultTitle}
      defaultClientId={defaultClientId}
      defaultTextBlocks={defaultTextBlocks}
    />
  );
}
