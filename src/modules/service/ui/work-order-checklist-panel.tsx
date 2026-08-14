'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { textNavLinkClassName } from '@/components/ui/pressable';
import {
  startOwnerSubmissionAction,
  type FormsActionState,
} from '@/modules/forms/ui/owner-forms-actions';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

export interface WorkOrderChecklistCardState {
  readonly required: boolean;
  readonly satisfied: boolean;
  readonly templateId: string | null;
  readonly templateName: string | null;
  readonly fillHref: string | null;
  readonly canSubmit: boolean;
  readonly submissionStatus: 'submitted' | 'draft' | 'void' | null;
}

export function WorkOrderChecklistCard({
  workOrderId,
  state,
}: {
  workOrderId: string;
  state: WorkOrderChecklistCardState;
}) {
  const t = useTranslations('service');
  const [actionState, action, pending] = useActionState(
    startOwnerSubmissionAction,
    {} as FormsActionState,
  );

  if (!state.required || !state.templateId) return null;

  const title = state.templateName ?? t('checklist.untitled');
  const statusLabel =
    state.submissionStatus === 'submitted'
      ? t('checklist.statusSubmitted')
      : state.submissionStatus === 'draft'
        ? t('checklist.statusDraft')
        : t('checklist.statusMissing');

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{t('checklist.title')}</h2>
          <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{title}</p>
        </div>
        <StatusBadge
          shape={state.satisfied ? 'completed' : 'pending'}
          label={statusLabel}
        />
      </div>

      {state.satisfied ? (
        <Alert tone="success">{t('checklist.submittedBody')}</Alert>
      ) : (
        <Alert tone="warning" title={t('checklist.requiredTitle')}>
          {t('checklist.requiredBody')}
        </Alert>
      )}

      {actionState.error ? <Alert tone="danger">{actionState.error}</Alert> : null}

      <div className="flex flex-wrap gap-2">
        {state.fillHref ? (
          <Link href={state.fillHref} className={cn(textNavLinkClassName, 'min-h-11 inline-flex items-center')}>
            {state.submissionStatus === 'draft'
              ? t('checklist.continue')
              : t('checklist.view')}
          </Link>
        ) : null}

        {state.canSubmit && !state.satisfied && !state.fillHref ? (
          <form action={action}>
            <input type="hidden" name="ownerType" value="work_order" />
            <input type="hidden" name="ownerId" value={workOrderId} />
            <input type="hidden" name="templateId" value={state.templateId} />
            <Button type="submit" loading={pending}>
              {t('checklist.fill')}
            </Button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
