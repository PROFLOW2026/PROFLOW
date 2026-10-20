'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  createEstimateAction,
  createOpportunityNoteAction,
  convertCrmQuoteToProductQuoteAction,
  markOpportunityLostAction,
  updateOpportunityAction,
  type CrmFormState,
} from '@/app/[locale]/(app)/crm/actions';
import {
  followUpStageSelectOptions,
  isFollowUpWonStageDisabled,
} from '@/modules/crm/domain/follow-up-stage-options';
import {
  crmQuoteCreateHref,
  crmQuoteDetailHref,
  type CrmUiSurface,
} from '@/modules/crm/ui/crm-surface-routes';
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
  status,
  notes,
  expectedStartDate,
  nextActionAt,
  nextActionText,
}: {
  opportunityId: string;
  stage: 'qualify' | 'estimate' | 'quote' | 'negotiation' | 'won' | 'lost';
  status: 'open' | 'won' | 'lost' | 'cancelled';
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
  const stageOptions = followUpStageSelectOptions(stage, status);
  const wonDisabled = isFollowUpWonStageDisabled(status);

  return (
    <form action={formAction} className="flex w-full min-w-0 flex-col gap-4">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <MainAppFormGrid dense>
        <Field label={t('stageLabel')} description={t('stageHint')} className={mainAppFieldSpan.full}>
          {(control) => (
            <select
              {...control}
              name="stage"
              defaultValue={stage}
              className="block min-h-11 w-full rounded-md border border-[var(--pf-border-strong)] bg-[var(--pf-bg-surface)] px-3 py-2 text-sm"
            >
              {stageOptions.map((value) => (
                <option
                  key={value}
                  value={value}
                  disabled={value === 'won' && wonDisabled}
                >
                  {tStages(value)}
                </option>
              ))}
            </select>
          )}
        </Field>
        {wonDisabled ? (
          <p className={`text-xs text-[var(--pf-text-muted)] ${mainAppFieldSpan.full}`}>{t('wonHint')}</p>
        ) : null}
        <Field
          label={t('nextActionLabel')}
          optionalLabel={tCommon('labels.optional')}
          description={t('nextActionHint')}
          className={mainAppFieldSpan.lg}
        >
          {(control) => (
            <Input {...control} name="nextActionText" defaultValue={nextActionText ?? ''} />
          )}
        </Field>
        <Field
          label={t('nextActionAtLabel')}
          optionalLabel={tCommon('labels.optional')}
          description={t('nextActionAtHint')}
          className={mainAppFieldSpan.lg}
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
          className={mainAppFieldSpan.full}
        >
          {(control) => (
            <Textarea {...control} name="notes" rows={3} defaultValue={notes ?? ''} />
          )}
        </Field>
        <Field
          label={t('expectedStartLabel')}
          optionalLabel={tCommon('labels.optional')}
          description={t('expectedStartHint')}
          className={mainAppFieldSpan.lg}
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
      </MainAppFormGrid>
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
    <form action={formAction} className="flex w-full min-w-0 flex-col gap-4">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <MainAppFormGrid dense>
        <Field label={t('noteBody')} required description={t('noteHint')} className={mainAppFieldSpan.full}>
          {(control) => <Textarea {...control} name="body" rows={2} required />}
        </Field>
      </MainAppFormGrid>
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
    <form action={formAction} className="flex w-full min-w-0 flex-col gap-4">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <input type="hidden" name="currency" value={currency} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <MainAppFormGrid dense>
        <Field label={t('estimateName')} required className={mainAppFieldSpan.lg}>
          {(control) => <Input {...control} name="name" required />}
        </Field>
        <Field
          label={t('estimateAmount')}
          optionalLabel={tCommon('labels.optional')}
          className={mainAppFieldSpan.lg}
        >
          {(control) => <Input {...control} name="internalAmount" inputMode="decimal" />}
        </Field>
      </MainAppFormGrid>
      <Button type="submit" loading={pending} className="self-start">
        {t('addEstimate')}
      </Button>
    </form>
  );
}

