'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/shared/i18n/navigation';
import { useId, useState, useTransition } from 'react';
import { MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  PROJECT_GOAL_PROGRESS_MAX,
  PROJECT_GOAL_PROGRESS_MIN,
  PROJECT_GOAL_STATUSES,
  type ProjectGoalStatus,
} from '../domain/constants';
import { createProjectGoalAction, updateProjectGoalStatusAction } from './actions';

export interface ProjectGoalListItem {
  readonly id: string;
  readonly title: string;
  readonly dueOn: string | null;
  readonly status: ProjectGoalStatus;
  readonly progressPercent: number;
}

function selectClassName(): string {
  return 'flex h-10 w-full rounded-md border border-[var(--pf-border)] bg-[var(--pf-bg)] px-3 py-2 text-sm';
}

export function ProjectGoalsPanel({
  projectId,
  initialRows,
  canUpdate,
}: {
  projectId: string;
  initialRows: readonly ProjectGoalListItem[];
  canUpdate: boolean;
}) {
  const t = useTranslations('projectGoals');
  const router = useRouter();
  const formId = useId();
  const [rows, setRows] = useState(initialRows);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    router.refresh();
  }

  function submitCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUpdate) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get('title') ?? '').trim();
    const dueOn = String(data.get('dueOn') ?? '').trim();
    const status = String(data.get('status') ?? 'not_started') as ProjectGoalStatus;
    const progressPercent = Number(data.get('progressPercent'));

    setError(null);
    startTransition(async () => {
      const result = await createProjectGoalAction({
        projectId,
        title,
        dueOn: dueOn || null,
        status,
        progressPercent,
      });
      if (!result.ok) {
        setError(t(`errors.${result.message}` as 'errors.not_allowed'));
        return;
      }
      form.reset();
      refresh();
    });
  }

  function onStatusChange(goalId: string, status: ProjectGoalStatus) {
    if (!canUpdate) return;
    setRows((current) => current.map((row) => (row.id === goalId ? { ...row, status } : row)));
    startTransition(async () => {
      const result = await updateProjectGoalStatusAction({ projectId, goalId, status });
      if (!result.ok) {
        setError(t(`errors.${result.message}` as 'errors.not_allowed'));
        setRows(initialRows);
        return;
      }
      refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {canUpdate ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('form.title')}</CardTitle>
            <CardDescription>{t('form.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form id={formId} onSubmit={submitCreate} className="flex flex-col gap-4">
              <MainAppFormGrid>
                <div className={mainAppFieldSpan.full}>
                  <label className="mb-1 block text-sm font-medium" htmlFor={`${formId}-title`}>
                    {t('fields.title')}
                  </label>
                  <Input id={`${formId}-title`} name="title" required maxLength={500} />
                </div>
                <div className={mainAppFieldSpan.lg}>
                  <label className="mb-1 block text-sm font-medium" htmlFor={`${formId}-dueOn`}>
                    {t('fields.dueOn')}
                  </label>
                  <Input id={`${formId}-dueOn`} name="dueOn" type="date" />
                </div>
                <div className={mainAppFieldSpan.lg}>
                  <label className="mb-1 block text-sm font-medium" htmlFor={`${formId}-progress`}>
                    {t('fields.progressPercent')}
                  </label>
                  <Input
                    id={`${formId}-progress`}
                    name="progressPercent"
                    type="number"
                    min={PROJECT_GOAL_PROGRESS_MIN}
                    max={PROJECT_GOAL_PROGRESS_MAX}
                    defaultValue={0}
                    required
                  />
                </div>
                <div className={mainAppFieldSpan.lg}>
                  <label className="mb-1 block text-sm font-medium" htmlFor={`${formId}-status`}>
                    {t('fields.status')}
                  </label>
                  <select id={`${formId}-status`} name="status" className={selectClassName()} defaultValue="not_started">
                    {PROJECT_GOAL_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {t(`status.${status}`)}
                      </option>
                    ))}
                  </select>
                </div>
              </MainAppFormGrid>
              {error ? <p className="text-sm text-[var(--pf-danger)]">{error}</p> : null}
              <div>
                <Button type="submit" variant="primary" disabled={pending}>
                  {t('form.submit')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('list.title')}</CardTitle>
          <CardDescription>{t('list.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('list.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {rows.map((row) => (
                <li key={row.id} className="rounded-lg border border-[var(--pf-border)] p-4">
                  <p className="font-medium text-[var(--pf-text-primary)]">{row.title}</p>
                  <dl className="mt-2 grid gap-1 text-sm text-[var(--pf-text-secondary)] sm:grid-cols-2">
                    {row.dueOn ? (
                      <div>
                        <dt className="inline">{t('fields.dueOn')}: </dt>
                        <dd className="inline">{row.dueOn}</dd>
                      </div>
                    ) : null}
                    <div>
                      <dt className="inline">{t('fields.progressPercent')}: </dt>
                      <dd className="inline">{row.progressPercent}%</dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{t('fields.status')}</span>
                    {canUpdate ? (
                      <select
                        className={selectClassName()}
                        style={{ maxWidth: '12rem' }}
                        value={row.status}
                        disabled={pending}
                        aria-label={t('fields.status')}
                        onChange={(event) => onStatusChange(row.id, event.target.value as ProjectGoalStatus)}
                      >
                        {PROJECT_GOAL_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {t(`status.${status}`)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-sm">{t(`status.${row.status}`)}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
