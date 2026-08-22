/**
 * Profiles tab DATA paths against real Supabase (RLS). Measures click→business-data
 * server time: one org context + tab payload (no redundant getShellContext).
 *
 * Run: npx tsx --tsconfig scripts/profile-tsconfig.json scripts/profile-real-tab-path.ts
 */
import type { OrgContext } from '@/shared/auth/context';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', override: true });

const realDbUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
if (!realDbUrl || /127\.0\.0\.1|localhost/.test(realDbUrl)) {
  throw new Error(
    'Real Supabase DIRECT_DATABASE_URL required. Refusing PGlite/harness DATABASE_URL.',
  );
}
process.env.DATABASE_URL = realDbUrl;
process.env.DIRECT_DATABASE_URL = realDbUrl;
process.env.PF_TAB_PROFILE = '1';
// Force fresh postgres pools with profiling hooks (avoid hot-reload reuse).
(globalThis as { __projectflowSql?: unknown; __projectflowAdminSql?: unknown }).__projectflowSql =
  undefined;
(globalThis as { __projectflowSql?: unknown; __projectflowAdminSql?: unknown }).__projectflowAdminSql =
  undefined;

const BASELINE_BEFORE = {
  overview: { warmMs: 3094, queryCount: null as number | null },
  billing: { warmMs: 2505, queryCount: null as number | null },
  billingPlan: { warmMs: 1590, queryCount: null as number | null },
  expenses: { warmMs: 1287, queryCount: null as number | null },
  schedule: { warmMs: 1283, queryCount: null as number | null },
};

