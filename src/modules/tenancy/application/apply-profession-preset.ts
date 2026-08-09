import { organizationDomains, costCategories } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { getProfessionPreset, type ProfessionPresetKey } from '../domain/profession-presets';

/**
 * Applies a starter preset into editable catalog rows.
 * Never binds live to historical projects. Document checklist is stored as
 * organization domain-adjacent notes via cost/domain catalogs for V1.x —
 * checklist keys land as organization_domains-style catalog entries under
 * `document_type:*` keys for later document-type UX.
 */
export async function applyProfessionPreset(
  db: DbExecutor,
  organizationId: string,
  presetKey: ProfessionPresetKey,
  locale: 'he-IL' | 'en' = 'he-IL',
): Promise<{ applied: true; presetKey: ProfessionPresetKey } | { applied: false }> {
  const preset = getProfessionPreset(presetKey);
  if (!preset) return { applied: false };

  const nameOf = (en: string, he: string) => (locale === 'he-IL' ? he : en);

  let sort = 0;
  for (const domain of preset.domains) {
    await db
      .insert(organizationDomains)
      .values({
        organizationId,
        key: domain.key,
        name: nameOf(domain.nameEn, domain.nameHe),
        enabled: true,
        sortOrder: sort++,
      })
      .onConflictDoNothing();
  }

  for (const doc of preset.documentChecklist) {
    await db
      .insert(organizationDomains)
      .values({
        organizationId,
        key: `document_type:${doc.key}`,
        name: nameOf(doc.nameEn, doc.nameHe),
        enabled: true,
        sortOrder: 100 + sort++,
      })
      .onConflictDoNothing();
  }

  let categorySort = 200;
  for (const category of preset.extraExpenseCategories) {
    await db
      .insert(costCategories)
      .values({
        organizationId,
        key: category.key,
        name: nameOf(category.nameEn, category.nameHe),
        family: category.family,
        isSystem: false,
        sortOrder: categorySort++,
      })
      .onConflictDoNothing();
  }

  // Work-package starter names are returned via preset for project create UX;
  // they are not org-level rows (packages belong to projects).
  return { applied: true, presetKey };
}

export function suggestedWorkPackageNames(
  presetKey: ProfessionPresetKey | null | undefined,
  locale: 'he-IL' | 'en' = 'he-IL',
): string[] {
  const preset = getProfessionPreset(presetKey ?? null);
  if (!preset) return [];
  return preset.workPackageNames.map((item) =>
    locale === 'he-IL' ? item.nameHe : item.nameEn,
  );
}
