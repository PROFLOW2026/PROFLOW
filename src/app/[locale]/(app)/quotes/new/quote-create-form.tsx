'use client';

import { QuoteEditorForm } from '@/modules/quotes/ui/quote-editor-form';

export function QuoteCreateForm({
  defaultCurrency,
  clients,
  opportunityId,
  defaultTitle,
  defaultClientId,
}: {
  defaultCurrency: string;
  clients: readonly { id: string; name: string }[];
  opportunityId?: string | null;
  defaultTitle?: string;
  defaultClientId?: string | null;
}) {
  return (
    <QuoteEditorForm
      mode="create"
      defaultCurrency={defaultCurrency}
      clients={clients}
      opportunityId={opportunityId}
      defaultTitle={defaultTitle}
      defaultClientId={defaultClientId}
    />
  );
}
