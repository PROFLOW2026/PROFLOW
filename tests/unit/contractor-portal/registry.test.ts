import { describe, expect, it } from 'vitest';
import { PORTAL_SECTION_PROVIDERS } from '@/modules/contractor-portal/application/registry';
import { PORTAL_SECTIONS, requirementCapabilities } from '@/modules/contractor-portal';
import { FINANCIAL_EXTERNAL_CAPABILITIES, isExternalCapability } from '@/shared/external';

describe('contractor portal provider registry', () => {
  it('registers providers with unique ids for known sections and catalog capabilities', () => {
    const ids = PORTAL_SECTION_PROVIDERS.map((provider) => provider.id);
    expect(new Set(ids).size).toBe(ids.length);
    const sections = new Set(PORTAL_SECTIONS.map((section) => section.id));
    for (const provider of PORTAL_SECTION_PROVIDERS) {
      expect(sections.has(provider.section), provider.id).toBe(true);
      for (const capability of requirementCapabilities(provider.capability)) {
        expect(isExternalCapability(capability), `${provider.id}: ${capability}`).toBe(true);
      }
    }
  });

  it('gates financial sections only behind financial capabilities and never the reverse', () => {
    const financialSections = new Set(PORTAL_SECTIONS.filter((section) => section.financial).map((section) => section.id));
    for (const provider of PORTAL_SECTION_PROVIDERS) {
      const caps = requirementCapabilities(provider.capability);
      const allFinancial = caps.every((cap) => FINANCIAL_EXTERNAL_CAPABILITIES.includes(cap));
      if (financialSections.has(provider.section)) expect(allFinancial, provider.id).toBe(true);
    }
  });
});
