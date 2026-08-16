import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { approvalRequests, approvalRules } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type {
  ApprovalEntityType,
  ApprovalRequestRecord,
  ApprovalRuleRecord,
  ApprovalStatus,
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
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.organizationId, organizationId),
        eq(approvalRequests.status, 'submitted'),
      ),
    )
    .orderBy(desc(approvalRequests.createdAt))
    .limit(options.limit ?? 50);

  return rows.map((row) => {
    const mapped = mapRequest(row);
    return {
      id: mapped.id,
      entityType: mapped.entityType,
      entityId: mapped.entityId,
      amount: mapped.amount,
      currency: mapped.currency,
      status: 'submitted' as const,
      ruleId: mapped.ruleId,
      submittedByUserId: mapped.submittedByUserId,
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
    })
    .returning();
  if (!row) throw new Error('Failed to insert approval request');
  return mapRequest(row);
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
