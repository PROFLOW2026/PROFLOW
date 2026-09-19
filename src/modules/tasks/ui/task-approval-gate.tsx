/**
 * Task Approval Gate component.
 *
 * Shows when `task.approvalRequired = true`.
 *
 * States:
 *   - No open request:  "Approval Required" banner + "Request Approval" button.
 *   - Pending (submitted): "Approval Pending" badge + approver info + decide form.
 *   - Approved:  green "Approved" badge + most-recent decision info.
 *   - Rejected:  red "Rejected" badge + decision note + resubmit option.
 *
 * Decision history:
 *   All past approval_requests for entity_type='task', entity_id are listed
 *   in chronological order below the current state.
 *
 * Permission gates:
 *   - tasks.update → can request approval
 *   - tasks.approve OR approvals.decide → can decide (approve / reject)
 */

// eslint-disable-next-line no-restricted-imports
import { desc, eq, and } from 'drizzle-orm';
import { BadgeCheck, Clock, XCircle, ShieldAlert } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
// eslint-disable-next-line no-restricted-imports
import { approvalRequests, profiles } from '@drizzle/schema';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { ApprovalRequestRecord } from '@/modules/approvals';
import { ApprovalGateClient } from './task-approval-gate-client';

// ─── Data Loading ─────────────────────────────────────────────────────────────

interface ApprovalGateData {
  openRequest: ApprovalRequestRecord | null;
  history: ApprovalHistoryItem[];
  canRequest: boolean;
  canDecide: boolean;
  submitterName: string | null;
}

interface ApprovalHistoryItem {
  id: string;
  status: 'submitted' | 'approved' | 'rejected' | 'cancelled';
  createdAt: Date;
  decidedAt: Date | null;
  decisionNote: string | null;
  submitterName: string | null;
  decidedByName: string | null;
}

async function loadApprovalGate(taskId: string): Promise<ApprovalGateData> {
  return withOrgContext(async (context) => {
    const canRequest = hasPermission(context, PERMISSIONS.TASKS_UPDATE);
    const canDecide =
      hasPermission(context, PERMISSIONS.TASKS_APPROVE) ||
      hasPermission(context, PERMISSIONS.APPROVALS_DECIDE);

    // Load all approval requests for this task (most recent first).
    const rows = await context.db
      .select()
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.organizationId, context.organizationId),
          eq(approvalRequests.entityType, 'task'),
          eq(approvalRequests.entityId, taskId),
        ),
      )
      .orderBy(desc(approvalRequests.createdAt))
      .limit(20);

    if (rows.length === 0) {
      return { openRequest: null, history: [], canRequest, canDecide, submitterName: null };
    }

    // Collect user IDs to resolve display names.
    const userIds = [...new Set(
      rows.flatMap((row) => [row.submittedByUserId, row.decidedByUserId].filter(Boolean) as string[]),
    )];

    let nameMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { inArray } = await import('drizzle-orm');
      const allProfileRows = await context.db
        .select({ id: profiles.id, displayName: profiles.displayName })
        .from(profiles)
        .where(inArray(profiles.id, userIds));
      nameMap = new Map(
        allProfileRows.filter((p) => p.displayName).map((p) => [p.id, p.displayName!]),
      );
    }

    // Map rows to typed records.
    const { isApprovalStatus } = await import('@/modules/approvals');

    const mapRow = (row: typeof approvalRequests.$inferSelect): ApprovalRequestRecord => ({
      id: row.id,
      organizationId: row.organizationId,
      ruleId: row.ruleId,
      entityType: 'task',
      entityId: row.entityId,
      amount: row.amount,
      currency: row.currency,
      status: isApprovalStatus(row.status) ? row.status : 'submitted',
      submittedByUserId: row.submittedByUserId,
      decidedByUserId: row.decidedByUserId,
      decidedAt: row.decidedAt,
      decisionNote: row.decisionNote,
      currentStepOrder: row.currentStepOrder ?? null,
      totalSteps: row.totalSteps ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });

    const latestRow = rows[0]!;
    const latestRecord = mapRow(latestRow);
    const openRequest = latestRecord.status === 'submitted' ? latestRecord : null;

    const history: ApprovalHistoryItem[] = rows.map((row) => ({
      id: row.id,
      status: (isApprovalStatus(row.status) ? row.status : 'submitted') as ApprovalHistoryItem['status'],
      createdAt: row.createdAt,
      decidedAt: row.decidedAt,
      decisionNote: row.decisionNote,
      submitterName: row.submittedByUserId ? (nameMap.get(row.submittedByUserId) ?? null) : null,
      decidedByName: row.decidedByUserId ? (nameMap.get(row.decidedByUserId) ?? null) : null,
    }));

    const submitterName = latestRow.submittedByUserId
      ? (nameMap.get(latestRow.submittedByUserId) ?? null)
      : null;

    return { openRequest, history, canRequest, canDecide, submitterName };
  });
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function ApprovalStatusBadge({ status }: { status: ApprovalHistoryItem['status'] }) {
  switch (status) {
    case 'submitted':
      return (
        <Badge tone="warning" className="gap-1">
          <Clock className="size-3" aria-hidden />
          Pending
        </Badge>
      );
    case 'approved':
      return (
        <Badge tone="success" className="gap-1">
          <BadgeCheck className="size-3" aria-hidden />
          Approved
        </Badge>
      );
    case 'rejected':
      return (
        <Badge tone="danger" className="gap-1">
          <XCircle className="size-3" aria-hidden />
          Rejected
        </Badge>
      );
    case 'cancelled':
      return (
        <Badge tone="neutral">
          Cancelled
        </Badge>
      );
  }
}

