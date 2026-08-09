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
  type CrmFormState,
} from '../../actions';

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
      <Field label={t('noteBody')} required>
        {(control) => <Textarea {...control} name="body" rows={2} required />}
      </Field>
      <Button type="submit" disabled={pending} className="self-start">
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
      <Button type="submit" disabled={pending} className="self-start">
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
        <Field label={t('lineQuantity')}>
          {(control) => (
            <Input {...control} name="quantity" defaultValue="1" inputMode="decimal" numeric />
          )}
        </Field>
        <Field label={t('lineUnit')} required>
          {(control) => (
            <Input {...control} name="unitAmount" required inputMode="decimal" numeric />
          )}
        </Field>
        <Field label={t('lineTotal')} required>
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
      <Button type="submit" disabled={pending} className="self-start">
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
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
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
      <Button type="submit" size="sm" disabled={pending}>
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
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
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
    return <p className="text-sm text-[var(--pf-text-secondary)]">{t('requiresAcceptedQuote')}</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <input type="hidden" name="salesQuoteVersionId" value={acceptedVersionId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('description')}</p>
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
      <Button type="submit" disabled={pending} className="self-start">
        {t('submit')}
      </Button>
    </form>
  );
}
