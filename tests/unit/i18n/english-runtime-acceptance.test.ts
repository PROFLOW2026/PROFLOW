import { describe, expect, it } from 'vitest';
import { localizeClientTypeName } from '@/modules/business-catalog/domain/client-type-labels';
import { localizePaymentTermName } from '@/modules/business-catalog/domain/payment-term-labels';
import { flattenLocaleCatalog, readLocaleCatalog } from '../shared/i18n-catalog-helpers';

describe('English runtime acceptance', () => {
  it('settings workflow panels have English catalog entries', () => {
    const settings = flattenLocaleCatalog(readLocaleCatalog('en', 'settings'));
    for (const key of [
      'stagesPanel.intro',
      'labelsPanel.intro',
      'taskTemplatesPanel.intro',
      'orgProfilePanel.profileTypeTitle',
      'adoptionPanel.step1Title',
    ] as const) {
      expect(settings.get(key), key).toBeTruthy();
      expect(settings.get(key), key).toMatch(/[A-Za-z]/);
    }
  });

  it('localizes client types to English labels for en locale', () => {
    expect(localizeClientTypeName('private', 'Private', 'en')).toBe('Private');
    expect(localizeClientTypeName('company', 'Company', 'en')).toBe('Company');
  });

  it('localizes payment terms in English', () => {
    expect(localizePaymentTermName('immediate', 'Immediate', 'en')).toBe('Immediate');
    expect(localizePaymentTermName('eom_30', 'EOM + 30', 'en')).toMatch(/30/);
  });
});
