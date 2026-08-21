import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  approvalRequestSteps,
  approvalRequests,
  approvalRuleSteps,
  approvalRules,
  profiles,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { assertConsecutiveStepOrders, entitySourceHref, isApproverStrategy } from '../domain/steps';
import type {
  ApprovalEntityType,
  ApprovalRequestRecord,
  ApprovalRequestStepRecord,
  ApprovalRuleRecord,
  ApprovalRuleStepRecord,
  ApprovalRuleWithSteps,
  ApprovalStatus,
  ApprovalStepStatus,
  ApproverStrategy,
  PendingApprovalItem,
} from '../domain/types';
import { isApprovalEntityType, isApprovalStatus } from '../domain/rules';

function sqlResultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

function mapRule(row: typeof approvalRules.$inferSelect): ApprovalRuleRecord {
  const entityType = isApprovalEntityType(row.entityType) ? row.entityType : 'expense';
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    entityType,
    thresholdAmount: row.thresholdAmount,
    currency: row.currency,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapRuleStep(row: typeof approvalRuleSteps.$inferSelect): ApprovalRuleStepRecord {
  const strategy = isApproverStrategy(row.approverStrategy)
    ? row.approverStrategy
    : ('permission' as ApproverStrategy);
  return {
    id: row.id,
    organizationId: row.organizationId,
    ruleId: row.ruleId,
    stepOrder: row.stepOrder,
    name: row.name,
    approverStrategy: strategy,
    roleTemplateKey: row.roleTemplateKey,
    permissionKey: row.permissionKey,
    userId: row.userId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapRequest(row: typeof approvalRequests.$inferSelect): ApprovalRequestRecord {
  const entityType = isApprovalEntityType(row.entityType) ? row.entityType : 'expense';
  const status = isApprovalStatus(row.status) ? row.status : 'submitted';
  return {
    id: row.id,
    organizationId: row.organizationId,
    ruleId: row.ruleId,
    entityType,
    entityId: row.entityId,
    amount: row.amount,
    currency: row.currency,
    status,
    submittedByUserId: row.submittedByUserId,
    decidedByUserId: row.decidedByUserId,
    decidedAt: row.decidedAt,
    decisionNote: row.decisionNote,
    currentStepOrder: row.currentStepOrder ?? null,
    totalSteps: row.totalSteps ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapRequestStep(row: typeof approvalRequestSteps.$inferSelect): ApprovalRequestStepRecord {
  const status = (['pending', 'approved', 'rejected'] as const).includes(
    row.status as ApprovalStepStatus,
  )
    ? (row.status as ApprovalStepStatus)
    : 'pending';
  const strategy = isApproverStrategy(row.approverStrategy)
    ? row.approverStrategy
    : ('permission' as ApproverStrategy);
  return {
    id: row.id,
    organizationId: row.organizationId,
    requestId: row.requestId,
    stepOrder: row.stepOrder,
    name: row.name,
    approverStrategy: strategy,
    roleTemplateKey: row.roleTemplateKey,
    permissionKey: row.permissionKey,
    userId: row.userId,
    status,
    decidedByUserId: row.decidedByUserId,
    decidedAt: row.decidedAt,
    decisionNote: row.decisionNote,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listApprovalRulesForOrg(
  db: DbExecutor,
  organizationId: string,
): Promise<ApprovalRuleRecord[]> {
  const rows = await db
    .select()
    .from(approvalRules)
    .where(eq(approvalRules.organizationId, organizationId))
    .orderBy(desc(approvalRules.updatedAt));
  return rows.map(mapRule);
}

export async function listApprovalRulesWithStepsForOrg(
  db: DbExecutor,
  organizationId: string,
): Promise<ApprovalRuleWithSteps[]> {
  const rules = await listApprovalRulesForOrg(db, organizationId);
  if (rules.length === 0) return [];
  const steps = await db
    .select()
    .from(approvalRuleSteps)
    .where(
      and(
        eq(approvalRuleSteps.organizationId, organizationId),
        inArray(
          approvalRuleSteps.ruleId,
          rules.map((rule) => rule.id),
        ),
      ),
    )
    .orderBy(asc(approvalRuleSteps.stepOrder));
  const byRule = new Map<string, ApprovalRuleStepRecord[]>();
  for (const step of steps) {
    const mapped = mapRuleStep(step);
    const list = byRule.get(mapped.ruleId) ?? [];
    list.push(mapped);
    byRule.set(mapped.ruleId, list);
  }
  return rules.map((rule) => ({ ...rule, steps: byRule.get(rule.id) ?? [] }));
}

/**
 * Gate-safe rule load via SECURITY DEFINER (0029).
 * Does not require approvals.read - thresholds stay hidden from table RLS SELECT.
 */
export async function listEnabledRulesForEntity(
  db: DbExecutor,
  organizationId: string,
  entityType: ApprovalEntityType,
): Promise<ApprovalRuleRecord[]> {
  const rawRows = sqlResultRows<Record<string, unknown>>(
    await db.execute(sql`
      SELECT *
      FROM app.enabled_approval_rules_for_gate(${organizationId}::uuid, ${entityType})
    `),
  );

  return rawRows.map((raw) => {
    const entity = String(raw.entity_type ?? raw.entityType ?? 'expense');
    return {
      id: String(raw.id),
      organizationId: String(raw.organization_id ?? raw.organizationId),
      name: String(raw.name),
      entityType: isApprovalEntityType(entity) ? entity : 'expense',
      thresholdAmount: (raw.threshold_amount ?? raw.thresholdAmount ?? null) as string | null,
      currency: (raw.currency ?? null) as string | null,
      enabled: Boolean(raw.enabled),
      createdAt: (raw.created_at ?? raw.createdAt) as Date,
      updatedAt: (raw.updated_at ?? raw.updatedAt) as Date,
    };
  });
}

export async function findApprovalRuleById(
  db: DbExecutor,
  organizationId: string,
  ruleId: string,
): Promise<ApprovalRuleRecord | null> {
  const [row] = await db
    .select()
    .from(approvalRules)
    .where(and(eq(approvalRules.id, ruleId), eq(approvalRules.organizationId, organizationId)))
    .limit(1);
  return row ? mapRule(row) : null;
}

export async function listRuleSteps(
  db: DbExecutor,
  organizationId: string,
  ruleId: string,
): Promise<ApprovalRuleStepRecord[]> {
  const rows = await db
    .select()
    .from(approvalRuleSteps)
    .where(
      and(
        eq(approvalRuleSteps.organizationId, organizationId),
        eq(approvalRuleSteps.ruleId, ruleId),
      ),
    )
    .orderBy(asc(approvalRuleSteps.stepOrder));
  return rows.map(mapRuleStep);
}

export interface ApprovalRuleInsert {
  readonly organizationId: string;
  readonly name: string;
  readonly entityType: ApprovalEntityType;
  readonly thresholdAmount: string | null;
  readonly currency: string | null;
  readonly enabled: boolean;
}

export async function insertApprovalRule(
  db: DbExecutor,
  input: ApprovalRuleInsert,
): Promise<ApprovalRuleRecord> {
  const [row] = await db
    .insert(approvalRules)
    .values({
      organizationId: input.organizationId,
      name: input.name,
      entityType: input.entityType,
      thresholdAmount: input.thresholdAmount,
      currency: input.currency,
      enabled: input.enabled,
    })
    .returning();
  if (!row) throw new Error('Failed to insert approval rule');
  return mapRule(row);
}

export async function updateApprovalRuleRow(
  db: DbExecutor,
  organizationId: string,
  ruleId: string,
  patch: {
    readonly name?: string;
    readonly thresholdAmount?: string | null;
    readonly currency?: string | null;
    readonly enabled?: boolean;
  },
): Promise<ApprovalRuleRecord | null> {
  const [row] = await db
    .update(approvalRules)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.thresholdAmount !== undefined ? { thresholdAmount: patch.thresholdAmount } : {}),
      ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(approvalRules.id, ruleId), eq(approvalRules.organizationId, organizationId)))
    .returning();
  return row ? mapRule(row) : null;
}

export interface ApprovalRuleStepInsert {
  readonly organizationId: string;
  readonly ruleId: string;
  readonly stepOrder: number;
  readonly name: string | null;
  readonly approverStrategy: ApproverStrategy;
  readonly roleTemplateKey: string | null;
  readonly permissionKey: string | null;
  readonly userId: string | null;
}

export async function replaceApprovalRuleSteps(
  db: DbExecutor,
  organizationId: string,
  ruleId: string,
  steps: readonly Omit<ApprovalRuleStepInsert, 'organizationId' | 'ruleId'>[],
): Promise<ApprovalRuleStepRecord[]> {
  await db
    .delete(approvalRuleSteps)
    .where(
      and(
        eq(approvalRuleSteps.organizationId, organizationId),
        eq(approvalRuleSteps.ruleId, ruleId),
      ),
    );
  if (steps.length === 0) return [];
  const rows = await db
    .insert(approvalRuleSteps)
    .values(
      steps.map((step) => ({
        organizationId,
        ruleId,
        stepOrder: step.stepOrder,
        name: step.name,
        approverStrategy: step.approverStrategy,
        roleTemplateKey: step.roleTemplateKey,
        permissionKey: step.permissionKey,
        userId: step.userId,
      })),
    )
    .returning();
  return rows.map(mapRuleStep);
}

export async function findApprovalRequestById(
  db: DbExecutor,
  organizationId: string,
  requestId: string,
): Promise<ApprovalRequestRecord | null> {
  const [row] = await db
    .select()
    .from(approvalRequests)
    .where(
      and(eq(approvalRequests.id, requestId), eq(approvalRequests.organizationId, organizationId)),
    )
    .limit(1);
  return row ? mapRequest(row) : null;
}

export async function listRequestSteps(
  db: DbExecutor,
  organizationId: string,
  requestId: string,
): Promise<ApprovalRequestStepRecord[]> {
  const rows = await db
    .select()
    .from(approvalRequestSteps)
    .where(
      and(
        eq(approvalRequestSteps.organizationId, organizationId),
        eq(approvalRequestSteps.requestId, requestId),
      ),
    )
    .orderBy(asc(approvalRequestSteps.stepOrder));
  return rows.map(mapRequestStep);
}

export async function findOpenRequestForEntity(
  db: DbExecutor,
  organizationId: string,
  entityType: ApprovalEntityType,
  entityId: string,
): Promise<ApprovalRequestRecord | null> {
  const [row] = await db
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.organizationId, organizationId),
        eq(approvalRequests.entityType, entityType),
        eq(approvalRequests.entityId, entityId),
        eq(approvalRequests.status, 'submitted'),
      ),
    )
    .limit(1);
  return row ? mapRequest(row) : null;
}

export async function findLatestRequestForEntity(
  db: DbExecutor,
  organizationId: string,
  entityType: ApprovalEntityType,
  entityId: string,
): Promise<ApprovalRequestRecord | null> {
  const [row] = await db
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.organizationId, organizationId),
        eq(approvalRequests.entityType, entityType),
        eq(approvalRequests.entityId, entityId),
      ),
    )
    .orderBy(desc(approvalRequests.createdAt))
    .limit(1);
  return row ? mapRequest(row) : null;
}

