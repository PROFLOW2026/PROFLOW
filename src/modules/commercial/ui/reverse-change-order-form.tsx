'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import type { FormActionState } from '@/app/[locale]/(app)/changes/actions';
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
  const [state, formAction, pending] = useActionState(action, {});

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
    <form action={formAction} className="flex min-w-0 flex-col gap-3">
      <input type="hidden" name="changeOrderId" value={changeOrder.id} />
      {changeRequestId ? <input type="hidden" name="changeRequestId" value={changeRequestId} /> : null}
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('description')}</p>
      <Field label={t('reason')} required>
        {(control) => <Textarea {...control} name="reason" rows={3} required maxLength={5000} />}
      </Field>
      {state.error ? (
        <p className="text-sm text-[var(--pf-status-danger-fg)]" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="danger" size="sm" loading={pending} className="max-w-full self-start">
        {t('confirm')}
      </Button>
    </form>
  );
}
