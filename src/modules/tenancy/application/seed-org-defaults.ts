/**
 * Org-profile seeding for Universal Work Management adoption flow.
 *
 * Seeds stage definitions, module visibility, and terminology defaults
 * based on org_profile_type. ALL writes are IDEMPOTENT (insert-if-missing only —
 * never overwrites existing config).
 */

import type { DbExecutor } from '@/shared/db/types';
import { projectStageDefinitions } from '@drizzle/schema';
import { eq } from 'drizzle-orm';
import {
  setModulePreference,
  listModulePreferences,
} from '../data/organizations.repository';
import {
  upsertOrganizationSettingValue,
  getOrganizationSettingValue,
} from '../data/organization-settings.repository';
import type { OptionalModuleKey } from '../domain/types';
import {
  ORG_PROFILE_TYPE_SETTING_KEY,
  type OrgProfileType,
} from '../../../app/[locale]/(app)/settings/org-profile/org-profile-domain';

// ─── Stage defaults per profile ───────────────────────────────────────────────

const STAGE_DEFAULTS: Record<OrgProfileType, string[]> = {
  architect: ['Concept', 'Preliminary', 'Permit', 'Detailed', 'Tender', 'Construction', 'Handover'],
  engineer: ['Intake', 'Planning', 'Coordination', 'Submission', 'Review', 'Approved'],
  consultant: ['Intake', 'Planning', 'Coordination', 'Submission', 'Review', 'Approved'],
  project_manager: ['Initiation', 'Planning', 'Execution', 'Monitoring', 'Closure'],
  developer: ['Feasibility', 'Design', 'Licensing', 'Tender', 'Construction', 'Sales', 'Handover'],
  contractor: ['Tender', 'Awarded', 'Mobilization', 'Execution', 'Testing', 'Handover', 'Warranty'],
  subcontractor: ['Quoted', 'Awarded', 'Procurement', 'Execution', 'Inspection', 'Complete'],
  supervisor: ['Kickoff', 'Monitoring', 'Review', 'Closeout'],
  other: ['Planning', 'Active', 'Complete'],
};

// ─── Module defaults per profile ──────────────────────────────────────────────

/**
 * Returns the modules that should be DISABLED by default for the profile.
 * All other modules remain at their current state (additive — never disable existing).
 */
const MODULES_DISABLED_BY_DEFAULT: Record<OrgProfileType, OptionalModuleKey[]> = {
  architect: ['procurement', 'materials', 'boq'],
  engineer: ['procurement', 'materials', 'boq'],
  consultant: ['procurement', 'materials', 'boq'],
  project_manager: ['procurement', 'materials', 'boq'],
  supervisor: ['procurement', 'materials', 'boq'],
  developer: [],
  contractor: [],
  subcontractor: [],
  other: [],
};

// ─── Seeding result ───────────────────────────────────────────────────────────

export interface OrgAdoptionPreview {
  readonly orgProfileType: OrgProfileType;
  readonly stagesToCreate: string[];
  readonly stagesAlreadyExist: number;
  readonly modulesToDisable: OptionalModuleKey[];
  readonly profileTypeAlreadySet: boolean;
}

export interface OrgAdoptionResult {
  readonly stagesCreated: number;
  readonly modulesUpdated: number;
  readonly profileTypeSet: boolean;
}

// ─── Preview (no writes) ──────────────────────────────────────────────────────

export async function previewOrgAdoption(
  db: DbExecutor,
  organizationId: string,
  orgProfileType: OrgProfileType,
): Promise<OrgAdoptionPreview> {
  const desiredStages = STAGE_DEFAULTS[orgProfileType];

  // Check what stages already exist (by name)
  const existingStages = await db
    .select({ name: projectStageDefinitions.name })
    .from(projectStageDefinitions)
    .where(eq(projectStageDefinitions.organizationId, organizationId));

  const existingNames = new Set(existingStages.map((s) => s.name.toLowerCase()));
  const stagesToCreate = desiredStages.filter((name) => !existingNames.has(name.toLowerCase()));
  const stagesAlreadyExist = desiredStages.length - stagesToCreate.length;

  // Check if profile type is already set
  const currentProfileType = await getOrganizationSettingValue<string>(
    db,
    organizationId,
    ORG_PROFILE_TYPE_SETTING_KEY,
  );

  const modulesToDisable = MODULES_DISABLED_BY_DEFAULT[orgProfileType];

  return {
    orgProfileType,
    stagesToCreate,
    stagesAlreadyExist,
    modulesToDisable,
    profileTypeAlreadySet: currentProfileType === orgProfileType,
  };
}

// ─── Apply (idempotent writes) ────────────────────────────────────────────────

export async function applyOrgAdoption(
  db: DbExecutor,
  organizationId: string,
  orgProfileType: OrgProfileType,
): Promise<OrgAdoptionResult> {
  const desiredStages = STAGE_DEFAULTS[orgProfileType];

  // 1. Seed stage definitions (insert-if-missing by name)
  const existingStages = await db
    .select({ name: projectStageDefinitions.name, position: projectStageDefinitions.position })
    .from(projectStageDefinitions)
    .where(eq(projectStageDefinitions.organizationId, organizationId));

  const existingNames = new Set(existingStages.map((s) => s.name.toLowerCase()));
  const maxPosition = existingStages.reduce((max, s) => Math.max(max, s.position ?? 0), -1);

  const stagesToInsert = desiredStages
    .filter((name) => !existingNames.has(name.toLowerCase()))
    .map((name, idx) => ({
      organizationId,
      name,
      position: maxPosition + 1 + idx,
    }));

  let stagesCreated = 0;
  if (stagesToInsert.length > 0) {
    await db.insert(projectStageDefinitions).values(stagesToInsert);
    stagesCreated = stagesToInsert.length;
  }

  // 2. Set org profile type (only if not already set)
  let profileTypeSet = false;
  const currentProfileType = await getOrganizationSettingValue<string>(
    db,
    organizationId,
    ORG_PROFILE_TYPE_SETTING_KEY,
  );
  if (!currentProfileType) {
    await upsertOrganizationSettingValue(db, organizationId, ORG_PROFILE_TYPE_SETTING_KEY, orgProfileType);
    profileTypeSet = true;
  }

  // 3. Set module defaults (additive — only disable if the preference is currently null/auto)
  const disabledModules = MODULES_DISABLED_BY_DEFAULT[orgProfileType];
  const existingPreferences = await listModulePreferences(db, organizationId);
  const prefMap = new Map(existingPreferences.map((p) => [p.moduleKey, p.enabled]));

  let modulesUpdated = 0;
  for (const moduleKey of disabledModules) {
    // Only write if the preference has never been explicitly set
    if (prefMap.get(moduleKey) === null || prefMap.get(moduleKey) === undefined) {
      await setModulePreference(db, organizationId, moduleKey, false);
      modulesUpdated++;
    }
  }

  return { stagesCreated, modulesUpdated, profileTypeSet };
}