// ─── Decision History ─────────────────────────────────────────────────────────

function ApprovalHistoryList({
  history,
  t,
}: {
  history: ApprovalHistoryItem[];
  t: Awaited<ReturnType<typeof getTranslations<'tasks'>>>;
}) {
  if (history.length === 0) return null;

  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs font-medium text-[var(--pf-text-muted)] hover:text-[var(--pf-text-secondary)]">
        {t('approval.historyLabel', { count: history.length })}
      </summary>
      <ul className="mt-2 flex flex-col gap-2 border-s border-[var(--pf-border-subtle)] ps-3">
        {history.map((item) => (
          <li key={item.id} className="flex flex-col gap-0.5 text-xs text-[var(--pf-text-secondary)]">
            <div className="flex flex-wrap items-center gap-1.5">
              <ApprovalStatusBadge status={item.status} />
              <time dateTime={item.createdAt.toISOString()} className="text-[var(--pf-text-muted)]">
                {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(item.createdAt)}
              </time>
            </div>
            {item.submitterName ? (
              <span>
                {t('approval.requestedBy')}: <strong>{item.submitterName}</strong>
              </span>
            ) : null}
            {item.decidedByName && item.decidedAt ? (
              <span>
                {t('approval.decidedBy')}: <strong>{item.decidedByName}</strong>
                {' · '}
                {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(item.decidedAt)}
              </span>
            ) : null}
            {item.decisionNote ? (
              <blockquote className="mt-0.5 border-s-2 border-[var(--pf-border-subtle)] ps-2 italic text-[var(--pf-text-muted)]">
                {item.decisionNote}
              </blockquote>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

// ─── Main Server Component ─────────────────────────────────────────────────────

interface TaskApprovalGateProps {
  taskId: string;
  /** Must be true — caller should skip rendering this component otherwise. */
  approvalRequired: boolean;
}

export async function TaskApprovalGate({ taskId, approvalRequired }: TaskApprovalGateProps) {
  if (!approvalRequired) return null;

  const [data, t] = await Promise.all([
    loadApprovalGate(taskId),
    getTranslations('tasks'),
  ]);

  const { openRequest, history, canRequest, canDecide, submitterName } = data;

  return (
    <section
      aria-label={t('approval.sectionLabel')}
      className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4"
    >
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-[var(--pf-text-secondary)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{t('approval.sectionLabel')}</h3>

          {/* No open request → prompt to request */}
          {!openRequest && history.length === 0 ? (
            <div className="mt-2 flex flex-col gap-3">
              <p className="text-sm text-[var(--pf-text-secondary)]">
                {t('approval.noPendingRequest')}
              </p>
              {canRequest ? (
                <ApprovalGateClient
                  taskId={taskId}
                  mode="request"
                  requestLabel={t('approval.requestButton')}
                />
              ) : null}
            </div>
          ) : null}

          {/* No open request but has history → show latest state + re-request option */}
          {!openRequest && history.length > 0 ? (
            <div className="mt-2 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <ApprovalStatusBadge status={history[0]!.status} />
                {history[0]!.decidedByName ? (
                  <span className="text-sm text-[var(--pf-text-secondary)]">
                    {t('approval.decidedBy')}: <strong>{history[0]!.decidedByName}</strong>
                  </span>
                ) : null}
              </div>

              {/* Re-request after rejection / cancellation */}
              {canRequest && (history[0]!.status === 'rejected' || history[0]!.status === 'cancelled') ? (
                <ApprovalGateClient
                  taskId={taskId}
                  mode="request"
                  requestLabel={t('approval.reRequestButton')}
                />
              ) : null}
            </div>
          ) : null}

          {/* Open request → show pending state + decide form */}
          {openRequest ? (
            <div className="mt-2 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <ApprovalStatusBadge status="submitted" />
                {submitterName ? (
                  <span className="text-sm text-[var(--pf-text-secondary)]">
                    {t('approval.requestedBy')}: <strong>{submitterName}</strong>
                  </span>
                ) : null}
                {openRequest.currentStepOrder && openRequest.totalSteps ? (
                  <span className="text-xs text-[var(--pf-text-muted)]">
                    ({t('approval.step', {
                      current: openRequest.currentStepOrder,
                      total: openRequest.totalSteps,
                    })})
                  </span>
                ) : null}
              </div>

              {canDecide ? (
                <ApprovalGateClient
                  taskId={taskId}
                  requestId={openRequest.id}
                  mode="decide"
                  approveLabel={t('approval.approveButton')}
                  rejectLabel={t('approval.rejectButton')}
                  decisionNotePlaceholder={t('approval.decisionNotePlaceholder')}
                />
              ) : (
                <p className="text-sm text-[var(--pf-text-muted)]">{t('approval.awaitingDecision')}</p>
              )}
            </div>
          ) : null}

          <ApprovalHistoryList history={history} t={t} />
        </div>
      </div>
    </section>
  );
}

export function TaskApprovalGateSkeleton() {
  return (
    <div className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="mt-0.5 size-5 shrink-0 rounded" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-9 w-36" />
        </div>
      </div>
    </div>
  );
}
