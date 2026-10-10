import { describe, expect, it } from 'vitest';
import { LOCALES, MESSAGE_NAMESPACES, type MessageNamespace } from '@/shared/i18n/config';
import { flattenLocaleCatalog, readLocaleCatalog } from '../shared/i18n-catalog-helpers';

/**
 * Developer/GC catalogs registered together in `MESSAGE_NAMESPACES`,
 * from `projectTeam` through `projectWorkspace`.
 */
function developerGcNamespaces(): MessageNamespace[] {
  const start = MESSAGE_NAMESPACES.indexOf('projectTeam');
  if (start < 0) throw new Error('projectTeam is not registered in MESSAGE_NAMESPACES');
  return MESSAGE_NAMESPACES.slice(start);
}

const REQUIRED_DG_NAMESPACES = [
  'projectTeam',
  'contractorAccess',
  'connectedProjects',
  'contractorPortal',
  'projectProfile',
  'subcontracts',
  'subcontractClaims',
  'collaboration',
  'coordination',
  'projectPlans',
  'rfi',
  'submittals',
  'inspections',
  'defects',
  'siteOps',
  'contractorCompliance',
  'deliveries',
  'awards',
  'handover',
  'projectWorkspace',
] as const satisfies readonly MessageNamespace[];

describe('Developer/GC locale key parity', () => {
  const namespaces = developerGcNamespaces();

  it('covers the Developer/GC namespaces registered in config', () => {
    expect(namespaces).toEqual([...REQUIRED_DG_NAMESPACES]);
  });

  it('keeps every he-IL key in en, ar, and ru', () => {
    const gaps: string[] = [];

    for (const namespace of namespaces) {
      const hebrew = flattenLocaleCatalog(readLocaleCatalog('he-IL', namespace));
      expect(hebrew.size, `${namespace} he-IL`).toBeGreaterThan(0);

      for (const locale of LOCALES) {
        if (locale === 'he-IL') continue;
        const translated = flattenLocaleCatalog(readLocaleCatalog(locale, namespace));
        for (const key of hebrew.keys()) {
          if (!translated.has(key)) {
            gaps.push(`${locale}/${namespace}.${key}`);
            continue;
          }
          if (!String(translated.get(key) ?? '').trim()) {
            gaps.push(`${locale}/${namespace}.${key} (empty)`);
          }
        }
      }
    }

    expect(gaps).toEqual([]);
  });
});
