'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createLeadAction, type CrmFormState } from '@/app/[locale]/(app)/crm/actions';

export function CrmNewLeadForm() {
  const t = useTranslations('crm.lead');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<CrmFormState, FormData>(createLeadAction, {});

  return (
    <form action={formAction} className="flex w-full min-w-0 flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <MainAppFormGrid dense>
        <Field label={t('titleLabel')} required className={mainAppFieldSpan.lg}>
          {(control) => <Input {...control} name="title" required autoFocus />}
        </Field>
        <Field label={t('sourceLabel')} optionalLabel={tCommon('labels.optional')} className={mainAppFieldSpan.lg}>
          {(control) => <Input {...control} name="source" />}
        </Field>
        <Field label={t('emailLabel')} optionalLabel={tCommon('labels.optional')} className={mainAppFieldSpan.lg}>
          {(control) => <Input {...control} name="email" type="email" dir="ltr" />}
        </Field>
        <Field label={t('phoneLabel')} optionalLabel={tCommon('labels.optional')} className={mainAppFieldSpan.lg}>
          {(control) => <Input {...control} name="phone" type="tel" dir="ltr" />}
        </Field>
        <Field label={t('notesLabel')} optionalLabel={tCommon('labels.optional')} className={mainAppFieldSpan.full}>
          {(control) => <Textarea {...control} name="notes" rows={3} />}
        </Field>
      </MainAppFormGrid>
      <Button type="submit" loading={pending} className="self-start">
        {t('submit')}
      </Button>
    </form>
  );
}
