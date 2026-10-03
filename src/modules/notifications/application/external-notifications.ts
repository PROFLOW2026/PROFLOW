import { z } from 'zod';
import type { ExternalContext } from '@/shared/external';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { createNotificationsCopyTranslator } from '@/shared/i18n/namespace-translator';
import { renderDgNotificationCopy } from '../domain/dg-copy';
import { externalNotificationVisible } from '../domain/external-visibility';
import { isNotificationSeverity, type NotificationSeverity } from '../domain/types';
import {
  EXTERNAL_NOTIFICATION_LIST_CAP,
  findExternalNotificationRow,
  listExternalNotificationRows,
  listUnreadExternalNotificationScopeRows,
  markExternalNotificationRowRead,
  markExternalNotificationRowsRead,
  type ExternalNotificationRow,
} from '../data/external-notifications.repository';

/**
 * Contractor-portal notification center (consumed by track R). Every call runs on the principal's
 * RLS-bound executor; rows are additionally re-checked against the principal's CURRENT grants.
 */

export interface ExternalNotificationListItem {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string | null;
  readonly eventType: string;
  readonly title: string;
  readonly body: string;
  readonly severity: NotificationSeverity;
  /** Locale-stripped portal path (`/contractor/...`). */
  readonly deepLink: string | null;
  readonly occurrences: number;
  readonly readAt: Date | null;
  readonly lastOccurredAt: Date;
  readonly createdAt: Date;
}

const listSchema = z.object({
  limit: z.number().int().min(1).max(EXTERNAL_NOTIFICATION_LIST_CAP).optional(),
  projectId: z.string().uuid().optional(),
  unreadOnly: z.boolean().optional(),
});
export type ListExternalNotificationsInput = z.infer<typeof listSchema>;

const idSchema = z.string().uuid();

function grantOrganizationIds(context: ExternalContext): string[] {
  return [...new Set(context.grants.map((grant) => grant.organizationId))];
}

function visible(context: ExternalContext, row: Pick<
  ExternalNotificationRow,
  'organizationId' | 'vendorId' | 'projectId' | 'subcontractAgreementId' | 'requiredCapabilities'
>): boolean {
  return externalNotificationVisible(context.grants, {
    organizationId: row.organizationId,
    vendorId: row.vendorId,
    projectId: row.projectId,
    subcontractAgreementId: row.subcontractAgreementId,
    requiredCapabilities: row.requiredCapabilities ?? [],
  });
}

function stringParams(params: Record<string, unknown> | null | undefined) {
  const read = (key: string) => (typeof params?.[key] === 'string' ? (params[key] as string) : null);
  return { project: read('project'), contractor: read('contractor'), reference: read('reference') };
}

export async function listExternalNotifications(
  context: ExternalContext,
  raw: ListExternalNotificationsInput = {},
): Promise<ExternalNotificationListItem[]> {
  const parsed = listSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  const limit = parsed.data.limit ?? EXTERNAL_NOTIFICATION_LIST_CAP;
  const rows = await listExternalNotificationRows(
    context.db,
    context.principalId,
    grantOrganizationIds(context),
    EXTERNAL_NOTIFICATION_LIST_CAP,
  );
  const t = await createNotificationsCopyTranslator(context.locale);
  const items: ExternalNotificationListItem[] = [];
  for (const row of rows) {
    if (!visible(context, row)) continue;
    if (parsed.data.projectId && row.projectId !== parsed.data.projectId) continue;
    if (parsed.data.unreadOnly && row.readAt) continue;
    const copy = renderDgNotificationCopy(t, {
      copyKey: row.copyKey,
      params: stringParams(row.params),
      occurrences: row.occurrences,
    });
    items.push({
      id: row.id,
      organizationId: row.organizationId,
      projectId: row.projectId,
      eventType: row.eventType,
      title: copy.title,
      body: copy.body,
      severity: isNotificationSeverity(row.severity) ? row.severity : 'info',
      deepLink: row.deepLink,
      occurrences: row.occurrences,
      readAt: row.readAt,
      lastOccurredAt: row.lastOccurredAt,
      createdAt: row.createdAt,
    });
    if (items.length >= limit) break;
  }
  return items;
}

export async function unreadExternalCount(context: ExternalContext): Promise<number> {
  const rows = await listUnreadExternalNotificationScopeRows(
    context.db,
    context.principalId,
    grantOrganizationIds(context),
  );
  return rows.filter((row) => visible(context, row)).length;
}

/** No existence oracle: missing, foreign and no-longer-covered rows all map to NotFound. */
export async function markExternalNotificationRead(context: ExternalContext, notificationId: string): Promise<void> {
  const id = idSchema.safeParse(notificationId);
  if (!id.success) throw new NotFoundError('notification');
  const row = await findExternalNotificationRow(context.db, context.principalId, id.data);
  if (!row || !visible(context, row)) throw new NotFoundError('notification');
  if (row.readAt) return;
  await markExternalNotificationRowRead(context.db, context.principalId, row.id);
}

export async function markAllExternalNotificationsRead(context: ExternalContext): Promise<number> {
  const rows = await listUnreadExternalNotificationScopeRows(
    context.db,
    context.principalId,
    grantOrganizationIds(context),
  );
  const ids = rows.filter((row) => visible(context, row)).map((row) => row.id);
  return markExternalNotificationRowsRead(context.db, context.principalId, ids);
}
