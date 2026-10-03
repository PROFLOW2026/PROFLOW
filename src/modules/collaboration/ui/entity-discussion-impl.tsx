import { notFound } from 'next/navigation';
import { requireExternalContext } from '@/modules/contractor-access';
import { withOrgContext } from '@/shared/auth/session';
import { AuthorizationError } from '@/shared/errors';
import { loadExternalDiscussion, loadInternalDiscussion } from '../index';
import { EntityDiscussionPanel, entityDiscussionLabels } from './entity-discussion-panel';

export interface EntityDiscussionProps {
  readonly organizationId: string;
  readonly projectId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly viewer: 'internal' | 'external';
  readonly allowInternalNotes?: boolean;
}

export async function EntityDiscussion(props: EntityDiscussionProps) {
  const labels = await entityDiscussionLabels();
  const hidden = {
    organizationId: props.organizationId,
    projectId: props.projectId,
    entityType: props.entityType,
    entityId: props.entityId,
  };

  if (props.viewer === 'external') {
    const context = await requireExternalContext();
    try {
      const thread = await loadExternalDiscussion(context, {
        organizationId: props.organizationId,
        entityType: props.entityType,
        entityId: props.entityId,
      });
      return <EntityDiscussionPanel thread={thread} hidden={hidden} viewer="external" labels={labels} />;
    } catch {
      notFound();
    }
  }

  const thread = await withOrgContext(async (context) => {
    try {
      return await loadInternalDiscussion(context, {
        organizationId: props.organizationId,
        entityType: props.entityType,
        entityId: props.entityId,
      });
    } catch (error) {
      if (error instanceof AuthorizationError) return null;
      throw error;
    }
  });
  if (!thread) notFound();

  return (
    <EntityDiscussionPanel
      thread={thread}
      hidden={hidden}
      viewer="internal"
      allowInternalNotes={props.allowInternalNotes ?? true}
      labels={labels}
    />
  );
}
