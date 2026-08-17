import { randomUUID } from 'node:crypto';
import { FORM_TEMPLATE_SCHEMA_VERSION } from '@/modules/forms/domain/types';
import { insertTemplate, listTemplates } from '@/modules/forms';
import { insertDocumentFolder, listDocumentFolders } from '@/modules/documents';
import {
  cloneProjectTemplateForApply,
  getProjectTemplate,
  type ProjectTemplateKey,
  PROJECT_TEMPLATE_KEYS,
} from '@/modules/projects/domain/templates';
import type { DbExecutor } from '@/shared/db/types';
import {
  getOrganizationSettingValue,
  upsertOrganizationSettingValue,
} from '../data/organization-settings.repository';
import type { BusinessProfileKey } from '../domain/business-profiles';
import {
  TODAY_EMPHASIS_SETTING_KEY,
  getBusinessProfileSetup,
} from '../domain/business-profile-setup';
import {
  ORG_STRUCTURE_TEMPLATES_SETTING_KEY,
  orgStructureTemplateSchema,
  parseOrgStructureTemplatesBag,
} from '../domain/org-structure-templates';

/**
 * Seeds editable setup copies from a business profile (folders, form templates,
 * org project templates, today emphasis). Never enables portal. Never deletes.
 */
export async function seedBusinessProfileSetup(
  db: DbExecutor,
  organizationId: string,
  profileKey: BusinessProfileKey,
  locale: 'he-IL' | 'en',
): Promise<void> {
  const setup = getBusinessProfileSetup(profileKey);
  const nameOf = (en: string, he: string) => (locale === 'he-IL' ? he : en);

  await upsertOrganizationSettingValue(
    db,
    organizationId,
    TODAY_EMPHASIS_SETTING_KEY,
    setup.todayEmphasis,
  );

  const existingFolders = await listDocumentFolders(db, organizationId, {});
  const folderNames = new Set(existingFolders.map((folder) => folder.name));
  for (const folder of setup.documentFolders) {
    const name = nameOf(folder.nameEn, folder.nameHe);
    if (folderNames.has(name)) continue;
    await insertDocumentFolder(db, { organizationId, name });
    folderNames.add(name);
  }

  const existingForms = await listTemplates(db, organizationId, { includeArchived: true });
  const formNames = new Set(existingForms.map((template) => template.name));
  for (const suggestion of setup.formTemplates) {
    const name = nameOf(suggestion.nameEn, suggestion.nameHe);
    if (formNames.has(name)) continue;
    await insertTemplate(db, {
      organizationId,
      name,
      description: null,
      category: suggestion.category,
      enabled: true,
      schema: {
        version: FORM_TEMPLATE_SCHEMA_VERSION,
        fields: [
          {
            key: 'checklist',
            type: 'checklist',
            label: name,
            required: false,
            items: suggestion.items.map((item, index) => ({
              key: `item_${index + 1}`,
              label: nameOf(item.nameEn, item.nameHe),
            })),
          },
        ],
      },
    });
    formNames.add(name);
  }

  const allowedKeys = new Set<string>(PROJECT_TEMPLATE_KEYS);
  const templateKeys = setup.projectTemplateKeys.filter(
    (key): key is ProjectTemplateKey => allowedKeys.has(key),
  );
  if (templateKeys.length === 0) return;

  const raw = await getOrganizationSettingValue<unknown>(
    db,
    organizationId,
    ORG_STRUCTURE_TEMPLATES_SETTING_KEY,
  );
  const bag = parseOrgStructureTemplatesBag(raw);
  const existingTemplateNames = new Set(bag.projectTemplates.map((template) => template.name));

  for (const key of templateKeys) {
    const catalog = getProjectTemplate(key);
    const copy = cloneProjectTemplateForApply(key, locale);
    if (!catalog || !copy) continue;
    const name = locale === 'he-IL' ? catalog.nameHe : catalog.nameEn;
    if (existingTemplateNames.has(name)) continue;

    const candidate = {
      id: randomUUID(),
      name,
      description: locale === 'he-IL' ? catalog.descriptionHe : catalog.descriptionEn,
      workPackages: copy.workPackages.map((pkg) => ({
        name: pkg.name,
        phases: [...pkg.phases],
      })),
      milestones: copy.milestones.map((milestone) => ({
        name: milestone.name,
        offsetDaysFromStart: milestone.offsetDaysFromStart,
      })),
      documentFolders: [...copy.documentFolders],
      formChecklists: copy.formChecklists.map((checklist) => ({
        name: checklist.name,
        items: [...checklist.items],
      })),
      budgetCategories: [...copy.budgetCategories],
      closeoutRequirementKeys: [...copy.closeoutRequirementKeys],
      boqSkeleton: [...copy.boqSkeleton],
      defaultRoleKeys: [...copy.defaultRoleKeys],
      updatedAt: new Date().toISOString(),
    };
    const validated = orgStructureTemplateSchema.safeParse(candidate);
    if (!validated.success) continue;
    bag.projectTemplates.push(validated.data);
    existingTemplateNames.add(name);
  }

  await upsertOrganizationSettingValue(
    db,
    organizationId,
    ORG_STRUCTURE_TEMPLATES_SETTING_KEY,
    bag,
  );
}
