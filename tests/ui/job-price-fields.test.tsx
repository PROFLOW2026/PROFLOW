import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { ContractAmountFields } from '@/modules/projects/ui/contract-amount-fields';
import commonHe from '@/locales/he-IL/common.json';
import heJobs from '@/locales/he-IL/jobs.json';
import heProjects from '@/locales/he-IL/projects.json';

describe('Job price fields (not contract chrome)', () => {
  it('uses job price labels and hides managed-opening preview when reduction is off', () => {
    render(
      <div dir="rtl" lang="he">
        <NextIntlClientProvider
          locale="he-IL"
          messages={{ common: commonHe, projects: heProjects, jobs: heJobs }}
          timeZone="Asia/Jerusalem"
        >
          <ContractAmountFields
            baseCurrency="ILS"
            currencySymbol="₪"
            initialAmount="2500"
            optional={false}
            showOpeningReduction={false}
            amountLabel={heJobs.pricing.priceLabel}
            amountDescription={heJobs.pricing.priceHint}
            amountPlaceholder={heJobs.pricing.pricePlaceholder}
            taxModeDescription={heJobs.pricing.taxModeHint}
          />
        </NextIntlClientProvider>
      </div>,
    );

    expect(screen.getByText(heJobs.pricing.priceLabel)).toBeVisible();
    expect(screen.getByText(heJobs.pricing.priceHint)).toBeVisible();
    expect(screen.queryByText(heProjects.create.contractValueLabel)).toBeNull();
    expect(screen.queryByText(heProjects.create.managedOpeningPreviewLabel)).toBeNull();
    expect(screen.queryByText(/סכום חוזה מקורי/)).toBeNull();
    expect(screen.queryByText(/פתיחה מנוהלת/)).toBeNull();
  });
});
