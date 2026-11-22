/**
 * One-time / operator transfer of proven takeoff confirms between analyses of the same DWG.
 * Dry-run unless EXECUTE=1. Never prints secrets or detection-id dumps.
 *
 *   npx tsx --import ./tests/e2e/harness/alias-server-only.mjs scripts/electrical-takeoff/transfer-confirmed-marks.ts
 */
import dotenv from 'dotenv';
import { eq } from 'drizzle-orm';
import { takeoffAnalyses } from '@drizzle/schema/electrical-takeoff';

dotenv.config({ path: '.env.local', override: true });
process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '';

const SOURCE_ANALYSIS_ID = process.env.SOURCE_ANALYSIS_ID ?? '8d99eaa9-fc1d-43cc-a9c4-756bb19282f3';
const TARGET_ANALYSIS_ID = process.env.TARGET_ANALYSIS_ID ?? '3519a582-0ee3-46fd-86a3-74d333113f5e';
const EXECUTE = process.env.EXECUTE === '1';
const EXPECTED_TRANSFER = Number(process.env.EXPECTED_TRANSFER ?? '524');

async function main() {
  const { getAdminDb } = await import('@/shared/db/client');
  const { withTakeoffWorkerCallbackTx } = await import(
    '@/modules/electrical-takeoff/application/worker-callbacks'
  );
  const {
    planConfirmReuseBetweenAnalyses,
    transferConfirmedMarksFromAnalysis,
  } = await import('@/modules/electrical-takeoff/application/reuse-confirmed-marks');

  const admin = getAdminDb();
  const result = await withTakeoffWorkerCallbackTx(admin, async (tx) => {
    const [target] = await tx
      .select({
        id: takeoffAnalyses.id,
        organizationId: takeoffAnalyses.organizationId,
        projectId: takeoffAnalyses.projectId,
      })
      .from(takeoffAnalyses)
      .where(eq(takeoffAnalyses.id, TARGET_ANALYSIS_ID))
      .limit(1);
    if (!target) throw new Error('target_analysis_missing');
    const [source] = await tx
      .select({ id: takeoffAnalyses.id, projectId: takeoffAnalyses.projectId })
      .from(takeoffAnalyses)
      .where(eq(takeoffAnalyses.id, SOURCE_ANALYSIS_ID))
      .limit(1);
    if (!source) throw new Error('source_analysis_missing');
    if (source.projectId !== target.projectId) throw new Error('cross_project_forbidden');

    const plan = await planConfirmReuseBetweenAnalyses(
      tx,
      target.organizationId,
      SOURCE_ANALYSIS_ID,
      TARGET_ANALYSIS_ID,
    );
    if (plan.transferIds.includes('layout:F0#253')) {
      throw new Error('refused_deleted_mark');
    }
    if (EXECUTE && plan.transferIds.length !== EXPECTED_TRANSFER) {
      return {
        dryRun: false,
        aborted: true,
        transferred: 0,
        planned: plan.transferIds.length,
        expected: EXPECTED_TRANSFER,
        skipped: plan.skipped,
        skippedReasons: plan.skippedReasons,
      };
    }
    if (!EXECUTE) {
      return {
        dryRun: true,
        planned: plan.transferIds.length,
        expected: EXPECTED_TRANSFER,
        skipped: plan.skipped,
        skippedReasons: plan.skippedReasons,
      };
    }
    const applied = await transferConfirmedMarksFromAnalysis(
      tx,
      target.organizationId,
      target.projectId,
      SOURCE_ANALYSIS_ID,
      TARGET_ANALYSIS_ID,
    );
    return {
      dryRun: false,
      aborted: false,
      transferred: applied.transferred,
      skipped: applied.skipped,
      skippedReasons: applied.skippedReasons,
    };
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if ('aborted' in result && result.aborted) process.exit(2);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'transfer_failed';
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(1);
});