/** @deprecated Prefer Product Quote (`/quotes`). Kept as banner-only CTA. */
export function OpportunityQuoteForm({
  opportunityId,
  surface = 'owner',
}: {
  opportunityId: string;
  currency?: string;
  surface?: CrmUiSurface;
}) {
  const t = useTranslations('crm.opportunity');
  return (
    <div className="flex flex-col gap-3">
      <Alert tone="info" title={t('useProductQuoteBannerTitle')}>
        {t('useProductQuoteBanner')}
      </Alert>
      <Button asChild className="self-start">
        <Link href={crmQuoteCreateHref(surface, opportunityId)}>{t('createProductQuote')}</Link>
      </Button>
    </div>
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
    <form action={formAction} className="flex w-full min-w-0 flex-col gap-4">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <MainAppFormGrid dense>
        <Field
          label={t('lostReasonLabel')}
          optionalLabel={tCommon('labels.optional')}
          className={mainAppFieldSpan.lg}
        >
          {(control) => <Input {...control} name="lostReason" />}
        </Field>
      </MainAppFormGrid>
      <Button type="submit" variant="secondary" loading={pending} className="self-start">
        {t('markLost')}
      </Button>
    </form>
  );
}

export function CreateProductQuoteLink({
  opportunityId,
  surface = 'owner',
}: {
  opportunityId: string;
  surface?: CrmUiSurface;
}) {
  const t = useTranslations('crm.opportunity');
  return (
    <Button asChild>
      <Link href={crmQuoteCreateHref(surface, opportunityId)}>{t('createProductQuote')}</Link>
    </Button>
  );
}

export function ConvertWonForm({
  opportunityId,
  acceptedProductQuoteId,
  surface = 'owner',
}: {
  opportunityId: string;
  defaultProjectName?: string;
  acceptedVersionId?: string | null;
  acceptedProductQuoteId?: string | null;
  netAmount?: string | null;
  taxAmount?: string | null;
  totalAmount?: string | null;
  currency?: string;
  surface?: CrmUiSurface;
}) {
  const t = useTranslations('crm.convert');

  if (acceptedProductQuoteId) {
    return (
      <div className="flex flex-col gap-3">
        <Alert tone="success" title={t('headline')}>
          {t('useQuotesConvert')}
        </Alert>
        <Button asChild>
          <Link href={crmQuoteDetailHref(surface, acceptedProductQuoteId)}>{t('openProductQuote')}</Link>
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
        <Link href={crmQuoteCreateHref(surface, opportunityId)}>{t('createQuote')}</Link>
      </Button>
    </div>
  );
}

/**
 * Task 1: "Convert CRM Quote to Product Quote" button.
 * Renders inside the legacy sales quotes section for each sales quote that is
 * NOT already cancelled. On submit, creates a draft product quote pre-populated
 * with the CRM quote's line items and redirects there for editing.
 */
export function ConvertCrmQuoteButton({
  salesQuoteId,
  salesQuoteTitle,
  convertedProductQuoteId,
  disabled,
}: {
  salesQuoteId: string;
  salesQuoteTitle: string;
  convertedProductQuoteId?: string | null;
  disabled?: boolean;
}) {
  const t = useTranslations('crm.opportunity');
  const [state, formAction, pending] = useActionState<CrmFormState, FormData>(
    convertCrmQuoteToProductQuoteAction,
    {},
  );

  if (convertedProductQuoteId) {
    return (
      <div className="inline-flex flex-col items-end gap-1 text-xs">
        <span className="text-[var(--pf-text-secondary)]">{t('convertedToProductQuote')}</span>
        <Button asChild variant="secondary" size="sm" className="text-xs">
          <Link href={`/quotes/${convertedProductQuoteId}`}>{t('viewProductQuote')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="inline-flex items-center">
      <input type="hidden" name="salesQuoteId" value={salesQuoteId} />
      <input type="hidden" name="titleOverride" value={`${salesQuoteTitle}`} />
      {state.error ? (
        <span className="me-2 text-xs text-[var(--pf-status-danger-fg)]">{state.error}</span>
      ) : null}
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        loading={pending}
        disabled={disabled}
        className="text-xs"
      >
        {t('convertToProductQuote')}
      </Button>
    </form>
  );
}
