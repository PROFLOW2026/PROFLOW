'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
import { Textarea } from '@/components/ui/textarea';
import {
  closeProjectAction,
  markCloseoutReadyAction,
  reopenProjectAction,
  startCloseoutAction,
  type CloseoutFormState,
} from '@/app/[locale]/(app)/projects/closeout-actions';

function FormError({ state }: { state: CloseoutFormState }) {
  if (!state.error) return null;
  return <Alert tone="danger">{state.error}</Alert>;
}

export function CloseoutActions({
  projectId,
  lifecycle,
  canUpdate,
  hasHardBlockers,
}: {
  readonly projectId: string;
  readonly lifecycle: 'open' | 'ready' | 'closed' | 'reopened' | 'none';
  readonly canUpdate: boolean;
  readonly hasHardBlockers: boolean;
}) {
  const t = useTranslations('closeout');
  const [startState, startAction, startPending] = useActionState(startCloseoutAction, {});
  const [readyState, readyAction, readyPending] = useActionState(markCloseoutReadyAction, {});
  const [closeState, closeAction, closePending] = useActionState(closeProjectAction, {});
  const [reopenState, reopenAction, reopenPending] = useActionState(reopenProjectAction, {});

  if (!canUpdate) return null;

  const closed = lifecycle === 'closed';
  const started = lifecycle !== 'none';

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {!started ? (
        <form action={startAction} className="flex min-w-0 flex-col gap-2">
          <input type="hidden" name="projectId" value={projectId} />
          <FormError state={startState} />
          <Button type="submit" disabled={startPending}>
            {t('actions.start')}
          </Button>
        </form>
      ) : null}

      {started && !closed ? (
        <>
          {lifecycle !== 'ready' ? (
            <form action={readyAction} className="flex min-w-0 flex-col gap-2">
              <input type="hidden" name="projectId" value={projectId} />
              <FormError state={readyState} />
              <Button type="submit" variant="secondary" disabled={readyPending || hasHardBlockers}>
                {t('actions.markReady')}
              </Button>
            </form>
          ) : null}

          <form action={closeAction} className="flex w-full min-w-0 max-w-xl flex-col gap-3">
            <input type="hidden" name="projectId" value={projectId} />
            <FormError state={closeState} />
            {hasHardBlockers ? <Alert tone="warning">{t('actions.blocked')}</Alert> : null}
            <MainAppFormGrid dense>
              <Field label={t('actions.reason')} required className={mainAppFieldSpan.full}>
                {(control) => <Textarea {...control} name="reason" required rows={3} />}
              </Field>
            </MainAppFormGrid>
            <Button type="submit" disabled={closePending || hasHardBlockers}>
              {t('actions.close')}
            </Button>
            <p className="text-xs text-[var(--pf-text-muted)]">{t('actions.closeConfirm')}</p>
          </form>
        </>
      ) : null}

      {closed ? (
        <form action={reopenAction} className="flex w-full min-w-0 max-w-xl flex-col gap-3">
          <input type="hidden" name="projectId" value={projectId} />
          <FormError state={reopenState} />
          <MainAppFormGrid dense>
            <Field label={t('actions.reason')} required className={mainAppFieldSpan.full}>
              {(control) => <Textarea {...control} name="reason" required rows={3} />}
            </Field>
          </MainAppFormGrid>
          <Button type="submit" variant="secondary" disabled={reopenPending}>
            {t('actions.reopen')}
          </Button>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('actions.reopenConfirm')}</p>
        </form>
      ) : null}
    </div>
  );
}
