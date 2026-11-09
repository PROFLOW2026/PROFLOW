'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/shared/i18n/navigation';
import { useId, useState, useTransition } from 'react';
import { MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  PROJECT_RISK_SCALE_MAX,
  PROJECT_RISK_SCALE_MIN,
  PROJECT_RISK_STATUSES,
  type ProjectRiskStatus,
} from '../domain/constants';
import { createProjectRiskAction, updateProjectRiskStatusAction } from './actions';

export interface ProjectRiskListItem {
  readonly id: string;
  readonly description: string;
  readonly probability: number;
  readonly impact: number;
  readonly score: number;
  readonly treatment: string | null;
  readonly status: ProjectRiskStatus;
  readonly reviewOn: string | null;
}

function selectClassName(): string {
  return 'flex h-10 w-full rounded-md border border-[var(--pf-border)] bg-[var(--pf-bg)] px-3 py-2 text-sm';
}

export function ProjectRisksPanel({
  projectId,
  initialRows,
  canUpdate,
}: {
  projectId: string;
  initialRows: readonly ProjectRiskListItem[];
  canUpdate: boolean;
}) {
  const t = useTranslations('projectRisks');
  const router = useRouter();
  const formId = useId();
  const [rows, setRows] = useState(initialRows);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const scaleOptions = Array.from(
    { length: PROJECT_RISK_SCALE_MAX - PROJECT_RISK_SCALE_MIN + 1 },
    (_, index) => PROJECT_RISK_SCALE_MIN + index,
  );

  function refresh() {
    router.refresh();
  }

  function submitCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUpdate) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const description = String(data.get('description') ?? '').trim();
    const probability = Number(data.get('probability'));
    const impact = Number(data.get('impact'));
    const treatment = String(data.get('treatment') ?? '').trim();
    const status = String(data.get('status') ?? 'open') as ProjectRiskStatus;
    const reviewOn = String(data.get('reviewOn') ?? '').trim();

    setError(null);
    startTransition(async () => {
      const result = await createProjectRiskAction({
        projectId,
        description,
        probability,
        impact,
        treatment: treatment || null,
        status,
        reviewOn: reviewOn || null,
      });
      if (!result.ok) {
        setError(t(`errors.${result.message}` as 'errors.not_allowed'));
        return;
      }
      form.reset();
      refresh();
    });
  }

  function onStatusChange(riskId: string, status: ProjectRiskStatus) {
    if (!canUpdate) return;
    setRows((current) => current.map((row) => (row.id === riskId ? { ...row, status } : row)));
    startTransition(async () => {
      const result = await updateProjectRiskStatusAction({ projectId, riskId, status });
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
                  <label className="mb-1 block text-sm font-medium" htmlFor={`${formId}-description`}>
                    {t('fields.description')}
                  </label>
                  <Textarea id={`${formId}-description`} name="description" required rows={3} />
                </div>
                <div className={mainAppFieldSpan.lg}>
                  <label className="mb-1 block text-sm font-medium" htmlFor={`${formId}-probability`}>
                    {t('fields.probability')}
                  </label>
                  <select
                    id={`${formId}-probability`}
                    name="probability"
                    className={selectClassName()}
                    defaultValue="3"
                    required
                  >
                    {scaleOptions.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={mainAppFieldSpan.lg}>
                  <label className="mb-1 block text-sm font-medium" htmlFor={`${formId}-impact`}>
                    {t('fields.impact')}
                  </label>
                  <select id={`${formId}-impact`} name="impact" className={selectClassName()} defaultValue="3" required>
                    {scaleOptions.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={mainAppFieldSpan.full}>
                  <label className="mb-1 block text-sm font-medium" htmlFor={`${formId}-treatment`}>
                    {t('fields.treatment')}
                  </label>
                  <Textarea id={`${formId}-treatment`} name="treatment" rows={2} />
                </div>
                <div className={mainAppFieldSpan.lg}>
                  <label className="mb-1 block text-sm font-medium" htmlFor={`${formId}-status`}>
                    {t('fields.status')}
                  </label>
                  <select id={`${formId}-status`} name="status" className={selectClassName()} defaultValue="open">
                    {PROJECT_RISK_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {t(`status.${status}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={mainAppFieldSpan.lg}>
                  <label className="mb-1 block text-sm font-medium" htmlFor={`${formId}-reviewOn`}>
                    {t('fields.reviewOn')}
                  </label>
                  <Input id={`${formId}-reviewOn`} name="reviewOn" type="date" />
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
                <li
                  key={row.id}
                  className="rounded-lg border border-[var(--pf-border)] p-4"
                  data-risk-score={row.score}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium text-[var(--pf-text-primary)]">{row.description}</p>
                    <span className="text-sm text-[var(--pf-text-secondary)]">
                      {t('list.score', { score: row.score })}
                    </span>
                  </div>
                  <dl className="mt-2 grid gap-1 text-sm text-[var(--pf-text-secondary)] sm:grid-cols-2">
                    <div>
                      <dt className="inline">{t('fields.probability')}: </dt>
                      <dd className="inline">{row.probability}</dd>
                    </div>
                    <div>
                      <dt className="inline">{t('fields.impact')}: </dt>
                      <dd className="inline">{row.impact}</dd>
                    </div>
                    {row.treatment ? (
                      <div className="sm:col-span-2">
                        <dt className="inline">{t('fields.treatment')}: </dt>
                        <dd className="inline">{row.treatment}</dd>
                      </div>
                    ) : null}
                    {row.reviewOn ? (
                      <div>
                        <dt className="inline">{t('fields.reviewOn')}: </dt>
                        <dd className="inline">{row.reviewOn}</dd>
                      </div>
                    ) : null}
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
                        onChange={(event) => onStatusChange(row.id, event.target.value as ProjectRiskStatus)}
                      >
                        {PROJECT_RISK_STATUSES.map((status) => (
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
