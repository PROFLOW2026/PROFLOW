'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
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
    <form action={formAction} className="flex w-full min-w-0 flex-col gap-4">
      <input type="hidden" name="changeRequestId" value={changeRequestId} />

      <MainAppFormGrid dense>
        <Field label={t('lineDescription')} required className={mainAppFieldSpan.lg}>
          {(control) => <Input {...control} name="lineDescription" required />}
        </Field>

        <Field label={t('lineTotal')} required description={t('currencyHint', { currency })} className={mainAppFieldSpan.md}>
          {(control) => <Input {...control} name="lineTotal" inputMode="decimal" required dir="ltr" />}
        </Field>
        <Field label={t('taxAmount')} className={mainAppFieldSpan.md}>
          {(control) => <Input {...control} name="taxAmount" inputMode="decimal" dir="ltr" />}
        </Field>

        <Field label={t('validUntil')} className={mainAppFieldSpan.md}>
          {(control) => <Input {...control} name="validUntil" type="date" dir="ltr" />}
        </Field>

        <Field label={t('notes')} className={mainAppFieldSpan.full}>
          {(control) => <Textarea {...control} name="notes" rows={2} />}
        </Field>
      </MainAppFormGrid>

      {state.error ? (
        <p className="text-sm text-[var(--pf-status-danger-fg)]" role="alert">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" loading={pending}>
        {t('saveVersion')}
      </Button>
    </form>
  );
}
