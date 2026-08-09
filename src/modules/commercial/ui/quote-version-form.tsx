'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { FormActionState } from '@/app/[locale]/(app)/changes/actions';

export interface QuoteVersionFormProps {
  changeRequestId: string;
  action: (state: FormActionState, formData: FormData) => Promise<FormActionState>;
  currency: string;
}

export function QuoteVersionForm({ changeRequestId, action, currency }: QuoteVersionFormProps) {
  const t = useTranslations('changes.quote');
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <input type="hidden" name="changeRequestId" value={changeRequestId} />

      <Field label={t('lineDescription')} required>
        {(control) => <Input {...control} name="lineDescription" required />}
      </Field>

      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <Field label={t('lineTotal')} required description={t('currencyHint', { currency })}>
          {(control) => <Input {...control} name="lineTotal" inputMode="decimal" required dir="ltr" />}
        </Field>
        <Field label={t('taxAmount')}>
          {(control) => <Input {...control} name="taxAmount" inputMode="decimal" dir="ltr" />}
        </Field>
      </div>

      <Field label={t('validUntil')}>
        {(control) => <Input {...control} name="validUntil" type="date" dir="ltr" />}
      </Field>

      <Field label={t('notes')}>
        {(control) => <Textarea {...control} name="notes" rows={2} />}
      </Field>

      {state.error ? (
        <p className="text-sm text-[var(--pf-status-danger-fg)]" role="alert">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {t('saveVersion')}
      </Button>
    </form>
  );
}
