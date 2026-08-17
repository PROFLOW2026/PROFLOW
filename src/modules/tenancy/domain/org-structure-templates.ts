/**
 * Org-owned structure templates (doc 36).
 * Stored as copies in organization_settings - never live-linked to projects.
 */

import { z } from 'zod';

export const ORG_STRUCTURE_TEMPLATES_SETTING_KEY = 'structure_templates';

export const orgNamedItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const orgWorkPackageTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phases: z.array(z.string().trim().min(1).max(120)).max(40).default([]),
});

export const orgMilestoneTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  offsetDaysFromStart: z.number().int().min(0).max(3650).nullable().default(null),
});

export const orgFormChecklistSchema = z.object({
  name: z.string().trim().min(1).max(120),
  items: z.array(z.string().trim().min(1).max(120)).max(40).default([]),
});

export const orgStructureTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().default(null),
  workPackages: z.array(orgWorkPackageTemplateSchema).min(1).max(40),
  milestones: z.array(orgMilestoneTemplateSchema).max(40).default([]),
  documentFolders: z.array(z.string().trim().min(1).max(120)).max(40).default([]),
  formChecklists: z.array(orgFormChecklistSchema).max(20).default([]),
  budgetCategories: z.array(z.string().trim().min(1).max(120)).max(40).default([]),
  closeoutRequirementKeys: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
  boqSkeleton: z.array(z.string().trim().min(1).max(120)).max(40).default([]),
  defaultRoleKeys: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  updatedAt: z.string().datetime().optional(),
});

export const orgPhasePackSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  phases: z.array(z.string().trim().min(1).max(120)).min(1).max(40),
  updatedAt: z.string().datetime().optional(),
});

export const orgWorkPackagePackSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  workPackageNames: z.array(z.string().trim().min(1).max(120)).min(1).max(40),
  updatedAt: z.string().datetime().optional(),
});

export const orgStructureTemplatesBagSchema = z.object({
  projectTemplates: z.array(orgStructureTemplateSchema).max(50).default([]),
  phasePacks: z.array(orgPhasePackSchema).max(50).default([]),
  workPackagePacks: z.array(orgWorkPackagePackSchema).max(50).default([]),
});

export type OrgStructureTemplate = z.infer<typeof orgStructureTemplateSchema>;
export type OrgPhasePack = z.infer<typeof orgPhasePackSchema>;
export type OrgWorkPackagePack = z.infer<typeof orgWorkPackagePackSchema>;
export type OrgStructureTemplatesBag = z.infer<typeof orgStructureTemplatesBagSchema>;

export function emptyOrgStructureTemplatesBag(): OrgStructureTemplatesBag {
  return { projectTemplates: [], phasePacks: [], workPackagePacks: [] };
}

export function parseOrgStructureTemplatesBag(raw: unknown): OrgStructureTemplatesBag {
  const parsed = orgStructureTemplatesBagSchema.safeParse(raw ?? {});
  if (!parsed.success) return emptyOrgStructureTemplatesBag();
  return parsed.data;
}

export interface OrgStructureTemplatePreview {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly workPackageNames: readonly string[];
  readonly phaseCount: number;
  readonly milestoneNames: readonly string[];
  readonly folderNames: readonly string[];
  readonly closeoutRequirementKeys: readonly string[];
}

export function previewOrgStructureTemplate(
  template: OrgStructureTemplate,
): OrgStructureTemplatePreview {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    workPackageNames: template.workPackages.map((pkg) => pkg.name),
    phaseCount: template.workPackages.reduce((sum, pkg) => sum + pkg.phases.length, 0),
    milestoneNames: template.milestones.map((m) => m.name),
    folderNames: template.documentFolders,
    closeoutRequirementKeys: template.closeoutRequirementKeys,
  };
}

/** Deep clone for apply - no shared refs with the stored bag. */
export function cloneOrgStructureTemplateForApply(template: OrgStructureTemplate): {
  readonly workPackages: readonly { readonly name: string; readonly phases: readonly string[] }[];
  readonly milestones: readonly {
    readonly name: string;
    readonly offsetDaysFromStart: number | null;
  }[];
  readonly documentFolders: readonly string[];
  readonly formChecklists: readonly { readonly name: string; readonly items: readonly string[] }[];
  readonly budgetCategories: readonly string[];
  readonly closeoutRequirementKeys: readonly string[];
  readonly boqSkeleton: readonly string[];
  readonly defaultRoleKeys: readonly string[];
} {
  return {
    workPackages: template.workPackages.map((pkg) => ({
      name: pkg.name,
      phases: [...pkg.phases],
    })),
    milestones: template.milestones.map((m) => ({
      name: m.name,
      offsetDaysFromStart: m.offsetDaysFromStart,
    })),
    documentFolders: [...template.documentFolders],
    formChecklists: template.formChecklists.map((checklist) => ({
      name: checklist.name,
      items: [...checklist.items],
    })),
    budgetCategories: [...template.budgetCategories],
    closeoutRequirementKeys: [...template.closeoutRequirementKeys],
    boqSkeleton: [...template.boqSkeleton],
    defaultRoleKeys: [...template.defaultRoleKeys],
  };
}