async function main() {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const path = await import('node:path');
  const { performance } = await import('node:perf_hooks');
  const { sql } = await import('drizzle-orm');
  const { loadProjectBillingTabPayload } = await import('@/modules/billing');
  const { loadBillingPlanWorkspacePayload } = await import('@/modules/billing-plan');
  const { listExpensesForOrg } = await import('@/modules/expenses/application/queries');
  const { listPlanningPlan } = await import('@/modules/planning/application/list-plan');
  const { buildCriticalPathFoundation } = await import('@/modules/planning/domain/critical-path-foundation');
  const { getProjectOverviewPayload } = await import('@/modules/projects');
  const { getAdminDb, withUserContext } = await import('@/shared/db/client');
  const { resolveOrgContext } = await import('@/modules/tenancy');
  const { orgContextFromAuthzSnapshot, toOrgAuthzSnapshot } = await import(
    '@/shared/auth/org-authz-memo'
  );
  const { runInOrgRequestTxFrame } = await import('@/shared/auth/org-request-tx');
  const { hasPermission } = await import('@/shared/permissions/assert');
  const { PERMISSIONS } = await import('@/shared/permissions/catalog');
  const { todayInTimeZone } = await import('@/shared/dates');
  const { getTabProfileSpans, runWithTabProfile, summarizeProfile } = await import(
    '@/shared/perf/tab-profile'
  );
  const { summarizeQueryBreakdown } = await import('@/shared/db/profile-sql');

  type Target = {
    userId: string;
    organizationId: string;
    projectId: string;
    projectName: string;
  };

  type TabResult = {
    tab: string;
    coldMs: number;
    warmMs: number;
    txMs: number;
    queryCount: number;
    rlsSetupMs: number;
    businessQueryMs: number;
    businessQueryCount: number;
    slowestQueries: { name: string; ms: number }[];
    slowestBusinessQueries: { name: string; ms: number }[];
    duplicateTableReads: string[];
  };

  function detectDuplicateReads(spans: ReturnType<typeof getTabProfileSpans>): string[] {
    const tableHits = new Map<string, number>();
    for (const span of spans) {
      if (span.kind !== 'query') continue;
      const fromMatch = span.name.match(/\bfrom\s+"?(\w+)"?/i);
      if (fromMatch?.[1]) {
        const table = fromMatch[1];
        tableHits.set(table, (tableHits.get(table) ?? 0) + 1);
      }
    }
    return [...tableHits.entries()]
      .filter(([, count]) => count > 1)
      .map(([table, count]) => `${table}×${count}`);
  }

  async function findTarget(): Promise<Target> {
    const admin = getAdminDb();
    const rows = await admin.execute(sql`
      SELECT om.user_id, om.organization_id, p.id AS project_id, p.name AS project_name
      FROM organization_memberships om
      INNER JOIN projects p ON p.organization_id = om.organization_id
      WHERE p.work_kind = 'project'
      ORDER BY p.updated_at DESC NULLS LAST
      LIMIT 1
    `);
    const row = rows[0] as
      | { user_id: string; organization_id: string; project_id: string; project_name: string }
      | undefined;
    if (!row) throw new Error('No project for profiling');
    return {
      userId: row.user_id,
      organizationId: row.organization_id,
      projectId: row.project_id,
      projectName: row.project_name,
    };
  }

  async function withProfileOrg<T>(
    target: Target,
    fn: (context: OrgContext) => Promise<T>,
  ): Promise<T> {
    return withUserContext(target.userId, async (tx) => {
      const resolved = await resolveOrgContext(tx, {
        userId: target.userId,
        organizationId: target.organizationId,
        locale: 'he-IL',
      });
      const snapshot = toOrgAuthzSnapshot(resolved);
      return runInOrgRequestTxFrame({ tx: tx as never, snapshot }, () =>
        fn(
          orgContextFromAuthzSnapshot(snapshot, {
            userId: target.userId,
            locale: 'he-IL',
            db: tx,
          }),
        ),
      );
    });
  }

  async function timeTabData(
    target: Target,
    fn: () => Promise<void>,
  ): Promise<{
    totalMs: number;
    summary: ReturnType<typeof summarizeProfile>;
    breakdown: ReturnType<typeof summarizeQueryBreakdown>;
    duplicates: string[];
  }> {
    return runWithTabProfile(async () => {
      const t0 = performance.now();
      await fn();
      const spans = getTabProfileSpans();
      const summary = summarizeProfile(spans);
      const breakdown = summarizeQueryBreakdown(spans);
      return {
        totalMs: Math.round(performance.now() - t0),
        summary,
        breakdown,
        duplicates: detectDuplicateReads(spans),
      };
    });
  }

  async function profileOverview(target: Target) {
    return timeTabData(target, async () => {
      await withProfileOrg(target, (context) =>
        getProjectOverviewPayload(context, target.projectId),
      );
    });
  }

  async function profileBillingPlan(target: Target) {
    return timeTabData(target, async () => {
      await withProfileOrg(target, (context) =>
        loadBillingPlanWorkspacePayload(context, { projectId: target.projectId }),
      );
    });
  }

  async function profileBilling(target: Target) {
    return timeTabData(target, async () => {
      await withProfileOrg(target, (context) =>
        loadProjectBillingTabPayload(context, target.projectId, null),
      );
    });
  }

  async function profileExpenses(target: Target) {
    return timeTabData(target, async () => {
      await withProfileOrg(target, (context) =>
        listExpensesForOrg(context, { projectId: target.projectId, limit: 10 }),
      );
    });
  }

  async function profileSchedule(target: Target) {
    return timeTabData(target, async () => {
      await withProfileOrg(target, async (context) => {
        if (!hasPermission(context, PERMISSIONS.PLANNING_READ)) return;
        try {
          await listPlanningPlan(
            {
              organizationId: context.organizationId,
              projectId: target.projectId,
              workKind: 'project',
              today: todayInTimeZone(context.organization.timezone),
            },
            { db: context.db },
          );
        } catch {
          void buildCriticalPathFoundation({
            projectId: target.projectId,
            workItems: [],
            dependencies: [],
          });
        }
      });
    });
  }

  const target = await findTarget();
  console.info(`Profiling "${target.projectName}" — data-ready paths (real Supabase RLS)`);

  await withProfileOrg(target, async () => {});

  const tabs: TabResult[] = [];
  const runners = [
    ['overview', profileOverview],
    ['billingPlan', profileBillingPlan],
    ['billing', profileBilling],
    ['expenses', profileExpenses],
    ['schedule', profileSchedule],
  ] as const;

  for (const [name, runner] of runners) {
    const cold = await runner(target);
    const warm = await runner(target);
    tabs.push({
      tab: name,
      coldMs: cold.totalMs,
      warmMs: warm.totalMs,
      txMs: warm.summary.txMs,
      queryCount: warm.summary.queryCount,
      rlsSetupMs: warm.breakdown.rlsSetupMs,
      businessQueryMs: warm.breakdown.businessMs,
      businessQueryCount: warm.breakdown.businessCount,
      slowestQueries: warm.summary.slowestQueries.map((q) => ({ name: q.name, ms: q.ms })),
      slowestBusinessQueries: warm.breakdown.slowestBusiness.map((q) => ({ name: q.name, ms: q.ms })),
      duplicateTableReads: warm.duplicates,
    });
    const slow = warm.breakdown.slowestBusiness[0];
    console.info(
      `${name}: warm=${warm.totalMs}ms queries=${warm.summary.queryCount} (biz=${warm.breakdown.businessCount} rls=${warm.breakdown.rlsSetupCount}) bizMs=${warm.breakdown.businessMs} slowest="${slow?.name ?? '-'}"@${slow?.ms ?? 0}ms`,
    );
  }

  const outDir = path.resolve(process.cwd(), 'docs/performance');
  mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'REAL-SUPABASE-TAB-PROFILE.json');
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        stack: 'real-supabase-rls-data-ready-query-reduced',
        projectId: target.projectId,
        baselineBefore: BASELINE_BEFORE,
        tabs,
      },
      null,
      2,
    ),
  );
  console.info(`Wrote ${outFile}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
