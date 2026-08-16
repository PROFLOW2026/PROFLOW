import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import {
  getOrganizationSettingValue,
  upsertOrganizationSettingValue,
} from '../data/organization-settings.repository';
import {
  ORG_STRUCTURE_TEMPLATES_SETTING_KEY,
  cloneOrgStructureTemplateForApply,
  emptyOrgStructureTemplatesBag,
  orgPhasePackSchema,
  orgStructureTemplateSchema,
  orgStructureTemplatesBagSchema,
  orgWorkPackagePackSchema,
  parseOrgStructureTemplatesBag,
  previewOrgStructureTemplate,
  type OrgPhasePack,
  type OrgStructureTemplate,
  type OrgStructureTemplatePreview,
  type OrgStructureTemplatesBag,
  type OrgWorkPackagePack,
} from '../domain/org-structure-templates';

async function loadBag(context: OrgContext): Promise<OrgStructureTemplatesBag> {
  const raw = await getOrganizationSettingValue<unknown>(
    context.db,
    context.organizationId,
    ORG_STRUCTURE_TEMPLATES_SETTING_KEY,
  );
  return parseOrgStructureTemplatesBag(raw);
}

async function saveBag(context: OrgContext, bag: OrgStructureTemplatesBag): Promise<void> {
  const parsed = orgStructureTemplatesBagSchema.safeParse(bag);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  await upsertOrganizationSettingValue(
    context.db,
    context.organizationId,
    ORG_STRUCTURE_TEMPLATES_SETTING_KEY,
    parsed.data,
  );
}

export async function getOrgStructureTemplatesBag(
  context: OrgContext,
): Promise<OrgStructureTemplatesBag> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  return loadBag(context);
}

/** Read for project apply UI - projects update permission. */
export async function listOrgProjectTemplatesForApply(
  context: OrgContext,
): Promise<readonly OrgStructureTemplatePreview[]> {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);
  const bag = await loadBag(context);
  return bag.projectTemplates.map(previewOrgStructureTemplate);
}

export async function getOrgProjectTemplateById(
  context: OrgContext,
  templateId: string,
): Promise<OrgStructureTemplate | null> {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);
  const bag = await loadBag(context);
  return bag.projectTemplates.find((t) => t.id === templateId) ?? null;
}

export async function listOrgPhasePacks(context: OrgContext): Promise<readonly OrgPhasePack[]> {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);
  const bag = await loadBag(context);
  return bag.phasePacks;
}

export async function listOrgWorkPackagePacks(
  context: OrgContext,
): Promise<readonly OrgWorkPackagePack[]> {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);
  const bag = await loadBag(context);
  return bag.workPackagePacks;
}

const upsertProjectTemplateInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  workPackagesText: z.string().trim().min(1).max(4000),
  milestonesText: z.string().trim().max(4000).optional(),
});

/** Parses "Name | Phase1, Phase2" lines into work-package drafts. */
export function parseWorkPackageLines(text: string): { name: string; phases: string[] }[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [namePart, phasesPart] = line.split('|').map((p) => p.trim());
      const name = namePart || line;
      const phases = phasesPart
        ? phasesPart
            .split(/[,،]/)
            .map((p) => p.trim())
            .filter(Boolean)
        : [];
      return { name, phases };
    });
}

export function parseMilestoneLines(
  text: string | undefined,
): { name: string; offsetDaysFromStart: number | null }[] {
  if (!text?.trim()) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.*?)\s*@\s*(\d+)\s*$/);
      if (match) {
        return {
          name: match[1]!.trim(),
          offsetDaysFromStart: Number(match[2]),
        };
      }
      return { name: line, offsetDaysFromStart: null };
    });
}

export async function upsertOrgProjectTemplate(
  context: OrgContext,
  rawInput: unknown,
): Promise<OrgStructureTemplate> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  const parsed = upsertProjectTemplateInput.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const workPackages = parseWorkPackageLines(parsed.data.workPackagesText);
  if (workPackages.length === 0) {
    throw new ValidationError([{ path: 'workPackagesText', message: 'At least one work area' }]);
  }

  const templateCandidate = {
    id: parsed.data.id ?? randomUUID(),
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    workPackages,
    milestones: parseMilestoneLines(parsed.data.milestonesText),
    updatedAt: new Date().toISOString(),
  };

  const validated = orgStructureTemplateSchema.safeParse(templateCandidate);
  if (!validated.success) {
    throw new ValidationError(
      validated.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  const bag = await loadBag(context);
  const idx = bag.projectTemplates.findIndex((t) => t.id === validated.data.id);
  const nextTemplates =
    idx >= 0
      ? bag.projectTemplates.map((t, i) => (i === idx ? validated.data : t))
      : [...bag.projectTemplates, validated.data];

  await saveBag(context, { ...bag, projectTemplates: nextTemplates });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'org_structure_template',
    entityId: validated.data.id,
    after: previewOrgStructureTemplate(validated.data),
  });

  return validated.data;
}

