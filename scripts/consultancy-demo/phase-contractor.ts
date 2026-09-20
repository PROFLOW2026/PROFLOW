import {
  CONTRACTOR_DEMO_ORG_ID,
  CONTRACTOR_DEMO_ORG_NAME,
  EXCLUDED_ORG_NAME,
} from './constants.ts';
import type { RunPhase, SeedStats } from './context.ts';

export async function disableContractorWorkManagement(
  runPhase: RunPhase,
  userId: string,
  stats: SeedStats,
): Promise<void> {
  await runPhase('disable contractor UWM', CONTRACTOR_DEMO_ORG_ID, userId, async (context) => {
    if (context.organization.id !== CONTRACTOR_DEMO_ORG_ID) {
      throw new Error('Contractor org id mismatch');
    }
    if (context.organization.name === EXCLUDED_ORG_NAME) {
      throw new Error(`Refusing real business org: ${EXCLUDED_ORG_NAME}`);
    }
    if (context.organization.name !== CONTRACTOR_DEMO_ORG_NAME) {
      throw new Error(
        `Expected contractor org "${CONTRACTOR_DEMO_ORG_NAME}", got "${context.organization.name}"`,
      );
    }

    const { setModulePreference } = await import('../../src/modules/tenancy/data/organizations.repository.ts');
    await setModulePreference(context.db, context.organizationId, 'work_management', false);
    stats.notes.push(`Disabled work_management on contractor demo org (${CONTRACTOR_DEMO_ORG_NAME})`);
  });
}