/**
 * Gate-safe latest request (0029 SECURITY DEFINER).
 * Use from finalize/issue gates so actors without approvals.read still see status.
 */
export async function findLatestRequestForEntityGate(
  db: DbExecutor,
  organizationId: string,
  entityType: ApprovalEntityType,
  entityId: string,
): Promise<ApprovalRequestRecord | null> {
  const rawRows = sqlResultRows<Record<string, unknown>>(
    await db.execute(sql`
      SELECT *
      FROM app.latest_approval_request_for_gate(
        ${organizationId}::uuid,
        ${entityType},
        ${entityId}::uuid
      )
    `),
  );
  const raw = rawRows[0];
  if (!raw) return null;
  const entity = String(raw.entity_type ?? raw.entityType ?? 'expense');
  const status = String(raw.status ?? 'submitted');
  return {
    id: String(raw.id),
    organizationId: String(raw.organization_id ?? raw.organizationId),
    ruleId: (raw.rule_id ?? raw.ruleId ?? null) as string | null,
    entityType: isApprovalEntityType(entity) ? entity : 'expense',
    entityId: String(raw.entity_id ?? raw.entityId),
    amount: (raw.amount ?? null) as string | null,
    currency: (raw.currency ?? null) as string | null,
    status: isApprovalStatus(status) ? status : 'submitted',
    submittedByUserId: (raw.submitted_by_user_id ?? raw.submittedByUserId ?? null) as string | null,
    decidedByUserId: (raw.decided_by_user_id ?? raw.decidedByUserId ?? null) as string | null,
    decidedAt: (raw.decided_at ?? raw.decidedAt ?? null) as Date | null,
    decisionNote: (raw.decision_note ?? raw.decisionNote ?? null) as string | null,
    currentStepOrder: (raw.current_step_order ?? raw.currentStepOrder ?? null) as number | null,
    totalSteps: (raw.total_steps ?? raw.totalSteps ?? null) as number | null,
    createdAt: (raw.created_at ?? raw.createdAt) as Date,
    updatedAt: (raw.updated_at ?? raw.updatedAt) as Date,
  };
}

