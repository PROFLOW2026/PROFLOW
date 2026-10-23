'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState, type FormEvent } from 'react';
import { BusinessChangeConfirmDialog } from '@/components/patterns/business-change-confirm-dialog';
import { MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import type { FormActionState } from '@/app/[locale]/(app)/changes/actions';
import type { BusinessChangeFieldDiff } from '@/shared/business-change/types';
import type { ChangeOrderRecord } from '../domain/types';

export interface ReverseChangeOrderFormProps {
  changeOrder: ChangeOrderRecord;
  reversingChangeOrder: ChangeOrderRecord | null;
  changeRequestId?: string | null;
  action: (state: FormActionState, formData: FormData) => Promise<FormActionState>;
  canReverse: boolean;
}

export function ReverseChangeOrderForm({
  changeOrder,
  reversingChangeOrder,
  changeRequestId,
  action,
  canReverse,
}: ReverseChangeOrderFormProps) {
  const t = useTranslations('changes.reverse');
  const tConfirm = useTranslations('changes.retroactiveEdit');
  const [state, formAction, pending] = useActionState(action, {});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reasonDraft, setReasonDraft] = useState('');
  const [confirmDiffs, setConfirmDiffs] = useState<readonly BusinessChangeFieldDiff[]>([]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = reasonDraft.trim();
    if (!reason) return;
    setConfirmDiffs([
      { fieldLabel: t('reason'), before: '—', after: reason },
      {
        fieldLabel: tConfirm('fields.changeOrder'),
        before: changeOrder.reference ?? changeOrder.id,
        after: t('confirmImpact'),
      },
    ]);
    setConfirmOpen(true);
  }

  function confirmReverse() {
    setConfirmOpen(false);
    const form = document.getElementById(`reverse-co-${changeOrder.id}`) as HTMLFormElement | null;
    const ack = form?.querySelector<HTMLInputElement>('input[name="changeAcknowledged"]');
    if (ack) ack.value = 'true';
    form?.requestSubmit();
  }

  if (changeOrder.reversalOfChangeOrderId) {
    return (
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('isReversal')}</p>
    );
  }

  if (reversingChangeOrder) {
    return (
      <div className="flex min-w-0 flex-col gap-1 text-start">
        <p className="text-sm font-medium">{t('alreadyReversedTitle')}</p>
        <p className="text-sm text-[var(--pf-text-secondary)]">
          {t('alreadyReversedBody', { reference: reversingChangeOrder.reference ?? reversingChangeOrder.id })}
        </p>
      </div>
    );
  }

  if (!canReverse) {
    return <p className="text-sm text-[var(--pf-text-secondary)]">{t('noPermission')}</p>;
  }

  return (
    <>
      <form
        id={`reverse-co-${changeOrder.id}`}
        action={formAction}
        onSubmit={handleSubmit}
        className="flex w-full min-w-0 flex-col gap-4"
      >
        <input type="hidden" name="changeOrderId" value={changeOrder.id} />
        <input type="hidden" name="changeAcknowledged" value="false" />
        {changeRequestId ? <input type="hidden" name="changeRequestId" value={changeRequestId} /> : null}
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('description')}</p>
        <MainAppFormGrid>
          <Field label={t('reason')} required className={mainAppFieldSpan.full}>
            {(control) => (
              <Textarea
                {...control}
                name="reason"
                rows={3}
                required
                maxLength={5000}
                value={reasonDraft}
                onChange={(e) => setReasonDraft(e.target.value)}
              />
            )}
          </Field>
        </MainAppFormGrid>
        {state.error ? (
          <p className="text-sm text-[var(--pf-status-danger-fg)]" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p className="text-sm text-[var(--pf-status-success-fg)]">{tConfirm('reversalSaved')}</p>
        ) : null}
        <Button type="submit" variant="danger" size="sm" loading={pending} className="max-w-full self-start">
          {t('confirm')}
        </Button>
      </form>
      <BusinessChangeConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={tConfirm('reverseConfirmTitle')}
        description={tConfirm('reverseConfirmDescription')}
        changes={confirmDiffs}
        pending={pending}
        onConfirm={confirmReverse}
        onBackToEdit={() => setConfirmOpen(false)}
      />
    </>
  );
}
