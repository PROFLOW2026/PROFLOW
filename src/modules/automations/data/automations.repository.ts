import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { automationRules, automationRuns } from '@drizzle/schema';
import { getAdminDb } from '@/shared/db';
import { ORG_LIST_HARD_CAP, resolveListLimit } from '@/shared/db/list-limits';
import type { DbExecutor } from '@/shared/db/types';
import type {
  AutomationPresetKey,
  AutomationRuleRecord,
  AutomationRunRecord,
  AutomationRunStatus,
} from '../domain/types';

function mapRule(row: typeof automationRules.$inferSelect): AutomationRuleRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    presetKey: row.presetKey as AutomationPresetKey,
    enabled: row.enabled,
    configJson: (row.configJson ?? {}) as Record<string, unknown>,
    createdByUserId: row.createdByUserId,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listAutomationRules(
  db: DbExecutor,
  organizationId: string,
): Promise<AutomationRuleRecord[]> {
  const rows = await db
    .select()
    .from(automationRules)
    .where(and(eq(automationRules.organizationId, organizationId), isNull(automationRules.archivedAt)))
    .orderBy(automationRules.presetKey);
  return rows.map(mapRule);
}

export async function findAutomationRuleByPreset(
  db: DbExecutor,
  organizationId: string,
  presetKey: AutomationPresetKey,
): Promise<AutomationRuleRecord | null> {
  const [row] = await db
    .select()
    .from(automationRules)
    .where(
      and(
        eq(automationRules.organizationId, organizationId),
        eq(automationRules.presetKey, presetKey),
        isNull(automationRules.archivedAt),
      ),
    )
    .limit(1);
  return row ? mapRule(row) : null;
}

export async function upsertAutomationRule(
  db: DbExecutor,
  values: {
    organizationId: string;
    presetKey: AutomationPresetKey;
    enabled: boolean;
    createdByUserId: string | null;
    configJson?: Record<string, unknown>;
  },
): Promise<AutomationRuleRecord> {
  const existing = await findAutomationRuleByPreset(db, values.organizationId, values.presetKey);
  if (existing) {
    const [row] = await db
      .update(automationRules)
      .set({
        enabled: values.enabled,
        configJson: values.configJson ?? existing.configJson,
        updatedAt: new Date(),
      })
      .where(
        and(eq(automationRules.id, existing.id), eq(automationRules.organizationId, values.organizationId)),
      )
      .returning();
    if (!row) throw new Error('Failed to update automation rule');
    return mapRule(row);
  }
  const [row] = await db
    .insert(automationRules)
    .values({
      organizationId: values.organizationId,
      presetKey: values.presetKey,
      enabled: values.enabled,
      configJson: values.configJson ?? {},
      createdByUserId: values.createdByUserId,
    })
    .returning();
  if (!row) throw new Error('Failed to insert automation rule');
  return mapRule(row);
}

export async function insertAutomationRun(
  _db: DbExecutor,
  values: {
    organizationId: string;
    ruleId: string;
    status: AutomationRunStatus;
    actionsJson: unknown;
    errorMessage: string | null;
    accessScopeJson?: { readonly projectIds?: readonly string[] } | Record<string, unknown>;
  },
): Promise<AutomationRunRecord> {
  const inserted = await getAdminDb().execute(sql`
    SELECT app.record_automation_run(
      ${values.organizationId}::uuid,
      ${values.ruleId}::uuid,
      ${values.status},
      ${JSON.stringify(values.actionsJson ?? [])}::jsonb,
      ${values.errorMessage},
      ${JSON.stringify(values.accessScopeJson ?? {})}::jsonb
    ) AS id
  `);
  const insertedId = Array.isArray(inserted)
    ? (inserted[0] as { id?: string } | undefined)?.id
    : (inserted as { rows?: Array<{ id?: string }> }).rows?.[0]?.id;
  if (!insertedId) throw new Error('Failed to insert automation run');
  return {
    id: insertedId,
    organizationId: values.organizationId,
    ruleId: values.ruleId,
    status: values.status,
    actionsJson: values.actionsJson,
    errorMessage: values.errorMessage,
    ranAt: new Date(),
  };
}

export async function listAutomationRuns(
  db: DbExecutor,
  organizationId: string,
  options: { readonly ruleId?: string; readonly limit?: number } = {},
): Promise<AutomationRunRecord[]> {
  const clauses = [eq(automationRuns.organizationId, organizationId)];
  if (options.ruleId) clauses.push(eq(automationRuns.ruleId, options.ruleId));
  const rows = await db
    .select()
    .from(automationRuns)
    .where(and(...clauses))
    .orderBy(desc(automationRuns.ranAt))
    .limit(resolveListLimit(options.limit, { hardCap: ORG_LIST_HARD_CAP, defaultLimit: 50 }));
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    ruleId: row.ruleId,
    status: row.status as AutomationRunStatus,
    actionsJson: row.actionsJson,
    errorMessage: row.errorMessage,
    ranAt: row.ranAt,
  }));
}
