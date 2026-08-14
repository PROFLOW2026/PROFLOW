'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  acceptSalesQuoteVersionAction,
  convertWonOpportunityAction,
  createEstimateAction,
  createOpportunityNoteAction,
  createSalesQuoteAction,
  issueSalesQuoteVersionAction,
  markOpportunityLostAction,
  updateOpportunityAction,
  type CrmFormState,
} from '../../actions';

function toDatetimeLocalValue(value: Date | string | null): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function OpportunityFollowUpForm({
  opportunityId,
  notes,
  expectedStartDate,
  nextActionAt,
  nextActionText,
}: {
  opportunityId: string;
  notes: string | null;
  expectedStartDate: string | null;
  nextActionAt: Date | null;
  nextActionText: string | null;
}) {
  const t = useTranslations('crm.followUp');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<CrmFormState, FormData>(
    updateOpportunityAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field
        label={t('nextActionLabel')}
        optionalLabel={tCommon('labels.optional')}
        description={t('nextActionHint')}
      >
        {(control) => (
          <Input {...control} name="nextActionText" defaultValue={nextActionText ?? ''} />
        )}
      </Field>
      <Field
        label={t('nextActionAtLabel')}
        optionalLabel={tCommon('labels.optional')}
        description={t('nextActionAtHint')}
      >
        {(control) => (
          <Input
            {...control}
            name="nextActionAt"
            type="datetime-local"
            dir="ltr"
            defaultValue={toDatetimeLocalValue(nextActionAt)}
          />
        )}
      </Field>
      <Field
        label={t('notesLabel')}
        optionalLabel={tCommon('labels.optional')}
        description={t('notesHint')}
      >
        {(control) => (
          <Textarea {...control} name="notes" rows={3} defaultValue={notes ?? ''} />
        )}
      </Field>
      <Field
        label={t('expectedStartLabel')}
        optionalLabel={tCommon('labels.optional')}
        description={t('expectedStartHint')}
      >
        {(control) => (
          <Input
            {...control}
            name="expectedStartDate"
            type="date"
            defaultValue={expectedStartDate ?? ''}
          />
        )}
      </Field>
      <Button type="submit" loading={pending} className="self-start">
        {t('save')}
      </Button>
    </form>
  );
}

export function OpportunityNoteForm({ opportunityId }: { opportunityId: string }) {
  const t = useTranslations('crm.opportunity');
  const [state, formAction, pending] = useActionState<CrmFormState, FormData>(
    createOpportunityNoteAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label={t('noteBody')} required description={t('noteHint')}>
        {(control) => <Textarea {...control} name="body" rows={2} required />}
      </Field>
      <Button type="submit" loading={pending} className="self-start">
        {t('addNote')}
      </Button>
    </form>
  );
}

export function OpportunityEstimateForm({
  opportunityId,
  currency,
}: {
  opportunityId: string;
  currency: string;
}) {
  const t = useTranslations('crm.opportunity');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<CrmFormState, FormData>(
    createEstimateAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <input type="hidden" name="currency" value={currency} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label={t('estimateName')} required>
        {(control) => <Input {...control} name="name" required />}
      </Field>
      <Field label={t('estimateAmount')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Input {...control} name="internalAmount" inputMode="decimal" />}
      </Field>
      <Button type="submit" loading={pending} className="self-start">
        {t('addEstimate')}
      </Button>
    </form>
  );
}

