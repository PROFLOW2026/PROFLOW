import { notFound } from 'next/navigation';
import { getMessages, getTranslations } from 'next-intl/server';
import { requireExternalContext } from '@/modules/contractor-access';
import { withOrgContext } from '@/shared/auth/session';
import { AuthorizationError } from '@/shared/errors';
import { GENERIC_EVENT_KEY, REDACTED_EVENT_KEY } from '../domain/activity';
import { loadContractorActivity, loadProjectActivity } from '../index';
import { ActivityFeedPanel } from './activity-feed-panel';

export interface ActivityFeedProps {
  readonly organizationId: string;
  readonly projectId: string;
  readonly viewer: 'internal' | 'external';
  readonly vendorId?: string | null;
  readonly entityType?: string | null;
  readonly entityId?: string | null;
  readonly limit?: number | null;
  /** First segment of event type, e.g. task / coordination / subcontract. */
  readonly domain?: string | null;
  /** Project root for internal deep links. Defaults to the Owner app (`/projects/{id}`). */
  readonly surfaceRoot?: string;
}

function rewriteProjectHref(href: string | null, projectId: string, surfaceRoot?: string): string | null {
  if (!href || !surfaceRoot) return href;
  const owner = `/projects/${projectId}`;
  if (href === owner || href.startsWith(`${owner}/`)) return surfaceRoot + href.slice(owner.length);
  return href;
}

function buildHasMessage(messages: Record<string, unknown>): (key: string) => boolean {
  return (key: string) => {
    if (key === GENERIC_EVENT_KEY || key === REDACTED_EVENT_KEY) return true;
    const parts = key.split('.');
    let node: unknown = messages;
    for (const part of parts) {
      if (!node || typeof node !== 'object') return false;
      node = (node as Record<string, unknown>)[part];
    }
    return typeof node === 'string';
  };
}

export async function ActivityFeed(props: ActivityFeedProps) {
  const t = await getTranslations('collaboration');
  const messages = (await getMessages()) as Record<string, unknown>;
  const collab = (messages.collaboration ?? {}) as Record<string, unknown>;
  const hasMessage = buildHasMessage(collab);

  const filters = {
    vendorId: props.vendorId ?? undefined,
    entityType: props.entityType ?? undefined,
    entityId: props.entityId ?? undefined,
    domain: props.domain ?? undefined,
  };

  if (props.viewer === 'external') {
    const context = await requireExternalContext();
    let page;
    try {
      page = await loadContractorActivity(context, {
        organizationId: props.organizationId,
        projectId: props.projectId,
        limit: props.limit,
        hasMessage,
      });
    } catch {
      notFound();
    }
    return (
      <ActivityFeedPanel
        page={page}
        title={t('activity.title')}
        empty={t('activity.empty')}
        financialRedacted={t('activity.events.financialRedacted')}
      />
    );
  }

  const page = await withOrgContext(async (context) => {
    if (context.organizationId !== props.organizationId) return null;
    try {
      return await loadProjectActivity(context, {
        projectId: props.projectId,
        filters,
        limit: props.limit,
        hasMessage,
      });
    } catch (error) {
      if (error instanceof AuthorizationError) return null;
      throw error;
    }
  });
  if (!page) notFound();

  const displayPage = props.surfaceRoot
    ? {
        ...page,
        items: page.items.map((item) => ({
          ...item,
          href: rewriteProjectHref(item.href, props.projectId, props.surfaceRoot),
        })),
      }
    : page;

  return (
    <ActivityFeedPanel
      page={displayPage}
      title={t('activity.title')}
      empty={t('activity.empty')}
      financialRedacted={t('activity.events.financialRedacted')}
    />
  );
}
