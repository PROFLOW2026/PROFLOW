'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState, useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { MilestoneRecord } from '@/modules/projects';
import {
  archiveMilestoneAction,
  createMilestoneAction,
  type MilestoneFormState,
} from '../actions';

interface MilestonesPanelProps {
  projectId: string;
  milestones: readonly MilestoneRecord[];
  canEdit: boolean;
}

export function MilestonesPanel({ projectId, milestones, canEdit }: MilestonesPanelProps) {
  const t = useTranslations('projects.details');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<MilestoneFormState, FormData>(
    createMilestoneAction,
    {},
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-[var(--pf-text-secondary)]">{t('milestonesTitle')}</h3>

      {milestones.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('emptyMilestones')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {milestones.map((milestone) => (
            <li
              key={milestone.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--pf-border-default)] px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium">{milestone.name}</div>
                <div className="text-[var(--pf-text-secondary)]">
                  {milestone.targetDate ? milestone.targetDate : '—'} ·{' '}
                  {t(`milestoneStatuses.${milestone.status}`)}
                </div>
              </div>
              {canEdit ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  loading={isPending}
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      const result = await archiveMilestoneAction(milestone.id, projectId);
                      if (result.error) setError(result.error);
                    });
                  }}
                >
                  {tCommon('actions.archive')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {error || state.error ? <Alert tone="danger">{error ?? state.error}</Alert> : null}

      {canEdit ? (
        <form action={formAction} className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <input type="hidden" name="projectId" value={projectId} />
          <Field label={t('milestoneName')}>
            {(control) => <Input {...control} name="name" required />}
          </Field>
          <Field label={t('milestoneTarget')} optionalLabel={tCommon('labels.optional')}>
            {(control) => <Input {...control} name="targetDate" type="date" />}
          </Field>
          <div className="flex items-end">
            <Button type="submit" loading={pending}>
              {t('addMilestone')}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
