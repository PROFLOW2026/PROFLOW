'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ContractAmountFields } from '@/modules/projects/ui/contract-amount-fields';
import { WorkOrderChecklistField } from '@/modules/service/ui/work-order-checklist-field';
import { createWorkOrderAction, type WorkOrderFormState } from '../actions';

type ClientMode = 'new' | 'existing';
type PricingMode = 'fixed' | 'open';

interface WorkOrderCreateFormProps {
  baseCurrency: string;
  currencySymbol: string;
  clients: { id: string; name: string }[];
  employees: { id: string; name: string }[];
  checklistTemplates: { id: string; name: string }[];
  defaultRequestedDate: string;
  taxRatePercent?: string | null;
}

export function WorkOrderCreateForm({
  baseCurrency,
  currencySymbol,
  clients,
  employees,
  checklistTemplates,
  defaultRequestedDate,
  taxRatePercent = null,
}: WorkOrderCreateFormProps) {
  const t = useTranslations('service');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<WorkOrderFormState, FormData>(
    createWorkOrderAction,
    {},
  );
  const [clientMode, setClientMode] = useState<ClientMode>('new');
  const [pricingMode, setPricingMode] = useState<PricingMode>('fixed');

  return (
    <form action={formAction} className="mx-auto flex w-full max-w-lg flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field
        label={t('create.customerLabel')}
        required
        error={state.fieldErrors?.clientId ?? state.fieldErrors?.clientName}
      >
        {(control) => (
          <>
            <input type="hidden" name="clientMode" value={clientMode} />
            <Select value={clientMode} onValueChange={(value) => setClientMode(value as ClientMode)}>
              <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">{t('create.customerNew')}</SelectItem>
                {clients.length > 0 ? (
                  <SelectItem value="existing">{t('create.customerSelect')}</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      {clientMode === 'new' ? (
        <Field label={t('create.customerNew')} required error={state.fieldErrors?.clientName}>
          {(control) => (
            <Input {...control} name="clientName" required autoFocus placeholder={t('create.customerExample')} />
          )}
        </Field>
      ) : (
        <Field label={t('create.customerSelect')} required error={state.fieldErrors?.clientId}>
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
            required
            placeholder={t('create.namePlaceholder')}
            autoFocus={clientMode !== 'new'}
          />
        )}
      </Field>

      <Field
        label={t('create.siteLabel')}
        optionalLabel={tCommon('labels.optional')}
        error={state.fieldErrors?.siteAddress}
      >
        {(control) => <Input {...control} name="siteAddress" />}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t('create.contactNameLabel')}
          optionalLabel={tCommon('labels.optional')}
          error={state.fieldErrors?.contactName}
        >
          {(control) => <Input {...control} name="contactName" />}
        </Field>
        <Field
          label={t('create.contactPhoneLabel')}
          optionalLabel={tCommon('labels.optional')}
          error={state.fieldErrors?.contactPhone}
        >
          {(control) => <Input {...control} name="contactPhone" dir="ltr" />}
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t('create.categoryLabel')}
          optionalLabel={tCommon('labels.optional')}
          error={state.fieldErrors?.category}
        >
          {(control) => <Input {...control} name="category" />}
        </Field>
        <Field label={t('create.priorityLabel')} error={state.fieldErrors?.priority}>
          {(control) => (
            <Select name="priority" defaultValue="normal">
              <SelectTrigger id={control.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['low', 'normal', 'high', 'urgent'] as const).map((priority) => (
                  <SelectItem key={priority} value={priority}>
                    {t(`priority.${priority}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      </div>

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

      <Field
        label={t('create.requestedDateLabel')}
        optionalLabel={tCommon('labels.optional')}
        error={state.fieldErrors?.requestedDate}
      >
        {(control) => (
          <Input
            {...control}
            name="requestedDate"
            type="date"
            dir="ltr"
            defaultValue={defaultRequestedDate}
          />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t('create.windowStartLabel')}
          optionalLabel={tCommon('labels.optional')}
          error={state.fieldErrors?.scheduledStartAt}
        >
          {(control) => <Input {...control} name="scheduledStartAt" type="datetime-local" dir="ltr" />}
        </Field>
        <Field
          label={t('create.windowEndLabel')}
          optionalLabel={tCommon('labels.optional')}
          error={state.fieldErrors?.scheduledEndAt}
        >
          {(control) => <Input {...control} name="scheduledEndAt" type="datetime-local" dir="ltr" />}
        </Field>
      </div>

      {employees.length > 0 ? (
        <Field
          label={t('create.assigneeLabel')}
          optionalLabel={tCommon('labels.optional')}
          error={state.fieldErrors?.assigneeEmployeeId}
          description={t('create.assigneeHint')}
        >
          {(control) => (
            <Select name="assigneeEmployeeId">
              <SelectTrigger id={control.id}>
                <SelectValue placeholder={t('create.assigneeNone')} />
              </SelectTrigger>
              <SelectContent>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      ) : null}

      <WorkOrderChecklistField
        templates={checklistTemplates}
        error={state.fieldErrors?.checklistTemplateId}
      />

      <Field
        label={tCommon('labels.description')}
        optionalLabel={tCommon('labels.optional')}
        error={state.fieldErrors?.description}
      >
        {(control) => <Textarea {...control} name="description" rows={2} />}
      </Field>

      <Field
        label={t('create.notesLabel')}
        optionalLabel={tCommon('labels.optional')}
        error={state.fieldErrors?.serviceNotes}
      >
        {(control) => <Textarea {...control} name="serviceNotes" rows={2} />}
      </Field>

      <Button type="submit" loading={pending} block>
        {t('create.submit')}
      </Button>
    </form>
  );
}
