'use client';

import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { BusinessChangeConfirmDialog } from '@/components/patterns/business-change-confirm-dialog';
import type { BusinessChangeFieldDiff } from '@/shared/business-change/types';
import { FieldGrid, FormField } from './action-form';
import { updateAgreementAction } from './actions';
import { INITIAL_FORM_STATE } from './form-state';

type Option = { readonly id: string; readonly name: string };

export function AgreementRetroactiveEditForm({
  projectId,
  agreement,
  workPackages,
}: {
  projectId: string;
  agreement: {
    id: string;
    title: string;
    trade: string | null;
    scopeSummary: string | null;
    workPackageId: string | null;
    subcontractNumber: string | null;
    startDate: string | null;
    endDate: string | null;
    notes: string | null;
  };
  workPackages: readonly Option[];
}) {
  const t = useTranslations('subcontracts.retroactiveEdit');
  const tFields = useTranslations('subcontracts.agreement.fields');
  const tCommon = useTranslations('common');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const skipConfirmRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, pending] = useActionState(updateAgreementAction, INITIAL_FORM_STATE);

  const noneOption = { value: '', label: tCommon('labels.none') };
  const wpOptions = [noneOption, ...workPackages.map((wp) => ({ value: wp.id, label: wp.name }))];

  const initial = agreement;

  function readFormSnapshot(): Record<string, string> {
    const form = formRef.current;
    if (!form) return {};
    const data = new FormData(form);
    const read = (name: string) => String(data.get(name) ?? '').trim();
    return {
      title: read('title'),
      trade: read('trade'),
      subcontractNumber: read('subcontractNumber'),
      startDate: read('startDate'),
      endDate: read('endDate'),
      scopeSummary: read('scopeSummary'),
      notes: read('notes'),
      workPackageId: read('workPackageId'),
    };
  }

  const [snapshot, setSnapshot] = useState<Record<string, string> | null>(null);

  const changeDiffs = useMemo((): BusinessChangeFieldDiff[] => {
    if (!snapshot) return [];
    const rows: BusinessChangeFieldDiff[] = [];
    const push = (fieldLabel: string, before: string | null, after: string) => {
      const b = (before ?? '').trim() || '—';
      const a = after.trim() || '—';
      if (b !== a) rows.push({ fieldLabel, before: b, after: a });
    };
    push(tFields('title'), initial.title, snapshot.title ?? '');
    push(tFields('trade'), initial.trade, snapshot.trade ?? '');
    push(tFields('number'), initial.subcontractNumber, snapshot.subcontractNumber ?? '');
    push(tFields('startDate'), initial.startDate, snapshot.startDate ?? '');
    push(tFields('endDate'), initial.endDate, snapshot.endDate ?? '');
    push(tFields('scope'), initial.scopeSummary, snapshot.scopeSummary ?? '');
    push(tCommon('labels.notes'), initial.notes, snapshot.notes ?? '');
    const wpBefore =
      workPackages.find((wp) => wp.id === initial.workPackageId)?.name ??
      (initial.workPackageId ? initial.workPackageId : '—');
    const wpAfter =
      workPackages.find((wp) => wp.id === snapshot.workPackageId)?.name ??
      (snapshot.workPackageId ? snapshot.workPackageId : '—');
    if (wpBefore !== wpAfter) {
      rows.push({ fieldLabel: tFields('workPackage'), before: wpBefore, after: wpAfter });
    }
    return rows;
  }, [initial, snapshot, tCommon, tFields, workPackages]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (skipConfirmRef.current) {
      skipConfirmRef.current = false;
      return;
    }
    event.preventDefault();
    setSnapshot(readFormSnapshot());
    setConfirmOpen(true);
  }

  function confirmSave() {
    setConfirmOpen(false);
    const ack = formRef.current?.querySelector<HTMLInputElement>('input[name="changeAcknowledged"]');
    if (ack) ack.value = 'true';
    skipConfirmRef.current = true;
    formRef.current?.requestSubmit();
  }

  return (
    <>
      <form ref={formRef} action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="agreementId" value={agreement.id} />
        <input type="hidden" name="changeAcknowledged" value="false" />
        <FieldGrid>
          <FormField label={tFields('title')} name="title" defaultValue={agreement.title} required />
          <FormField label={tFields('number')} name="subcontractNumber" defaultValue={agreement.subcontractNumber} />
          <FormField label={tFields('trade')} name="trade" defaultValue={agreement.trade} />
          <FormField
            label={tFields('workPackage')}
            name="workPackageId"
            defaultValue={agreement.workPackageId ?? ''}
            options={wpOptions}
          />
          <FormField label={tFields('startDate')} name="startDate" type="date" defaultValue={agreement.startDate} />
          <FormField label={tFields('endDate')} name="endDate" type="date" defaultValue={agreement.endDate} />
        </FieldGrid>
        <FormField label={tFields('scope')} name="scopeSummary" defaultValue={agreement.scopeSummary} multiline />
        <FormField label={tCommon('labels.notes')} name="notes" defaultValue={agreement.notes} multiline />
        {state.error ? (
          <p role="alert" className="text-sm font-medium text-[var(--pf-status-danger-fg)]">
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p role="status" className="text-sm text-[var(--pf-status-success-fg)]">
            {t('saved')}
          </p>
        ) : null}
        <div>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-9 items-center justify-center rounded-md bg-[var(--pf-action-primary-bg)] px-3 text-sm font-medium text-[var(--pf-action-primary-fg)] disabled:opacity-60"
          >
            {pending ? tCommon('actions.saving') : t('save')}
          </button>
        </div>
      </form>
      <BusinessChangeConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('confirmTitle')}
        description={t('confirmDescription')}
        changes={changeDiffs}
        pending={pending}
        onConfirm={confirmSave}
        onBackToEdit={() => setConfirmOpen(false)}
      />
    </>
  );
}
