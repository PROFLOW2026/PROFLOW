import { getLocale, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { intlDateTimeFormat } from '@/shared/i18n/intl-locale';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';
import type { DiscussionThread } from '../application/discussions';
import { DiscussionComposerClient } from './discussion-composer-client';
import { postExternalDiscussionAction, postInternalDiscussionAction } from './actions';

export async function EntityDiscussionPanel({
  thread,
  hidden,
  viewer,
  allowInternalNotes = true,
  labels,
}: {
  readonly thread: DiscussionThread;
  readonly hidden: Readonly<Record<string, string>>;
  readonly viewer: 'internal' | 'external';
  readonly allowInternalNotes?: boolean;
  readonly labels: {
    readonly title: string;
    readonly empty: string;
    readonly audienceInternal: string;
    readonly audienceContractor: string;
    readonly kindComment: string;
    readonly kindDecision: string;
    readonly submit: string;
    readonly decisionBadge: string;
    readonly you: string;
  };
}) {
  const locale = await getLocale();
  const dt = intlDateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  const showComposer =
    thread.canPost &&
    (viewer === 'external' || (allowInternalNotes && (thread.contractorAudienceAllowed || true)));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {thread.posts.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{labels.empty}</p>
        ) : (
          <ol className="flex flex-col gap-4 border-s border-[var(--pf-border-default)] ps-4">
            {thread.posts.map((post) => (
              <li key={post.id} className="flex flex-col gap-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {post.author.isViewer ? labels.you : post.author.name ?? '—'}
                  </span>
                  {viewer === 'internal' && post.author.vendorName ? (
                    <span className="text-xs text-[var(--pf-text-secondary)]">({post.author.vendorName})</span>
                  ) : null}
                  {viewer === 'internal' && post.audience === 'internal' ? (
                    <Badge tone="neutral">{labels.audienceInternal}</Badge>
                  ) : null}
                  {post.kind === 'decision' ? <Badge tone="warning">{labels.decisionBadge}</Badge> : null}
                  <time dateTime={post.createdAt} className="text-xs text-[var(--pf-text-muted)]">
                    {dt.format(new Date(post.createdAt))}
                  </time>
                </div>
                <p className="whitespace-pre-wrap break-words">{post.body}</p>
              </li>
            ))}
          </ol>
        )}

        {showComposer ? (
          <WithAppClientMessages extra={['collaboration']}>
            <DiscussionComposerClient
              action={viewer === 'external' ? postExternalDiscussionAction : postInternalDiscussionAction}
              hidden={hidden}
              submitLabel={labels.submit}
              allowAudience={viewer === 'internal' && thread.contractorAudienceAllowed}
              allowDecision={viewer === 'internal' && thread.canRecordDecision}
              audienceLabels={{
                internal: labels.audienceInternal,
                contractor: labels.audienceContractor,
                kindComment: labels.kindComment,
                kindDecision: labels.kindDecision,
              }}
            />
          </WithAppClientMessages>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Server helper: loads i18n labels for EntityDiscussion. */
export async function entityDiscussionLabels() {
  const t = await getTranslations('collaboration');
  return {
    title: t('discussion.title'),
    empty: t('discussion.empty'),
    audienceInternal: t('discussion.audienceInternal'),
    audienceContractor: t('discussion.audienceContractor'),
    kindComment: t('discussion.kindComment'),
    kindDecision: t('discussion.kindDecision'),
    submit: t('discussion.submit'),
    decisionBadge: t('discussion.decisionBadge'),
    you: t('discussion.you'),
  };
}
