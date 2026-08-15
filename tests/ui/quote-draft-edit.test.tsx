import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuoteEditorForm } from '@/modules/quotes/ui/quote-editor-form';
import enQuotes from '@/locales/en/quotes.json';
import { renderWithIntl } from './test-utils';

vi.mock('@/app/[locale]/(app)/quotes/actions', () => ({
  createQuoteAction: async () => ({}),
  updateQuoteAction: async () => ({}),
}));

describe('Quote draft edit form', () => {
  it('posts updateQuoteAction fields for a draft estimate', () => {
    renderWithIntl(
      <QuoteEditorForm
        mode="edit"
        quoteId="01900000-0000-7000-8000-000000000003"
        defaultCurrency="ILS"
        defaultTitle="Kitchen bid"
        defaultClientId={null}
        defaultLines={[
          {
            description: 'Cabinets',
            quantity: '1',
            unit: 'job',
            unitPriceAmount: '12000',
            estimatedUnitCostAmount: '8000',
          },
        ]}
        clients={[]}
      />,
      { locale: 'en', messages: { quotes: enQuotes } },
    );

    const form = screen.getByTestId('quote-edit-form');
    expect(form.querySelector('input[name="quoteId"]')).toHaveValue(
      '01900000-0000-7000-8000-000000000003',
    );
    expect(screen.getByDisplayValue('Kitchen bid')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Cabinets')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: enQuotes.create.saveDraft })).toBeInTheDocument();
  });
});
