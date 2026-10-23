'use client';

import { useActionState, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { BusinessChangeFormDialogs } from '@/components/patterns/business-change-form-dialogs';
import { MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { DuplicateRecordWarningItem } from '@/components/patterns/duplicate-record-warning-dialog';
import {
  previewSimilarProspectsAction,
  updateProspectAction,
  type CrmFormState,
} from '@/app/[locale]/(app)/crm/actions';

export function ProspectRetroactiveEditForm({
  prospect,
}: {
  prospect: {
    id: string;
    name: string;
    companyName: string | null;
    email: string | null;
    phone: string | null;
    notes: string | null;
  };
}) {
  const t = useTranslations('crm.retroactiveEdit');
  const tProspect = useTranslations('crm.prospect');
  const tCommon = useTranslations('common');
  const formId = `prospect-retro-${prospect.id}`;
  const [state, formAction, pending] = useActionState<CrmFormState, FormData>(
    updateProspectAction,
    {},
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [similarMatches, setSimilarMatches] = useState<readonly DuplicateRecordWarningItem[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSimilarLoading(true);
    try {
      const form = event.currentTarget;
      const data = new FormData(form);
      const name = String(data.get('name') ?? '').trim();
      const email = String(data.get('email') ?? '').trim() || null;
      const rows = await previewSimilarProspectsAction({
        excludeProspectId: prospect.id,
        name,
        email,
      });
      const matches: DuplicateRecordWarningItem[] = rows.map((row) => ({
        id: row.id,
        href: `/crm/prospects/${row.id}`,
        title: row.name,
        reason: t('duplicateReason'),
      }));
      setSimilarMatches(matches);
      if (matches.length > 0) {
        setDuplicateOpen(true);
        return;
      }
      setConfirmOpen(true);
    } finally {
      setSimilarLoading(false);
    }
  }

  function confirmSave() {
    setConfirmOpen(false);
    const form = document.getElementById(formId) as HTMLFormElement | null;
    const ack = form?.querySelector<HTMLInputElement>('input[name="changeAcknowledged"]');
    if (ack) ack.value = 'true';
    form?.requestSubmit();
  }

  return (
    <>
      <form id={formId} action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input type="hidden" name="prospectId" value={prospect.id} />
        <input type="hidden" name="changeAcknowledged" value="false" />
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('description')}</p>
        <MainAppFormGrid dense>
          <Field label={tCommon('labels.name')} required className={mainAppFieldSpan.lg}>
            {(control) => (
              <Input {...control} name="name" defaultValue={prospect.name} required />
            )}
          </Field>
          <Field label={tProspect('companyLabel')} optionalLabel={tCommon('labels.optional')} className={mainAppFieldSpan.lg}>
            {(control) => (
              <Input {...control} name="companyName" defaultValue={prospect.companyName ?? ''} />
            )}
          </Field>
          <Field label={tProspect('emailLabel')} optionalLabel={tCommon('labels.optional')} className={mainAppFieldSpan.lg}>
            {(control) => (
              <Input {...control} name="email" type="email" dir="ltr" defaultValue={prospect.email ?? ''} />
            )}
          </Field>
          <Field label={tProspect('phoneLabel')} optionalLabel={tCommon('labels.optional')} className={mainAppFieldSpan.lg}>
            {(control) => (
              <Input {...control} name="phone" type="tel" dir="ltr" defaultValue={prospect.phone ?? ''} />
            )}
          </Field>
          <Field label={tCommon('labels.notes')} optionalLabel={tCommon('labels.optional')} className={mainAppFieldSpan.full}>
            {(control) => (
              <Textarea {...control} name="notes" rows={3} defaultValue={prospect.notes ?? ''} />
            )}
          </Field>
        </MainAppFormGrid>
        <Button type="submit" loading={pending || similarLoading} className="self-start">
          {t('save')}
        </Button>
      </form>
      <BusinessChangeFormDialogs
        confirmOpen={confirmOpen}
        setConfirmOpen={setConfirmOpen}
        duplicateOpen={duplicateOpen}
        setDuplicateOpen={setDuplicateOpen}
        pending={pending}
        changes={[]}
        similarMatches={similarMatches}
        confirmTitle={t('confirmTitle')}
        confirmDescription={t('confirmDescription')}
        duplicateTitle={t('duplicateTitle')}
        duplicateDescription={t('duplicateDescription')}
        onConfirm={confirmSave}
        onBackToEdit={() => {
          setConfirmOpen(false);
          setDuplicateOpen(false);
        }}
        onContinuePastDuplicate={() => setConfirmOpen(true)}
      />
    </>
  );
}
