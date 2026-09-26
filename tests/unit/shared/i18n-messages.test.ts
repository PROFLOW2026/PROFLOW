import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUDIT_ACTION_VALUES } from '@/shared/audit';
import { LOCALES, MESSAGE_NAMESPACES, type Locale } from '@/shared/i18n/config';
import {
  flattenLocaleCatalog,
  localePlaceholders,
  missingLocaleKeys,
  readLocaleCatalog,
} from './i18n-catalog-helpers';

export { flattenLocaleCatalog, localePlaceholders, missingLocaleKeys, readLocaleCatalog };

/**
 * Guards the message catalogs while several workstreams edit them in parallel.
 *
 * English is canonical, Hebrew is the first complete UI, so any key present in
 * one must exist in the other with the same ICU placeholders. A mismatch here
 * shows up in production as an untranslated key or a broken interpolation.
 *
 * `loadMessages` must not deep-merge English under he/ar/ru. These tests require
 * every locale to ship the full key tree so missing translations surface explicitly.
 */

const LOCALES_DIR = join(process.cwd(), 'src', 'locales');

type Catalog = Record<string, unknown>;

/**
 * Allowed identical en / he-IL values: brand, LTR technical islands, format
 * examples, and ICU scaffolding that is intentionally language-neutral.
 */
const IDENTICAL_MESSAGE_ALLOWLIST = new Set([
  'common.appName',
  'crm.title',
  'documents.fileSize.bytes',
  'documents.fileSize.kilobytes',
  'documents.fileSize.megabytes',
  'onboarding.countries.IL_latin',
  'projects.workspace.clientLinked',
  'api.scopes.projects.read',
  'api.scopes.clients.read',
  'api.scopes.billing.read',
  'api.scopes.webhooks.manage',
  'api.events.test.ping',
  'api.events.project.created',
  'api.events.project.updated',
  'api.events.client.updated',
  'api.events.billing.invoice.issued',
  'api.events.api.key.revoked',
  'settings.activity.actions._fallback',
  'settings.activity.entities._fallback',
  'marketing.hero.brand',
  'invoicingIntegration.settings.sumitTitle',
  'marketing.footer.note',
  // Pure math / formula templates that are language-neutral.
  'dashboard.laborReconciliation.equation',
  // Shared screenshot asset paths (language-neutral).
  'marketing.tour.tabs.0.src',
  'marketing.tour.tabs.1.src',
  'marketing.tour.tabs.2.src',
  'marketing.tour.tabs.3.src',
  'marketing.tour.tabs.4.src',
  'marketing.tour.tabs.5.src',
  'marketing.tour.tabs.6.src',
  // Tour tab ids are code keys, not UI copy.
  'marketing.tour.tabs.0.id',
  'marketing.tour.tabs.1.id',
  'marketing.tour.tabs.2.id',
  'marketing.tour.tabs.3.id',
  'marketing.tour.tabs.4.id',
  'marketing.tour.tabs.5.id',
  'marketing.tour.tabs.6.id',
  // FAQ group ids are code keys, not UI copy.
  'marketing.faq.groups.0.id',
  'marketing.faq.groups.1.id',
  'marketing.faq.groups.2.id',
  'marketing.faq.groups.3.id',
  // Cloud provider product names (proper nouns).
  'externalStorage.providers.onedrive',
  'externalStorage.providers.google_drive',
  'externalStorage.providers.dropbox',
  'externalStorage.providers.box',
  // Brand / product names in employee app surfaces.
  'employeeApp.pwa.shortName',
  'employeeApp.admin.shareWhatsApp',
  'billing.collection.whatsapp',
  'commandCenter.itemCopy.storageProvider.onedrive',
  'commandCenter.itemCopy.storageProvider.google_drive',
  'commandCenter.itemCopy.storageProvider.dropbox',
  'commandCenter.itemCopy.storageProvider.box',
  // ICU placeholder templates — month/year and automation metadata are localized via values.
  'commandCenter.itemCopy.reportMonthLabel',
  'commandCenter.itemCopy.automationFollowup.why',
  'expenses.received.source.sumit',
  'invoicingIntegration.send.emailPlaceholder',
  'imports.fields.projectIdPlaceholder',
  'monthClose.form.yearMonthPlaceholder',
  'forms.settings.fields.fieldKeyPlaceholder',
  'boq.panel.versionLabel',
]);

function hasActivityAction(catalog: Catalog, action: string): boolean {
  const actions = catalog.actions;
  if (!actions || typeof actions !== 'object') return false;
  const [entity, verb] = action.split('.');
  if (!entity || !verb) return false;
  const group = (actions as Catalog)[entity];
  if (!group || typeof group !== 'object') return false;
  return typeof (group as Catalog)[verb] === 'string';
}