export async function listApprovalRequestsForOrg(
  db: DbExecutor,
  organizationId: string,
  options: {
    readonly status?: ApprovalStatus;
    readonly entityType?: ApprovalEntityType;
    readonly limit?: number;
  } = {},
): Promise<ApprovalRequestRecord[]> {
  const conditions = [eq(approvalRequests.organizationId, organizationId)];
  if (options.status) conditions.push(eq(approvalRequests.status, options.status));
  if (options.entityType) conditions.push(eq(approvalRequests.entityType, options.entityType));

  const rows = await db
    .select()
    .from(approvalRequests)
    .where(and(...conditions))
    .orderBy(desc(approvalRequests.createdAt))
    .limit(options.limit ?? 100);
  return rows.map(mapRequest);
}

export async function listPendingApprovalItems(
  db: DbExecutor,
  organizationId: string,
  options: { readonly limit?: number } = {},
): Promise<PendingApprovalItem[]> {
  const rows = await db
    .select({
      request: approvalRequests,
      submitterName: profiles.displayName,
    })
    .from(approvalRequests)
    .leftJoin(profiles, eq(approvalRequests.submittedByUserId, profiles.id))
    .where(
      and(
        eq(approvalRequests.organizationId, organizationId),
        eq(approvalRequests.status, 'submitted'),
      ),
    )
    .orderBy(desc(approvalRequests.createdAt))
    .limit(options.limit ?? 50);

  const now = Date.now();
  return rows.map((row) => {
    const mapped = mapRequest(row.request);
    return {
      id: mapped.id,
      entityType: mapped.entityType,
      entityId: mapped.entityId,
      amount: mapped.amount,
      currency: mapped.currency,
      status: 'submitted' as const,
      ruleId: mapped.ruleId,
      submittedByUserId: mapped.submittedByUserId,
      submitterName: row.submitterName ?? null,
      currentStepOrder: mapped.currentStepOrder,
      totalSteps: mapped.totalSteps,
      sourceHref: entitySourceHref(mapped.entityType, mapped.entityId),
      ageMs: Math.max(0, now - mapped.createdAt.getTime()),
      createdAt: mapped.createdAt,
    };
  });
}

