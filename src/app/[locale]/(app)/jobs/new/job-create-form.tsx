'use client';

import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { startTransition, useActionState, useState, type FormEvent } from 'react';
import { MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ContractAmountFields } from '@/modules/projects/ui/contract-amount-fields';
import { rtlFlipClassName } from '@/shared/i18n/ltr-island';
import { createJobAction, type JobFormState } from '../actions';
import {
  JobCreateEmployeePicker,
  type JobCreateEmployeeOption,
} from './job-create-employee-picker';

type ClientMode = 'new' | 'existing';
type PricingMode = 'fixed' | 'open';

const NAME_MAX = 200;

function showValidationBanner(state: JobFormState): boolean {
  if (!state.error) return false;
  const messages = Object.values(state.fieldErrors ?? {});
  if (messages.length > 0 && messages.every((message) => message === state.error)) return false;
  return true;
}

interface JobCreateFormProps {
  baseCurrency: string;
  currencySymbol: string;
  clients: { id: string; name: string }[];
  defaultStartDate: string;
  taxRatePercent?: string | null;
  employees?: readonly JobCreateEmployeeOption[];
  canAssignEmployees?: boolean;
}

export function JobCreateForm({
  baseCurrency,
  currencySymbol,
  clients,
  defaultStartDate,
  taxRatePercent = null,
  employees = [],
  canAssignEmployees = false,
}: JobCreateFormProps) {
  const t = useTranslations('jobs');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<JobFormState, FormData>(createJobAction, {});
  // Walk-in first on mobile quick path; existing clients remain one tap away.
  const [clientMode, setClientMode] = useState<ClientMode>('new');
  const [pricingMode, setPricingMode] = useState<PricingMode>('fixed');
  const [showMore, setShowMore] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full min-w-0 flex-col gap-4">
      {showValidationBanner(state) ? <Alert tone="danger">{state.error}</Alert> : null}

      <MainAppFormGrid dense>
      <Field label={t('create.clientLabel')} required error={state.fieldErrors?.clientId ?? state.fieldErrors?.clientName} className={mainAppFieldSpan.lg}>
        {(control) => (
          <>
            <input type="hidden" name="clientMode" value={clientMode} />
            <Select value={clientMode} onValueChange={(value) => setClientMode(value as ClientMode)}>
              <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">{t('create.clientNew')}</SelectItem>
                {clients.length > 0 ? (
                  <SelectItem value="existing">{t('create.clientSelect')}</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      {clientMode === 'new' ? (
        <Field label={t('create.clientNew')} required error={state.fieldErrors?.clientName} className={mainAppFieldSpan.lg}>
          {(control) => (
            <Input
              {...control}
              name="clientName"
              placeholder={t('create.clientNameExample')}
              required
              maxLength={NAME_MAX}
              autoFocus
            />
          )}
        </Field>
      ) : (
        <Field label={t('create.clientSelect')} required error={state.fieldErrors?.clientId} className={mainAppFieldSpan.lg}>
          {(control) => (
            <Select name="clientId" required>
              <SelectTrigger id={control.id} aria-invalid={control['aria-invalid']}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}

      <Field label={t('create.nameLabel')} required error={state.fieldErrors?.name} className={mainAppFieldSpan.lg}>
        {(control) => (
          <Input
            {...control}
            name="name"
            placeholder={t('create.namePlaceholder')}
            required
            maxLength={NAME_MAX}
            autoFocus={clientMode !== 'new'}
          />
        )}
      </Field>

      <Field label={t('create.pricingModeLabel')} required className={mainAppFieldSpan.md}>
        {(control) => (
          <>
            <input type="hidden" name="pricingMode" value={pricingMode} />
            <Select value={pricingMode} onValueChange={(value) => setPricingMode(value as PricingMode)}>
              <SelectTrigger id={control.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">{t('pricing.fixed')}</SelectItem>
                <SelectItem value="open">{t('pricing.open')}</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      {pricingMode === 'fixed' ? (
        <div className={mainAppFieldSpan.full}>
        <ContractAmountFields
          baseCurrency={baseCurrency}
          currencySymbol={currencySymbol}
          amountError={state.fieldErrors?.priceAmount ?? state.fieldErrors?.contractValueAmount}
          taxModeError={state.fieldErrors?.amountIncludesTax}
          optional={false}
          taxRatePercent={taxRatePercent}
          showOpeningReduction={false}
          amountLabel={t('pricing.priceLabel')}
          amountDescription={t('pricing.priceHint')}
          amountPlaceholder={t('pricing.pricePlaceholder')}
          taxModeDescription={t('pricing.taxModeHint')}
        />
        </div>
      ) : (
        <Alert tone="info" className={mainAppFieldSpan.full}>{t('pricing.priceNotSet')}</Alert>
      )}

      <Field label={t('create.startDateLabel')} required error={state.fieldErrors?.startDate} className={mainAppFieldSpan.md}>
        {(control) => (
          <Input
            {...control}
            name="startDate"
            type="date"
            dir="ltr"
            required
            defaultValue={defaultStartDate}
          />
        )}
      </Field>

      {canAssignEmployees ? (
        <div className={mainAppFieldSpan.full}>
          <JobCreateEmployeePicker
            employees={employees}
            error={state.fieldErrors?.employeeIds}
          />
        </div>
      ) : null}

      <div className={mainAppFieldSpan.full}>
      <Button
        type="button"
        variant="ghost"
        className="self-start"
        onClick={() => setShowMore((open) => !open)}
      >
        {showMore ? tCommon('actions.showLess') : t('create.moreDetails')}
        <ChevronRight
          className={showMore ? 'size-4 rotate-90' : rtlFlipClassName('size-4')}
          aria-hidden
        />
      </Button>

      {showMore ? (
        <MainAppFormGrid dense className="border-t border-[var(--pf-border-default)] pt-4">
          <Field
            label={t('create.endDateLabel')}
            optionalLabel={tCommon('labels.optional')}
            error={state.fieldErrors?.targetEndDate}
            className={mainAppFieldSpan.md}
          >
            {(control) => <Input {...control} name="targetEndDate" type="date" dir="ltr" />}
          </Field>
          <Field
            label={t('create.notesLabel')}
            optionalLabel={tCommon('labels.optional')}
            error={state.fieldErrors?.notes}
            description={t('create.notesHint')}
            className={mainAppFieldSpan.full}
          >
            {(control) => (
              <Textarea
                {...control}
                name="notes"
                rows={2}
                placeholder={t('create.notesPlaceholder')}
              />
            )}
          </Field>
          <Field
            label={tCommon('labels.description')}
            optionalLabel={tCommon('labels.optional')}
            error={state.fieldErrors?.description}
            className={mainAppFieldSpan.full}
          >
            {(control) => <Textarea {...control} name="description" rows={2} />}
          </Field>
        </MainAppFormGrid>
      ) : null}
      </div>
      </MainAppFormGrid>

      <Button type="submit" loading={pending} block>
        {t('create.submit')}
      </Button>
    </form>
  );
}
