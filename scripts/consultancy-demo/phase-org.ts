import type { OrgContext } from '../../src/shared/auth/context.ts';
import {
  CONSULTANCY_DEMO_ORG_ID,
  CONSULTANCY_MODULES,
  CONSULTANCY_ORG_NAME,
  EXCLUDED_ORG_NAME,
  SEED_SETTING_KEY,
  SEED_VERSION,
  STAGE_NAMES,
} from './constants.ts';
import type { SeedStats } from './context.ts';
import { buildRunPhase, findConsultancyOrgId, markerRef } from './context.ts';

async function createConsultancyOrgWithStableId(userId: string): Promise<string> {
  const { withUserContext } = await import('../../src/shared/db/client.ts');
  const { insertOrganization, findOrganizationById } = await import(
    '../../src/modules/tenancy/data/organizations.repository.ts'
  );
  const { assignRole, provisionOrganizationRoles } = await import('../../src/modules/rbac/index.ts');
  const { insertMembership } = await import('../../src/modules/tenancy/data/organizations.repository.ts');
  const { seedUniversalBusinessCatalogs } = await import(
    '../../src/modules/business-catalog/application/seed-catalog.ts'
  );
  const { ensureOrgDefaultPaymentTermKey } = await import(
    '../../src/modules/business-catalog/application/payment-term-defaults.ts'
  );
  const { ensureDefaultBranding } = await import('../../src/modules/branding/index.ts');
  const { seedDefaultCostCategories, setModulePreference } = await import(
    '../../src/modules/tenancy/data/organizations.repository.ts'
  );
  const { applyBusinessProfileConfig } = await import(
    '../../src/modules/tenancy/application/apply-business-profile.ts'
  );
  const { upsertOrganizationSettingValue } = await import(
    '../../src/modules/tenancy/data/organization-settings.repository.ts'
  );
  const { WORK_MIX_SETTING_KEY } = await import('../../src/modules/tenancy/domain/work-mix.ts');
  const { writeAuditEvent, AUDIT_ACTIONS } = await import('../../src/shared/audit/index.ts');
  const { defaultsForCountry } = await import('../../src/modules/tenancy/domain/organization-defaults.ts');
  const { organizations } = await import('@drizzle/schema');
  const { eq } = await import('drizzle-orm');

  return withUserContext(userId, async (tx) => {
    const [existingById] = await tx
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, CONSULTANCY_DEMO_ORG_ID))
      .limit(1);
    if (existingById) {
      if (existingById.name === EXCLUDED_ORG_NAME) {
        throw new Error(`Refusing real business org: ${EXCLUDED_ORG_NAME}`);
      }
      return existingById.id;
    }

    const countryDefaults = defaultsForCountry('IL');
    const organizationId = await insertOrganization(
      tx,
      {
        name: CONSULTANCY_ORG_NAME,
        countryCode: 'IL',
        baseCurrency: countryDefaults.currency,
        timezone: countryDefaults.timezone,
        defaultLocale: 'he-IL',
      },
      CONSULTANCY_DEMO_ORG_ID,
    );

    const membership = await insertMembership(tx, {
      organizationId,
      userId,
      status: 'active',
    });

    const organization = await findOrganizationById(tx, organizationId);
    if (!organization) throw new Error('Consultancy org not readable after create');

    const roleIds = await provisionOrganizationRoles(tx, organization.id);
    await assignRole(tx, {
      organizationId: organization.id,
      membershipId: membership.id,
      userId,
      roleId: roleIds.owner,
    });

    await seedDefaultCostCategories(tx, organization.id);
    await seedUniversalBusinessCatalogs(tx, organization.id);
    await ensureOrgDefaultPaymentTermKey(tx, organization.id);
    await ensureDefaultBranding(tx, organization.id, {
      name: organization.name,
      countryCode: organization.countryCode,
    });

    await applyBusinessProfileConfig(tx, organization.id, 'ENGINEERING_CONSULTANT', 'he-IL', {
      moduleMode: 'replace',
      extraModules: [...CONSULTANCY_MODULES],
      workMixOverride: 'projects',
      experienceComplexity: 'simple',
    });
    await upsertOrganizationSettingValue(tx, organization.id, WORK_MIX_SETTING_KEY, 'projects');

    for (const moduleKey of CONSULTANCY_MODULES) {
      await setModulePreference(tx, organization.id, moduleKey, true);
    }
    await setModulePreference(tx, organization.id, 'work_management', true);

    await writeAuditEvent(tx, {
      organizationId: organization.id,
      actorUserId: userId,
      action: AUDIT_ACTIONS.ORGANIZATION_CREATED,
      entityType: 'organization',
      entityId: organization.id,
      after: organization,
    });

    return organization.id;
  });
}

async function seedStageDefinitions(context: OrgContext): Promise<Map<string, string>> {
  const { projectStageDefinitions } = await import('@drizzle/schema');
  const { eq } = await import('drizzle-orm');
  const stageIds = new Map<string, string>();

  const existing = await context.db
    .select({
      id: projectStageDefinitions.id,
      name: projectStageDefinitions.name,
      position: projectStageDefinitions.position,
    })
    .from(projectStageDefinitions)
    .where(eq(projectStageDefinitions.organizationId, context.organizationId));

  for (const row of existing) {
    stageIds.set(row.name, row.id);
  }

  const existingNames = new Set(existing.map((row) => row.name.toLowerCase()));
  const maxPosition = existing.reduce((max, row) => Math.max(max, row.position ?? 0), -1);
  const toInsert = STAGE_NAMES.filter((name) => !existingNames.has(name.toLowerCase())).map(
    (name, idx) => ({
      organizationId: context.organizationId,
      name,
      position: maxPosition + 1 + idx,
    }),
  );

  if (toInsert.length > 0) {
    const inserted = await context.db.insert(projectStageDefinitions).values(toInsert).returning({
      id: projectStageDefinitions.id,
      name: projectStageDefinitions.name,
    });
    for (const row of inserted) {
      stageIds.set(row.name, row.id);
    }
  }

  return stageIds;
}

export async function ensureConsultancyOrganization(
  userId: string,
  stats: SeedStats,
): Promise<string> {
  let organizationId = await findConsultancyOrgId(userId);
  if (!organizationId) {
    organizationId = await createConsultancyOrgWithStableId(userId);
    stats.notes.push(`Created consultancy org ${CONSULTANCY_ORG_NAME}`);
  } else {
    stats.notes.push(`Reusing consultancy org ${organizationId}`);
  }

  const runPhase = buildRunPhase(userId, organizationId);
  await runPhase('org modules and stages', organizationId, userId, async (context) => {
    const { setModulePreference } = await import('../../src/modules/tenancy/data/organizations.repository.ts');
    const { upsertOrganizationSettingValue } = await import(
      '../../src/modules/tenancy/data/organization-settings.repository.ts'
    );

    for (const moduleKey of CONSULTANCY_MODULES) {
      await setModulePreference(context.db, context.organizationId, moduleKey, true);
    }
    await setModulePreference(context.db, context.organizationId, 'work_management', true);

    await seedStageDefinitions(context);
    await upsertOrganizationSettingValue(
      context.db,
      context.organizationId,
      SEED_SETTING_KEY,
      SEED_VERSION,
    );
    stats.notes.push(`Seed version ${SEED_VERSION} stored (${markerRef('org')})`);
  });

  return organizationId;
}
