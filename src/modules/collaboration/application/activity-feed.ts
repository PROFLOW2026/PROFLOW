import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { EXTERNAL_CAPABILITIES, externalGrantCovers, type ExternalContext } from '@/shared/external';
import { PROJECT_CAPABILITIES, assertProjectCapability, loadProjectCapabilities } from '@/modules/project-team';
import {
  clampActivityLimit,
  decodeActivityCursor,
  encodeActivityCursor,
  toActivityItem,
  type ActivityEventRecord,
  type ActivityItem,
} from '../domain/activity';
import {
  listContractorActivity,
  listProjectDomainEvents,
  type ActivityQueryFilters,
} from '../data/activity.repository';
import { loadPrincipalNames, loadProfileNames } from '../data/collaboration.repository';

export type { ActivityQueryFilters };

export interface ActivityFeedPage {
  readonly items: readonly ActivityItem[];
  /** Actor display names keyed by profiles.id / external_principals.id (viewer-safe). */
  readonly actorNames: Readonly<Record<string, string>>;
  readonly nextCursor: string | null;
}

export interface LoadActivityInput {
  readonly projectId: string;
  readonly filters?: ActivityQueryFilters;
  readonly cursor?: string | null;
  readonly limit?: number | null;
  /** Locale catalog probe: true when `collaboration.<key>` has a dedicated sentence. */
  readonly hasMessage?: (key: string) => boolean;
}

function page(
  records: readonly ActivityEventRecord[],
  limit: number,
  build: (record: ActivityEventRecord) => ActivityItem,
): { items: ActivityItem[]; nextCursor: string | null } {
  const hasMore = records.length > limit;
  const slice = hasMore ? records.slice(0, limit) : records;
  const last = slice[slice.length - 1];
  return {
    items: slice.map(build),
    nextCursor: hasMore && last ? encodeActivityCursor({ occurredAt: last.occurredAt, id: last.id }) : null,
  };
}

/** Internal project activity (project.view). Financial events are redacted for operational viewers. */
export async function loadProjectActivity(context: OrgContext, input: LoadActivityInput): Promise<ActivityFeedPage> {
  await assertProjectCapability(context, input.projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
  const held = await loadProjectCapabilities(context, input.projectId);
  const limit = clampActivityLimit(input.limit);
  const records = await listProjectDomainEvents(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    filters: input.filters ?? {},
    cursor: decodeActivityCursor(input.cursor),
    limit: limit + 1,
  });
  const hasMessage = input.hasMessage ?? (() => false);
  const result = page(records, limit, (record) => toActivityItem(record, held, hasMessage));
  const visible = result.items.filter((item) => !item.redacted);
  const userIds = visible.flatMap((item) => (item.actor.type === 'internal' && item.actor.id ? [item.actor.id] : []));
  const principalIds = visible.flatMap((item) => (item.actor.type === 'external' && item.actor.id ? [item.actor.id] : []));
  const [profiles, principals] = await Promise.all([
    loadProfileNames(context.db, userIds),
    loadPrincipalNames(context.db, principalIds),
  ]);
  return {
    items: result.items,
    actorNames: Object.fromEntries([...profiles, ...principals]),
    nextCursor: result.nextCursor,
  };
}

/** Contractor activity: own-vendor task history + contractor-audience posts on the project. */
export async function loadContractorActivity(
  context: ExternalContext,
  input: Omit<LoadActivityInput, 'filters'> & { readonly organizationId: string },
): Promise<ActivityFeedPage> {
  const grants = context.grants.filter((grant) =>
    externalGrantCovers(
      grant,
      { organizationId: input.organizationId, projectId: input.projectId, vendorId: grant.vendorId, subcontractAgreementId: grant.subcontractAgreementId },
      EXTERNAL_CAPABILITIES.PROJECT_VIEW,
    ),
  );
  if (grants.length === 0) throw new NotFoundError('Project');
  const limit = clampActivityLimit(input.limit);
  const records = await listContractorActivity(context.db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    vendorIds: [...new Set(grants.map((grant) => grant.vendorId))],
    cursor: decodeActivityCursor(input.cursor),
    limit: limit + 1,
  });
  const hasMessage = input.hasMessage ?? (() => false);
  const empty = new Set<string>();
  const result = page(records, limit, (record) => {
    const item = toActivityItem(record, empty, hasMessage);
    return {
      ...item,
      href: record.entityType === 'task' ? `/contractor/projects/${input.projectId}/tasks/${record.entityId}` : null,
    };
  });
  const names: Record<string, string> = {};
  if (context.displayName) names[context.principalId] = context.displayName;
  return { items: result.items, actorNames: names, nextCursor: result.nextCursor };
}
