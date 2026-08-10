import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { ContractAmountFields } from '@/modules/projects/ui/contract-amount-fields';
import { localeDirection } from '@/shared/i18n/config';
import commonEn from '@/locales/en/common.json';
import commonHe from '@/locales/he-IL/common.json';
import enProjects from '@/locales/en/projects.json';
import heProjects from '@/locales/he-IL/projects.json';

describe('ContractAmountFields locked UI', () => {
  it('renders locked Hebrew alert, disables controls, and omits mutable form fields', () => {
    expect(localeDirection('he-IL')).toBe('rtl');

    render(
      <div dir="rtl" lang="he">
        <NextIntlClientProvider
          locale="he-IL"
          messages={{ common: commonHe, projects: heProjects }}
          timeZone="Asia/Jerusalem"
        >
          <ContractAmountFields
            baseCurrency="ILS"
            currencySymbol="₪"
            initialAmount="100000"
            initialIncludesTax={false}
            locked
          />
        </NextIntlClientProvider>
      </div>,
    );

    expect(screen.getByText(heProjects.details.originalAmountLockedTitle)).toBeVisible();
    expect(screen.getByText(heProjects.details.originalAmountLocked)).toBeVisible();
    for (const box of screen.getAllByRole('textbox')) {
      expect(box).toBeDisabled();
    }
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(document.querySelector('input[name="contractValueAmount"]')).toBeNull();
    expect(document.querySelector('input[name="amountIncludesTax"]')).toBeNull();
  });

  it('keeps English LTR unlocked fields editable and submittable', () => {
    expect(localeDirection('en')).toBe('ltr');

    render(
      <div dir="ltr" lang="en">
        <NextIntlClientProvider
          locale="en"
          messages={{ common: commonEn, projects: enProjects }}
          timeZone="Asia/Jerusalem"
        >
          <ContractAmountFields
            baseCurrency="ILS"
            currencySymbol="₪"
            initialAmount="100000"
            initialIncludesTax={false}
            locked={false}
          />
        </NextIntlClientProvider>
      </div>,
    );

    expect(screen.queryByText(enProjects.details.originalAmountLockedTitle)).toBeNull();
    for (const box of screen.getAllByRole('textbox')) {
      expect(box).not.toBeDisabled();
    }
    expect(screen.getByRole('combobox')).not.toBeDisabled();
    expect(document.querySelector('input[name="contractValueAmount"]')).not.toBeNull();
    expect(enProjects.details.originalAmountLocked).toContain('Change Orders');
  });
});
