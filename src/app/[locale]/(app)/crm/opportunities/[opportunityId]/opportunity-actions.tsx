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
  createEstimateAction,
  createOpportunityNoteAction,
  createSalesQuoteAction,
  issueSalesQuoteVersionAction,
  markOpportunityLostAction,
  updateOpportunityAction,
  type CrmFormState,
} from '../../actions';
import { productQuoteCreateHref, productQuoteDetailHref } from '@/modules/quotes/domain/product-path';
import { Link } from '@/shared/i18n/navigation';

function toDatetimeLocalValue(value: Date | string | null): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function OpportunityFollowUpForm({
  opportunityId,
  stage,
  notes,
  expectedStartDate,
  nextActionAt,
  nextActionText,
}: {
  opportunityId: string;
  stage: 'qualify' | 'estimate' | 'quote' | 'negotiation' | 'won' | 'lost';
  notes: string | null;
  expectedStartDate: string | null;
  nextActionAt: Date | null;
  nextActionText: string | null;
}) {
  const t = useTranslations('crm.followUp');
  const tStages = useTranslations('crm.stages');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<CrmFormState, FormData>(
    updateOpportunityAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label={t('stageLabel')} description={t('stageHint')}>
        {(control) => (
          <select
            {...control}
            name="stage"
            defaultValue={stage}
            className="block min-h-11 w-full rounded-md border border-[var(--pf-border-strong)] bg-[var(--pf-bg-surface)] px-3 py-2 text-sm"
          >
            <option value="qualify">{tStages('qualify')}</option>
            <option value="estimate">{tStages('estimate')}</option>
            <option value="quote">{tStages('quote')}</option>
            <option value="negotiation">{tStages('negotiation')}</option>
            <option value="won">{tStages('won')}</option>
            <option value="lost">{tStages('lost')}</option>
          </select>
        )}
      </Field>
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

export function CreateProductQuoteLink({
  opportunityId,
}: {
  opportunityId: string;
}) {
  const t = useTranslations('crm.opportunity');
  return (
    <Button asChild>
      <Link href={productQuoteCreateHref(opportunityId)}>{t('createProductQuote')}</Link>
    </Button>
  );
}

export function ConvertWonForm({
  opportunityId,
  acceptedProductQuoteId,
}: {
  opportunityId: string;
  defaultProjectName?: string;
  acceptedVersionId?: string | null;
  acceptedProductQuoteId?: string | null;
  netAmount?: string | null;
  taxAmount?: string | null;
  totalAmount?: string | null;
  currency?: string;
}) {
  const t = useTranslations('crm.convert');

  if (acceptedProductQuoteId) {
    return (
      <div className="flex flex-col gap-3">
        <Alert tone="success" title={t('headline')}>
          {t('useQuotesConvert')}
        </Alert>
        <Button asChild>
          <Link href={productQuoteDetailHref(acceptedProductQuoteId)}>{t('openProductQuote')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Alert tone="warning" title={t('blockedTitle')}>
        {t('requiresProductQuote')}
      </Alert>
      <Button asChild>
        <Link href={productQuoteCreateHref(opportunityId)}>{t('createQuote')}</Link>
      </Button>
    </div>
  );
}
