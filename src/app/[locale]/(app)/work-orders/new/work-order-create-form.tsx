'use client';

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
import { WorkOrderChecklistField } from '@/modules/service/ui/work-order-checklist-field';
import { createWorkOrderAction, type WorkOrderFormState } from '../actions';

type ClientMode = 'new' | 'existing';
type PricingMode = 'fixed' | 'open';

const NAME_MAX = 200;

function showValidationBanner(state: WorkOrderFormState): boolean {
  if (!state.error) return false;
  const messages = Object.values(state.fieldErrors ?? {});
  if (messages.length > 0 && messages.every((message) => message === state.error)) return false;
  return true;
}

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
      <Field
        label={t('create.customerLabel')}
        required
        error={state.fieldErrors?.clientId ?? state.fieldErrors?.clientName}
        className={mainAppFieldSpan.lg}
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
        <Field label={t('create.customerNew')} required error={state.fieldErrors?.clientName} className={mainAppFieldSpan.lg}>
          {(control) => (
            <Input
              {...control}
              name="clientName"
              required
              maxLength={NAME_MAX}
              autoFocus
              placeholder={t('create.customerExample')}
            />
          )}
        </Field>
      ) : (
        <Field label={t('create.customerSelect')} required error={state.fieldErrors?.clientId} className={mainAppFieldSpan.lg}>
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
            required
            maxLength={NAME_MAX}
            placeholder={t('create.namePlaceholder')}
            autoFocus={clientMode !== 'new'}
          />
        )}
      </Field>

      <Field
        label={t('create.siteLabel')}
        optionalLabel={tCommon('labels.optional')}
        error={state.fieldErrors?.siteAddress}
        className={mainAppFieldSpan.lg}
      >
        {(control) => <Input {...control} name="siteAddress" />}
      </Field>

        <Field
          label={t('create.contactNameLabel')}
          optionalLabel={tCommon('labels.optional')}
          error={state.fieldErrors?.contactName}
          className={mainAppFieldSpan.lg}
        >
          {(control) => <Input {...control} name="contactName" />}
        </Field>
        <Field
          label={t('create.contactPhoneLabel')}
          optionalLabel={tCommon('labels.optional')}
          error={state.fieldErrors?.contactPhone}
          className={mainAppFieldSpan.md}
        >
          {(control) => <Input {...control} name="contactPhone" dir="ltr" />}
        </Field>

        <Field
          label={t('create.categoryLabel')}
          optionalLabel={tCommon('labels.optional')}
          error={state.fieldErrors?.category}
          className={mainAppFieldSpan.lg}
        >
          {(control) => <Input {...control} name="category" />}
        </Field>
        <Field label={t('create.priorityLabel')} error={state.fieldErrors?.priority} className={mainAppFieldSpan.md}>
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

      <Field
        label={t('create.requestedDateLabel')}
        optionalLabel={tCommon('labels.optional')}
        error={state.fieldErrors?.requestedDate}
        className={mainAppFieldSpan.md}
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

        <Field
          label={t('create.windowStartLabel')}
          optionalLabel={tCommon('labels.optional')}
          error={state.fieldErrors?.scheduledStartAt}
          className={mainAppFieldSpan.lg}
        >
          {(control) => <Input {...control} name="scheduledStartAt" type="datetime-local" dir="ltr" />}
        </Field>
        <Field
          label={t('create.windowEndLabel')}
          optionalLabel={tCommon('labels.optional')}
          error={state.fieldErrors?.scheduledEndAt}
          className={mainAppFieldSpan.lg}
        >
          {(control) => <Input {...control} name="scheduledEndAt" type="datetime-local" dir="ltr" />}
        </Field>

      {employees.length > 0 ? (
        <Field
          label={t('create.assigneeLabel')}
          optionalLabel={tCommon('labels.optional')}
          error={state.fieldErrors?.assigneeEmployeeId}
          description={t('create.assigneeHint')}
          className={mainAppFieldSpan.lg}
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

      <div className={mainAppFieldSpan.full}>
        <WorkOrderChecklistField
          templates={checklistTemplates}
          error={state.fieldErrors?.checklistTemplateId}
        />
      </div>

      <Field
        label={tCommon('labels.description')}
        optionalLabel={tCommon('labels.optional')}
        error={state.fieldErrors?.description}
        className={mainAppFieldSpan.full}
      >
        {(control) => <Textarea {...control} name="description" rows={2} />}
      </Field>

      <Field
        label={t('create.notesLabel')}
        optionalLabel={tCommon('labels.optional')}
        error={state.fieldErrors?.serviceNotes}
        className={mainAppFieldSpan.full}
      >
        {(control) => <Textarea {...control} name="serviceNotes" rows={2} />}
      </Field>
      </MainAppFormGrid>

      <Button type="submit" loading={pending} block>
        {t('create.submit')}
      </Button>
    </form>
  );
}
