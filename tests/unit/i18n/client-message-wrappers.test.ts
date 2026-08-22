import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MESSAGE_NAMESPACES } from '@/shared/i18n/config';
import { flattenLocaleCatalog, readLocaleCatalog } from '../shared/i18n-messages.test';

/**
 * Client components that call useTranslations(ns) must receive `ns` through
 * APP_CLIENT_MESSAGE_NAMESPACES or a route `WithClientMessages` layout.
 * Missing wrappers surface as raw keys like `imports.steps.upload` in Hebrew UI.
 */
const CRITICAL_CLIENT_LAYOUTS: ReadonlyArray<{
  ns: string;
  layout: string;
}> = [
  { ns: 'imports', layout: 'src/app/[locale]/(app)/imports/layout.tsx' },
  { ns: 'fieldOps', layout: 'src/app/[locale]/(app)/field-ops/layout.tsx' },
  { ns: 'procurement', layout: 'src/app/[locale]/(app)/procurement/layout.tsx' },
  { ns: 'crm', layout: 'src/app/[locale]/(app)/crm/layout.tsx' },
  { ns: 'safety', layout: 'src/app/[locale]/(app)/safety/layout.tsx' },
  { ns: 'assets', layout: 'src/app/[locale]/(app)/assets/layout.tsx' },
  { ns: 'forms', layout: 'src/app/[locale]/(app)/forms/layout.tsx' },
  { ns: 'quotes', layout: 'src/app/[locale]/(app)/quotes/layout.tsx' },
  { ns: 'automations', layout: 'src/app/[locale]/(app)/automations/layout.tsx' },
  { ns: 'monthClose', layout: 'src/app/[locale]/(app)/month-close/layout.tsx' },
  { ns: 'scheduling', layout: 'src/app/[locale]/(app)/scheduling/layout.tsx' },
  { ns: 'compliance', layout: 'src/app/[locale]/(app)/compliance/layout.tsx' },
  { ns: 'recurringDrafts', layout: 'src/app/[locale]/(app)/recurring-drafts/layout.tsx' },
  { ns: 'settings', layout: 'src/app/[locale]/(app)/settings/layout.tsx' },
  { ns: 'communications', layout: 'src/app/[locale]/(app)/communications/layout.tsx' },
  { ns: 'calendar', layout: 'src/app/[locale]/(app)/calendar/layout.tsx' },
  { ns: 'assistant', layout: 'src/app/[locale]/(app)/assistant/layout.tsx' },
  { ns: 'reports', layout: 'src/app/[locale]/(app)/reports/layout.tsx' },
];

describe('client message wrappers for Hebrew closure', () => {
  it('keeps critical client namespaces wrapped by WithClientMessages layouts', () => {
    for (const entry of CRITICAL_CLIENT_LAYOUTS) {
      const path = join(process.cwd(), entry.layout);
      expect(existsSync(path), entry.layout).toBe(true);
      const text = readFileSync(path, 'utf8');
      expect(text).toMatch(/WithClientMessages/);
      expect(text).toContain(`'${entry.ns}'`);
    }
  });

  it('imports Hebrew catalog contains the wizard step keys (no raw-key surface)', () => {
    const he = flattenLocaleCatalog(readLocaleCatalog('he-IL', 'imports'));
    for (const key of [
      'steps.upload',
      'steps.mapping',
      'steps.preview',
      'steps.result',
      'kindLabel',
      'kinds.clients',
      'templateLabel',
      'templateHint',
      'actions.downloadTemplate',
      'fileLabel',
      'nonFinancialHint',
      'actions.preview',
    ]) {
      const value = he.get(key);
      expect(value, key).toBeTruthy();
      expect(value, key).not.toMatch(/^imports\./);
      expect(value, key).not.toMatch(/^[A-Za-z][A-Za-z0-9.]+$/);
    }
  });

  it('every MESSAGE_NAMESPACE has a Hebrew catalog file', () => {
    for (const ns of MESSAGE_NAMESPACES) {
      const path = join(process.cwd(), 'src', 'locales', 'he-IL', `${ns}.json`);
      expect(existsSync(path), ns).toBe(true);
    }
  });

  it('wraps project usage embeds with assets client messages', () => {
    const path = join(process.cwd(), 'src/modules/assets/ui/project-usage-panel.tsx');
    expect(existsSync(path)).toBe(true);
    const text = readFileSync(path, 'utf8');
    expect(text).toMatch(/WithClientMessages/);
    expect(text).toContain("'assets'");
    expect(text).toMatch(/MaterialUsageForm|EquipmentUsageForm/);
  });
});
