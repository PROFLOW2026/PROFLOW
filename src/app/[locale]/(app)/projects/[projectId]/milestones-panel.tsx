'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState, useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { isMilestoneOverdue } from '@/modules/projects/domain/scheduling';
import type { MilestoneRecord, MilestoneStatus } from '@/modules/projects/domain/types';
import {
  archiveMilestoneAction,
  createMilestoneAction,
  updateMilestoneStatusAction,
  type MilestoneFormState,
} from '../actions';

interface MilestonesPanelProps {
  projectId: string;
  milestones: readonly MilestoneRecord[];
  canEdit: boolean;
  today: string;
}

function milestoneShape(status: MilestoneStatus): StatusShape {
  switch (status) {
    case 'achieved':
      return 'completed';
    case 'missed':
      return 'overdue';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'pending';
  }
}

export function MilestonesPanel({ projectId, milestones, canEdit, today }: MilestonesPanelProps) {
  const t = useTranslations('projects.details');
  const tSchedule = useTranslations('projects.schedule');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<MilestoneFormState, FormData>(
    createMilestoneAction,
    {},
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function runMilestoneAction(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-[var(--pf-text-secondary)]">{t('milestonesTitle')}</h3>

      {milestones.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('emptyMilestones')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {milestones.map((milestone) => {
            const overdue = isMilestoneOverdue(milestone, today);
            return (
              <li
                key={milestone.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--pf-border-default)] px-3 py-2 text-sm"
              >
                <div className="flex flex-col gap-1">
                  <div className="font-medium">{milestone.name}</div>
                  <div className="flex flex-wrap items-center gap-2 text-[var(--pf-text-secondary)]">
                    <span>{milestone.targetDate ? milestone.targetDate : '—'}</span>
                    <StatusBadge
                      shape={milestoneShape(milestone.status)}
                      label={t(`milestoneStatuses.${milestone.status}`)}
                    />
                    {overdue ? (
                      <span className="text-[var(--pf-status-danger-fg)]">{tSchedule('overdue')}</span>
                    ) : null}
                  </div>
                </div>
                {canEdit ? (
                  <div className="flex flex-wrap gap-2">
                    {milestone.status === 'planned' ? (
                      <>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          loading={isPending}
                          onClick={() =>
                            runMilestoneAction(() =>
                              updateMilestoneStatusAction(milestone.id, projectId, 'achieved'),
                            )
                          }
                        >
                          {t('markMilestoneAchieved')}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          loading={isPending}
                          onClick={() =>
                            runMilestoneAction(() =>
                              updateMilestoneStatusAction(milestone.id, projectId, 'missed'),
                            )
                          }
                        >
                          {t('markMilestoneMissed')}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          loading={isPending}
                          onClick={() =>
                            runMilestoneAction(() =>
                              updateMilestoneStatusAction(milestone.id, projectId, 'cancelled'),
                            )
                          }
                        >
                          {t('markMilestoneCancelled')}
                        </Button>
                      </>
                    ) : null}
                    {milestone.status !== 'planned' ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        loading={isPending}
                        onClick={() =>
                          runMilestoneAction(() =>
                            updateMilestoneStatusAction(milestone.id, projectId, 'planned'),
                          )
                        }
                      >
                        {t('reopenMilestone')}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      loading={isPending}
                      onClick={() =>
                        runMilestoneAction(() => archiveMilestoneAction(milestone.id, projectId))
                      }
                    >
                      {tCommon('actions.archive')}
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
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
