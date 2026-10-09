import { FORM_TEMPLATE_SCHEMA_VERSION } from '@/modules/forms/domain/types';
import { insertTemplate, listTemplates } from '@/modules/forms';
import { createProjectBoq, listBoqsForProject, upsertBoqNode } from '@/modules/boq';
import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { upsertOrganizationSettingValue } from '@/modules/tenancy';
import { setProjectProgressSource, type ProjectProgressSource } from './project-progress-mode';

export function projectCloseoutRequirementsSettingKey(projectId: string): string {
  return `project_closeout_requirements:${projectId}`;
}

export async function persistProjectCloseoutRequirementKeys(
  context: OrgContext,
  projectId: string,
  keys: readonly string[],
): Promise<void> {
  if (keys.length === 0) return;
  await upsertOrganizationSettingValue(
    context.db,
    context.organizationId,
    projectCloseoutRequirementsSettingKey(projectId),
    [...keys],
  );
}

export async function applyTemplateBoqSkeleton(
  context: OrgContext,
  projectId: string,
  sectionNames: readonly string[],
): Promise<{ readonly boqId: string | null; readonly sectionCount: number }> {
  if (sectionNames.length === 0 || !hasPermission(context, PERMISSIONS.BOQ_MANAGE)) {
    return { boqId: null, sectionCount: 0 };
  }

  const existing = await listBoqsForProject(context.db, context.organizationId, projectId);
  if (existing.length > 0) {
    return { boqId: existing[0]?.id ?? null, sectionCount: 0 };
  }

  const boq = await createProjectBoq(context, {
    projectId,
    title: 'Template BOQ',
    progressMode: 'simple',
  });
  if (!boq) return { boqId: null, sectionCount: 0 };

  let sectionCount = 0;
  for (const [index, name] of sectionNames.entries()) {
    await upsertBoqNode(context, {
      boqId: boq.id,
      nodeKind: 'chapter',
      description: name,
      sortOrder: index,
    });
    sectionCount += 1;
  }

  return { boqId: boq.id, sectionCount };
}

export async function applyTemplateFormChecklists(
  context: OrgContext,
  checklists: readonly { readonly name: string; readonly items: readonly string[] }[],
): Promise<number> {
  if (checklists.length === 0 || !hasPermission(context, PERMISSIONS.FORMS_MANAGE)) {
    return 0;
  }

  const existing = await listTemplates(context.db, context.organizationId, { includeArchived: true });
  const formNames = new Set(existing.map((template) => template.name));
  let created = 0;

  for (const checklist of checklists) {
    if (formNames.has(checklist.name)) continue;
    await insertTemplate(context.db, {
      organizationId: context.organizationId,
      name: checklist.name,
      description: null,
      category: 'closeout',
      enabled: true,
      schema: {
        version: FORM_TEMPLATE_SCHEMA_VERSION,
        fields: [
          {
            key: 'checklist',
            type: 'checklist',
            label: checklist.name,
            required: false,
            items: checklist.items.map((label, index) => ({
              key: `item_${index + 1}`,
              label,
            })),
          },
        ],
      },
    });
    formNames.add(checklist.name);
    created += 1;
  }

  return created;
}

export async function applyTemplateDefaultProgressSource(
  context: OrgContext,
  projectId: string,
  source: ProjectProgressSource,
): Promise<void> {
  if (!hasPermission(context, PERMISSIONS.PROJECTS_UPDATE)) return;
  await setProjectProgressSource(context, projectId, source);
}