export interface ApprovalRequestInsert {
  readonly organizationId: string;
  readonly ruleId: string | null;
  readonly entityType: ApprovalEntityType;
  readonly entityId: string;
  readonly amount: string | null;
  readonly currency: string | null;
  readonly submittedByUserId: string | null;
  readonly currentStepOrder?: number | null;
  readonly totalSteps?: number | null;
}

export async function insertApprovalRequest(
  db: DbExecutor,
  input: ApprovalRequestInsert,
): Promise<ApprovalRequestRecord> {
  const [row] = await db
    .insert(approvalRequests)
    .values({
      organizationId: input.organizationId,
      ruleId: input.ruleId,
      entityType: input.entityType,
      entityId: input.entityId,
      amount: input.amount,
      currency: input.currency,
      status: 'submitted',
      submittedByUserId: input.submittedByUserId,
      currentStepOrder: input.currentStepOrder ?? null,
      totalSteps: input.totalSteps ?? null,
    })
    .returning();
  if (!row) throw new Error('Failed to insert approval request');
  return mapRequest(row);
}

export interface ApprovalRequestStepInsert {
  readonly stepOrder: number;
  readonly name: string | null;
  readonly approverStrategy: ApproverStrategy;
  readonly roleTemplateKey: string | null;
  readonly permissionKey: string | null;
  readonly userId: string | null;
}