describe('message catalogs', () => {
  it('ships every MESSAGE_NAMESPACE file for all supported locales', () => {
    for (const namespace of MESSAGE_NAMESPACES) {
      for (const locale of LOCALES) {
        const path = join(LOCALES_DIR, locale, `${namespace}.json`);
        expect({ namespace, locale, exists: existsSync(path) }).toEqual({
          namespace,
          locale,
          exists: true,
        });
        expect(flattenLocaleCatalog(readLocaleCatalog(locale, namespace)).size).toBeGreaterThan(0);
      }
    }
  });

  it.each([...MESSAGE_NAMESPACES])('%s has identical keys in every locale', (namespace) => {
    const english = flattenLocaleCatalog(readLocaleCatalog('en', namespace));

    for (const locale of LOCALES) {
      if (locale === 'en') continue;
      const translated = flattenLocaleCatalog(readLocaleCatalog(locale, namespace));

      const missing = missingLocaleKeys(english, translated);
      const extra = [...translated.keys()].filter((key) => !english.has(key));

      expect({ namespace, locale, missing }).toEqual({ namespace, locale, missing: [] });
      expect({ namespace, locale, extra }).toEqual({ namespace, locale, extra: [] });
    }
  });

  it.each([...MESSAGE_NAMESPACES])('%s uses the same ICU arguments in every locale', (namespace) => {
    const english = flattenLocaleCatalog(readLocaleCatalog('en', namespace));

    for (const locale of LOCALES) {
      if (locale === 'en') continue;
      const translated = flattenLocaleCatalog(readLocaleCatalog(locale, namespace));

      for (const [key, message] of english) {
        const other = translated.get(key);
        if (other === undefined) continue;
        expect({ key, args: [...localePlaceholders(other)].sort() }).toEqual({
          key,
          args: [...localePlaceholders(message)].sort(),
        });
      }
    }
  });

  it.each([...MESSAGE_NAMESPACES])('%s has no blank message in any locale', (namespace) => {
    for (const locale of LOCALES) {
      const blank = [...flattenLocaleCatalog(readLocaleCatalog(locale, namespace))]
        .filter(([, message]) => message.trim() === '')
        .map(([key]) => key);
      expect({ locale, blank }).toEqual({ locale, blank: [] });
    }
  });

  it.each(['he-IL', 'ar', 'ru'] as const)(
    '%s includes every English key (completeness)',
    (locale) => {
      const gaps: Array<{ namespace: string; missing: string[] }> = [];
      for (const namespace of MESSAGE_NAMESPACES) {
        const missing = missingLocaleKeys(
          flattenLocaleCatalog(readLocaleCatalog('en', namespace)),
          flattenLocaleCatalog(readLocaleCatalog(locale, namespace)),
        );
        if (missing.length > 0) gaps.push({ namespace, missing });
      }
      expect(gaps).toEqual([]);
    },
  );

  it.each(['he-IL', 'ar', 'ru'] as const)(
    '%s does not silently reuse English copy (except allowlisted LTR islands)',
    (locale) => {
      const residue: Array<{ namespace: string; key: string; value: string }> = [];
      for (const namespace of MESSAGE_NAMESPACES) {
        const english = flattenLocaleCatalog(readLocaleCatalog('en', namespace));
        const translated = flattenLocaleCatalog(readLocaleCatalog(locale, namespace));
        for (const [key, enValue] of english) {
          const other = translated.get(key);
          if (other === undefined || other !== enValue) continue;
          if (!/[A-Za-z]{3,}/.test(enValue)) continue;
          if (/^\{[^}]+\}$/.test(enValue.trim())) continue;
          const dotted = `${namespace}.${key}`;
          if (IDENTICAL_MESSAGE_ALLOWLIST.has(dotted)) continue;
          residue.push({ namespace, key, value: enValue });
        }
      }
      expect(residue).toEqual([]);
    },
  );

  it('settings.activity.actions covers every AUDIT_ACTION value', () => {
    const activity = readLocaleCatalog('en', 'settings').activity as Catalog | undefined;
    const missing = AUDIT_ACTION_VALUES.filter((action) => !hasActivityAction(activity ?? {}, action));
    expect(missing).toEqual([]);
  });

  it('never shows the internal term "WorkPackage" in the Hebrew UI', () => {
    for (const namespace of MESSAGE_NAMESPACES) {
      for (const [key, message] of flattenLocaleCatalog(readLocaleCatalog('he-IL', namespace))) {
        expect({ namespace, key, containsWorkPackage: /workpackage/i.test(message) }).toEqual({
          namespace,
          key,
          containsWorkPackage: false,
        });
      }
    }
  });

  /** Nested task.* keys must survive JSON parsing (no duplicate root "task" string). */
  it('tasks namespace keeps nested task object keys in every locale', () => {
    const required = ['task.dependencies', 'task.subtasks', 'taskEntityLabel'];
    for (const locale of LOCALES) {
      const flat = flattenLocaleCatalog(readLocaleCatalog(locale, 'tasks'));
      const missing = required.filter((key) => !flat.has(key));
      expect({ locale, missing }).toEqual({ locale, missing: [] });
    }
  });

  /** Recently expanded user-facing surfaces must exist in all four locales. */
  it('critical collaboration namespaces ship required keys in every locale', () => {
    const requiredByNamespace: Record<string, readonly string[]> = {
      documents: ['attachments.pickFromCloud'],
      notifications: [
        'types.task_assigned_to_you',
        'copy.task_assigned_to_you.titleDefault',
        'copy.task_assigned_to_you.body',
      ],
      employeeApp: ['tasks.create.assignees', 'tasks.assignHint', 'tasks.approveHint'],
      settings: ['people.folderGrants.title'],
      externalStorage: ['cloudPicker.title', 'cloudPicker.description'],
      tasks: ['comments.attachments.pickFromCloud', 'comments.attachments.takePhoto'],
    };

    for (const [namespace, keys] of Object.entries(requiredByNamespace)) {
      for (const locale of LOCALES) {
        const flat = flattenLocaleCatalog(readLocaleCatalog(locale as Locale, namespace));
        const missing = keys.filter((key) => !flat.has(key));
        expect({ namespace, locale, missing }).toEqual({ namespace, locale, missing: [] });
      }
    }
  });
});