export function OpportunityQuoteForm({
  opportunityId,
  currency,
}: {
  opportunityId: string;
  currency: string;
}) {
  const t = useTranslations('crm.opportunity');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<CrmFormState, FormData>(
    createSalesQuoteAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <input type="hidden" name="currency" value={currency} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label={t('quoteTitle')} required>
        {(control) => <Input {...control} name="title" required />}
      </Field>
      <Field label={t('lineDescription')} required>
        {(control) => <Input {...control} name="lineDescription" required />}
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('lineQuantity')} className="min-w-0">
          {(control) => (
            <Input {...control} name="quantity" defaultValue="1" inputMode="decimal" numeric />
          )}
        </Field>
        <Field label={t('lineUnit')} required className="min-w-0">
          {(control) => (
            <Input {...control} name="unitAmount" required inputMode="decimal" numeric />
          )}
        </Field>
        <Field label={t('lineTotal')} required className="min-w-0">
          {(control) => (
            <Input {...control} name="lineTotal" required inputMode="decimal" numeric />
          )}
        </Field>
      </div>
      <Field label={t('quoteTax')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <Input {...control} name="taxAmount" inputMode="decimal" numeric placeholder={currency} />
        )}
      </Field>
      <p className="text-xs text-[var(--pf-text-muted)]">{t('quoteNotBilling')}</p>
      <Button type="submit" loading={pending} className="self-start">
        {t('addQuote')}
      </Button>
    </form>
  );
}

export function IssueVersionButton({ versionId }: { versionId: string }) {
  const t = useTranslations('crm.opportunity');
  const [state, formAction, pending] = useActionState<CrmFormState, FormData>(
    issueSalesQuoteVersionAction,
    {},
  );
  return (
    <form action={formAction}>
      <input type="hidden" name="versionId" value={versionId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Button type="submit" variant="secondary" size="sm" loading={pending}>
        {t('issueVersion')}
      </Button>
    </form>
  );
}

export function AcceptVersionButton({ versionId }: { versionId: string }) {
  const t = useTranslations('crm.opportunity');
  const [state, formAction, pending] = useActionState<CrmFormState, FormData>(
    acceptSalesQuoteVersionAction,
    {},
  );
  return (
    <form action={formAction}>
      <input type="hidden" name="versionId" value={versionId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Button type="submit" size="sm" loading={pending}>
        {t('acceptVersion')}
      </Button>
    </form>
  );
}

export function MarkLostForm({ opportunityId }: { opportunityId: string }) {
  const t = useTranslations('crm.opportunity');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<CrmFormState, FormData>(
    markOpportunityLostAction,
    {},
  );
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label={t('lostReasonLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Input {...control} name="lostReason" />}
      </Field>
      <Button type="submit" variant="secondary" loading={pending} className="self-start">
        {t('markLost')}
      </Button>
    </form>
  );
}

export function ConvertWonForm({
  opportunityId,
  defaultProjectName,
  acceptedVersionId,
  netAmount,
  taxAmount,
  totalAmount,
  currency,
}: {
  opportunityId: string;
  defaultProjectName: string;
  acceptedVersionId: string | null;
  netAmount?: string | null;
  taxAmount?: string | null;
  totalAmount?: string | null;
  currency?: string;
}) {
  const t = useTranslations('crm.convert');
  const [state, formAction, pending] = useActionState<CrmFormState, FormData>(
    convertWonOpportunityAction,
    {},
  );

  if (!acceptedVersionId) {
    return (
      <Alert tone="warning" title={t('blockedTitle')}>
        {t('requiresAcceptedQuote')}
      </Alert>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <input type="hidden" name="salesQuoteVersionId" value={acceptedVersionId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Alert tone="success" title={t('headline')}>
        {t('description')}
      </Alert>
      {netAmount && currency ? (
        <p className="text-sm text-[var(--pf-text-secondary)]" dir="ltr">
          {t('netBaseline', {
            net: netAmount,
            tax: taxAmount ?? '0',
            total: totalAmount ?? netAmount,
            currency,
          })}
        </p>
      ) : null}
      <p className="text-xs text-[var(--pf-text-muted)]">{t('vatNote')}</p>
      <Field label={t('projectNameLabel')}>
        {(control) => <Input {...control} name="projectName" defaultValue={defaultProjectName} />}
      </Field>
      <Button type="submit" size="lg" loading={pending} className="self-start sm:self-auto">
        {t('submit')}
      </Button>
    </form>
  );
}