export async function deleteOrgProjectTemplate(
  context: OrgContext,
  templateId: string,
): Promise<void> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  const bag = await loadBag(context);
  if (!bag.projectTemplates.some((t) => t.id === templateId)) {
    throw new NotFoundError('Template');
  }
  await saveBag(context, {
    ...bag,
    projectTemplates: bag.projectTemplates.filter((t) => t.id !== templateId),
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'org_structure_template',
    entityId: templateId,
    after: { deleted: true },
  });
}

const upsertPhasePackInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  phasesText: z.string().trim().min(1).max(2000),
});

export async function upsertOrgPhasePack(
  context: OrgContext,
  rawInput: unknown,
): Promise<OrgPhasePack> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  const parsed = upsertPhasePackInput.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const phases = parsed.data.phasesText
    .split(/\r?\n|,|،/)
    .map((p) => p.trim())
    .filter(Boolean);

  const candidate = {
    id: parsed.data.id ?? randomUUID(),
    name: parsed.data.name,
    phases,
    updatedAt: new Date().toISOString(),
  };
  const validated = orgPhasePackSchema.safeParse(candidate);
  if (!validated.success) {
    throw new ValidationError(
      validated.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  const bag = await loadBag(context);
  const idx = bag.phasePacks.findIndex((p) => p.id === validated.data.id);
  const next =
    idx >= 0
      ? bag.phasePacks.map((p, i) => (i === idx ? validated.data : p))
      : [...bag.phasePacks, validated.data];
  await saveBag(context, { ...bag, phasePacks: next });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'org_phase_pack',
    entityId: validated.data.id,
    after: { name: validated.data.name, phaseCount: validated.data.phases.length },
  });

  return validated.data;
}

export async function deleteOrgPhasePack(context: OrgContext, packId: string): Promise<void> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  const bag = await loadBag(context);
  if (!bag.phasePacks.some((p) => p.id === packId)) throw new NotFoundError('Phase pack');
  await saveBag(context, {
    ...bag,
    phasePacks: bag.phasePacks.filter((p) => p.id !== packId),
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'org_phase_pack',
    entityId: packId,
    after: { deleted: true },
  });
}

const upsertWpPackInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  workPackagesText: z.string().trim().min(1).max(2000),
});

export async function upsertOrgWorkPackagePack(
  context: OrgContext,
  rawInput: unknown,
): Promise<OrgWorkPackagePack> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  const parsed = upsertWpPackInput.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const workPackageNames = parsed.data.workPackagesText
    .split(/\r?\n|,|،/)
    .map((p) => p.trim())
    .filter(Boolean);

  const candidate = {
    id: parsed.data.id ?? randomUUID(),
    name: parsed.data.name,
    workPackageNames,
    updatedAt: new Date().toISOString(),
  };
  const validated = orgWorkPackagePackSchema.safeParse(candidate);
  if (!validated.success) {
    throw new ValidationError(
      validated.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  const bag = await loadBag(context);
  const idx = bag.workPackagePacks.findIndex((p) => p.id === validated.data.id);
  const next =
    idx >= 0
      ? bag.workPackagePacks.map((p, i) => (i === idx ? validated.data : p))
      : [...bag.workPackagePacks, validated.data];
  await saveBag(context, { ...bag, workPackagePacks: next });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'org_work_package_pack',
    entityId: validated.data.id,
    after: {
      name: validated.data.name,
      workPackageCount: validated.data.workPackageNames.length,
    },
  });

  return validated.data;
}

export async function deleteOrgWorkPackagePack(context: OrgContext, packId: string): Promise<void> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  const bag = await loadBag(context);
  if (!bag.workPackagePacks.some((p) => p.id === packId)) {
    throw new NotFoundError('Work package pack');
  }
  await saveBag(context, {
    ...bag,
    workPackagePacks: bag.workPackagePacks.filter((p) => p.id !== packId),
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'org_work_package_pack',
    entityId: packId,
    after: { deleted: true },
  });
}

export function resolveOrgTemplateApplyCopy(template: OrgStructureTemplate) {
  return cloneOrgStructureTemplateForApply(template);
}

export { emptyOrgStructureTemplatesBag, previewOrgStructureTemplate };
