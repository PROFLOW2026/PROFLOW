import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApBillTaxSummary } from '@/modules/ap/ui/ap-bill-tax-summary';
import heAp from '@/locales/he-IL/ap.json';
import enAp from '@/locales/en/ap.json';
import { renderWithIntl } from './test-utils';

describe('AP bill NET / VAT / GROSS labels', () => {
  it('shows Hebrew legacy undivided copy without inventing VAT', () => {
    renderWithIntl(
      <ApBillTaxSummary
        netAmount="500.00"
        taxAmount="0"
        grossAmount="500.00"
        currency="ILS"
        taxBasis="legacy_undivided"
      />,
      { locale: 'he-IL', messages: { ap: heAp } },
    );

    expect(screen.getByTestId('ap-bill-tax-summary')).toBeInTheDocument();
    expect(screen.getByText(heAp.detail.net)).toBeInTheDocument();
    expect(screen.getByText(heAp.detail.tax)).toBeInTheDocument();
    expect(screen.getByText(heAp.detail.gross)).toBeInTheDocument();
    expect(screen.getByText('לא פוצל מע״מ היסטורית — עלות=סכום מלא')).toBeInTheDocument();
  });

  it('shows canonical split labels in English', () => {
    renderWithIntl(
      <ApBillTaxSummary
        netAmount="100.00"
        taxAmount="17.00"
        grossAmount="117.00"
        currency="ILS"
        taxBasis="canonical"
      />,
      { locale: 'en', messages: { ap: enAp } },
    );

    expect(screen.getByText(enAp.detail.net)).toBeInTheDocument();
    expect(screen.getByText(enAp.detail.taxBasisCanonical)).toBeInTheDocument();
  });
});
