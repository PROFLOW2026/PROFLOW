'use client';

import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
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

  return (
    <form action={formAction} className="mx-auto flex w-full max-w-lg flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label={t('create.clientLabel')} required error={state.fieldErrors?.clientId ?? state.fieldErrors?.clientName}>
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
        <Field label={t('create.clientNew')} required error={state.fieldErrors?.clientName}>
          {(control) => (
            <Input
              {...control}
              name="clientName"
              placeholder={t('create.clientNameExample')}
              required
              autoFocus
            />
          )}
        </Field>
      ) : (
        <Field label={t('create.clientSelect')} required error={state.fieldErrors?.clientId}>
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

      <Field label={t('create.nameLabel')} required error={state.fieldErrors?.name}>
        {(control) => (
          <Input
            {...control}
            name="name"
            placeholder={t('create.namePlaceholder')}
            required
            autoFocus={clientMode !== 'new'}
          />
        )}
      </Field>

      <Field label={t('create.pricingModeLabel')} required>
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
      ) : (
        <Alert tone="info">{t('pricing.priceNotSet')}</Alert>
      )}

      <Field label={t('create.startDateLabel')} required error={state.fieldErrors?.startDate}>
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
        <JobCreateEmployeePicker
          employees={employees}
          error={state.fieldErrors?.employeeIds}
        />
      ) : null}

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
        <div className="flex flex-col gap-4 border-t border-[var(--pf-border-default)] pt-4">
          <Field
            label={t('create.endDateLabel')}
            optionalLabel={tCommon('labels.optional')}
            error={state.fieldErrors?.targetEndDate}
          >
            {(control) => <Input {...control} name="targetEndDate" type="date" dir="ltr" />}
          </Field>
          <Field
            label={t('create.notesLabel')}
            optionalLabel={tCommon('labels.optional')}
            error={state.fieldErrors?.notes}
            description={t('create.notesHint')}
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
          >
            {(control) => <Textarea {...control} name="description" rows={2} />}
          </Field>
        </div>
      ) : null}

      <Button type="submit" loading={pending} block>
        {t('create.submit')}
      </Button>
    </form>
  );
}
