'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { dismissCoordinationIssueAction } from '../actions/internal-actions';
import { FormError } from './form-controls';
import { FollowUpTaskForm } from './readiness-matrix';
import type { IssueRowView } from './types';

export function CoordinationIssueList({
  projectId,
  eventId,
  issues,
  canManage,
}: {
  projectId: string;
  eventId: string;
  issues: readonly IssueRowView[];
  canManage: boolean;
}) {
  const t = useTranslations('coordination');
  const [taskFor, setTaskFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (issues.length === 0) return <p className="text-sm text-[var(--pf-text-secondary)]">{t('detail.noIssues')}</p>;

  return (
    <div className="flex flex-col gap-2">
      <FormError message={error} />
      <ul className="flex flex-col gap-2">
        {issues.map((issue) => (
          <li key={issue.id} className="flex flex-col gap-2 rounded-lg border border-[var(--pf-border-default)] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{issue.title}</span>
              <Badge tone={issue.status === 'open' ? 'warning' : issue.status === 'task_created' ? 'success' : 'neutral'}>
                {t(`issue.statuses.${issue.status}`)}
              </Badge>
            </div>
            {issue.description ? <p className="text-sm">{issue.description}</p> : null}
            <span className="text-xs text-[var(--pf-text-muted)]">
              {issue.partyName} ·{' '}
              {t('issue.raisedBy', {
                by:
                  issue.raisedBy.type === 'external'
                    ? t('detail.byContractor')
                    : t('history.by', { name: issue.raisedBy.name ?? '' }),
              })}{' '}
              · {issue.createdAt}
            </span>
            {canManage && issue.status === 'open' ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => setTaskFor(issue.id)}>
                  {t('actions.createTask')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  loading={pending && taskFor === null}
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      const result = await dismissCoordinationIssueAction({ projectId, eventId, issueId: issue.id });
                      if (!result.ok) setError(result.error);
                    });
                  }}
                >
                  {t('actions.dismissIssue')}
                </Button>
              </div>
            ) : null}
            {taskFor === issue.id ? (
              <FollowUpTaskForm
                projectId={projectId}
                eventId={eventId}
                participantId={issue.participantId}
                issueId={issue.id}
                defaultTitle={issue.title}
                onDone={() => setTaskFor(null)}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
