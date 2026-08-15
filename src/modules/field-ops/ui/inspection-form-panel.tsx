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
import type { InspectionFormGateState } from '../application/inspection-form';

export function InspectionFormCard({
  inspectionId,
  state,
}: {
  inspectionId: string;
  state: InspectionFormGateState;
}) {
  const t = useTranslations('fieldOps.form');
  const [actionState, action, pending] = useActionState(
    startOwnerSubmissionAction,
    {} as FormsActionState,
  );

  if (!state.required || !state.templateId) return null;

  const title = state.templateName ?? t('untitled');
  const statusLabel =
    state.submissionStatus === 'submitted'
      ? t('statusSubmitted')
      : state.submissionStatus === 'draft'
        ? t('statusDraft')
        : t('statusMissing');

  return (
    <section className="flex max-w-lg flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{t('title')}</h2>
          <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{title}</p>
        </div>
        <StatusBadge
          shape={state.satisfied ? 'completed' : 'pending'}
          label={statusLabel}
        />
      </div>

      {state.satisfied ? (
        <Alert tone="success">{t('submittedBody')}</Alert>
      ) : (
        <Alert tone="warning" title={t('requiredTitle')}>
          {t('requiredBody')}
        </Alert>
      )}

      {actionState.error ? <Alert tone="danger">{actionState.error}</Alert> : null}

      <div className="flex flex-wrap gap-2">
        {state.fillHref ? (
          <Link href={state.fillHref} className={cn(textNavLinkClassName, 'inline-flex min-h-11 items-center')}>
            {state.submissionStatus === 'draft' ? t('continue') : t('view')}
          </Link>
        ) : null}

        {state.canSubmit && !state.satisfied && !state.fillHref ? (
          <form action={action}>
            <input type="hidden" name="ownerType" value="inspection" />
            <input type="hidden" name="ownerId" value={inspectionId} />
            <input type="hidden" name="templateId" value={state.templateId} />
            <Button type="submit" loading={pending}>
              {t('fill')}
            </Button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