export async function insertApprovalRequestSteps(
  db: DbExecutor,
  organizationId: string,
  requestId: string,
  steps: readonly ApprovalRequestStepInsert[],
): Promise<ApprovalRequestStepRecord[]> {
  if (steps.length === 0) return [];
  assertConsecutiveStepOrders(steps.map((step) => step.stepOrder));
  const rows = await db
    .insert(approvalRequestSteps)
    .values(
      steps.map((step) => ({
        organizationId,
        requestId,
        stepOrder: step.stepOrder,
        name: step.name,
        approverStrategy: step.approverStrategy,
        roleTemplateKey: step.roleTemplateKey,
        permissionKey: step.permissionKey,
        userId: step.userId,
        status: 'pending' as const,
      })),
    )
    .returning();
  return rows.map(mapRequestStep);
}

export async function updateApprovalRequestDecision(
  db: DbExecutor,
  organizationId: string,
  requestId: string,
  patch: {
    readonly status: 'approved' | 'rejected' | 'cancelled';
    readonly decidedByUserId: string | null;
    readonly decidedAt: Date;
    readonly decisionNote: string | null;
  },
): Promise<ApprovalRequestRecord | null> {
  const [row] = await db
    .update(approvalRequests)
    .set({
      status: patch.status,
      decidedByUserId: patch.decidedByUserId,
      decidedAt: patch.decidedAt,
      decisionNote: patch.decisionNote,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(approvalRequests.id, requestId),
        eq(approvalRequests.organizationId, organizationId),
        inArray(approvalRequests.status, ['submitted']),
      ),
    )
    .returning();
  return row ? mapRequest(row) : null;
}

export async function advanceApprovalRequestStep(
  db: DbExecutor,
  organizationId: string,
  requestId: string,
  nextStepOrder: number,
): Promise<ApprovalRequestRecord | null> {
  const [row] = await db
    .update(approvalRequests)
    .set({
      currentStepOrder: nextStepOrder,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(approvalRequests.id, requestId),
        eq(approvalRequests.organizationId, organizationId),
        eq(approvalRequests.status, 'submitted'),
      ),
    )
    .returning();
  return row ? mapRequest(row) : null;
}

export async function decideRequestStep(
  db: DbExecutor,
  organizationId: string,
  requestId: string,
  stepOrder: number,
  patch: {
    readonly status: 'approved' | 'rejected';
    readonly decidedByUserId: string | null;
    readonly decidedAt: Date;
    readonly decisionNote: string | null;
  },
): Promise<ApprovalRequestStepRecord | null> {
  const [row] = await db
    .update(approvalRequestSteps)
    .set({
      status: patch.status,
      decidedByUserId: patch.decidedByUserId,
      decidedAt: patch.decidedAt,
      decisionNote: patch.decisionNote,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(approvalRequestSteps.organizationId, organizationId),
        eq(approvalRequestSteps.requestId, requestId),
        eq(approvalRequestSteps.stepOrder, stepOrder),
        eq(approvalRequestSteps.status, 'pending'),
      ),
    )
    .returning();
  return row ? mapRequestStep(row) : null;
}
