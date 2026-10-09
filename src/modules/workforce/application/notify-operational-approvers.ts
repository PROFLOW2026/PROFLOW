/**
 * PT-05 — in-app notifications for project-scoped operational approvers.
 * Best-effort: submit/review flows must not fail when notification RPC errors.
 */

import { PROJECT_CAPABILITIES as C } from '@/modules/project-team/domain/capabilities';
import { listActiveProjectMemberUserIdsWithCapability } from '@/modules/project-team';
import { emitNotification } from '@/modules/notifications';
import { notificationCopy } from '@/modules/notifications/domain/copy';
import type { NotificationEventType } from '@/modules/notifications/domain/types';
import type { OrgContext } from '@/shared/auth/context';
import { notificationsCopyTranslator } from '@/shared/i18n/sync-namespace-translator';
import type { TimeEntryRecord } from '../domain/types';

async function notifyProjectOperationalApprovers(
  context: OrgContext,
  input: {
    readonly projectId: string;
    readonly type: NotificationEventType;
    readonly dedupeKey: string;
    readonly entityType: string;
    readonly entityId: string;
    readonly deepLink: string;
    readonly reference?: string | null;
    readonly extra?: string | null;
  },
): Promise<void> {
  const recipients = await listActiveProjectMemberUserIdsWithCapability(
    context.db,
    context.organizationId,
    input.projectId,
    C.OPERATIONAL_APPROVE,
  );
  if (recipients.length === 0) return;

  const t = notificationsCopyTranslator(context.locale);
  const copy = notificationCopy(t, input.type, {
    reference: input.reference ?? null,
    extra: input.extra ?? null,
  });

  for (const recipientUserId of recipients) {
    if (recipientUserId === context.userId) continue;
    try {
      await emitNotification(context, {
        recipientUserId,
        type: input.type,
        title: copy.title,
        body: copy.body,
        dedupeKey: `${input.dedupeKey}:${recipientUserId}`,
        entityType: input.entityType,
        entityId: input.entityId,
        deepLink: input.deepLink,
        severity: 'warning',
      });
    } catch {
      // Notification delivery is auxiliary to the workforce mutation.
    }
  }
}

export async function notifyOperationalApproversForAttendanceCorrection(
  context: OrgContext,
  input: {
    readonly requestId: string;
    readonly employeeId: string;
    readonly employeeName: string;
    readonly workDate: string;
    readonly projectIds: readonly string[];
  },
): Promise<void> {
  for (const projectId of input.projectIds) {
    await notifyProjectOperationalApprovers(context, {
      projectId,
      type: 'approval_waiting',
      dedupeKey: `attendance_correction_pending:${input.requestId}:${projectId}`,
      entityType: 'attendance_correction_request',
      entityId: input.requestId,
      deepLink: '/workforce/attendance',
      reference: input.employeeName,
      extra: input.workDate,
    });
  }
}

export async function notifyOperationalApproversForSubmittedProjectTime(
  context: OrgContext,
  entries: readonly Pick<TimeEntryRecord, 'id' | 'kind' | 'projectId' | 'workDate'>[],
): Promise<void> {
  const byProject = new Map<string, TimeEntryRecord['id'][]>();
  for (const entry of entries) {
    if (entry.kind !== 'project' || !entry.projectId) continue;
    const list = byProject.get(entry.projectId) ?? [];
    list.push(entry.id);
    byProject.set(entry.projectId, list);
  }

  for (const [projectId, entryIds] of byProject) {
    const anchorId = entryIds[0];
    if (!anchorId) continue;
    const workDate = entries.find((entry) => entry.id === anchorId)?.workDate ?? null;
    await notifyProjectOperationalApprovers(context, {
      projectId,
      type: 'timesheet_waiting',
      dedupeKey: `project_time_submitted:${anchorId}:${projectId}`,
      entityType: 'time_entry',
      entityId: anchorId,
      deepLink: '/workforce/time/approvals',
      extra: workDate,
    });
  }
}
