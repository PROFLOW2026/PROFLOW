'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  RECURRENCE_FREQUENCIES,
  type RecurrenceFrequency,
  type RecurrencePricingMode,
} from '@/modules/service/recurrence/domain/types';

export interface RecurrenceFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
  generatedCount?: number;
}

const NONE = '__none__';

interface RecurrenceCreateFormProps {
  clients: readonly { id: string; name: string }[];
  employees: readonly { id: string; name: string }[];
  baseCurrency: string;
  defaultStartDate: string;
  action: (prev: RecurrenceFormState, formData: FormData) => Promise<RecurrenceFormState>;
}

export function RecurrenceCreateForm({
  clients,
  employees,
  baseCurrency,
  defaultStartDate,
  action,
}: RecurrenceCreateFormProps) {
  const t = useTranslations('service.recurring');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState(action, {} as RecurrenceFormState);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('monthly');
  const [pricingMode, setPricingMode] = useState<RecurrencePricingMode>('none');
  const [clientId, setClientId] = useState(NONE);
  const [assigneeId, setAssigneeId] = useState(NONE);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label={t('fields.title')} error={state.fieldErrors?.title}>
        {(control) => <Input {...control} name="title" required maxLength={200} autoComplete="off" />}
      </Field>

      <Field label={t('fields.client')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <>
            <input type="hidden" name="clientId" value={clientId === NONE ? '' : clientId} />
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger id={control.id}>
                <SelectValue placeholder={t('fields.noClient')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('fields.noClient')}</SelectItem>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      <Field label={t('fields.siteAddress')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <Input {...control} name="siteAddress" maxLength={500} autoComplete="street-address" />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('fields.frequency')}>
          {(control) => (
            <>
              <input type="hidden" name="frequency" value={frequency} />
              <Select
                value={frequency}
                onValueChange={(value) => setFrequency(value as RecurrenceFrequency)}
              >
                <SelectTrigger id={control.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECURRENCE_FREQUENCIES.map((freq) => (
                    <SelectItem key={freq} value={freq}>
                      {t(`frequency.${freq}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </Field>

        <Field label={t('fields.intervalCount')}>
          {(control) => (
            <Input {...control} name="intervalCount" type="number" min={1} max={365} defaultValue={1} />
          )}
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('fields.startDate')} error={state.fieldErrors?.startDate}>
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
        <Field
          label={t('fields.endDate')}
          optionalLabel={tCommon('labels.optional')}
          error={state.fieldErrors?.endDate}
        >
          {(control) => <Input {...control} name="endDate" type="date" dir="ltr" />}
        </Field>
      </div>

      <Field label={t('fields.durationMinutes')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <Input {...control} name="defaultDurationMinutes" type="number" min={15} max={1440} step={15} />
        )}
      </Field>

      <Field label={t('fields.pricingMode')}>
        {(control) => (
          <>
            <input type="hidden" name="defaultPricingMode" value={pricingMode} />
            <Select
              value={pricingMode}
              onValueChange={(value) => setPricingMode(value as RecurrencePricingMode)}
            >
              <SelectTrigger id={control.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('fields.pricing.none')}</SelectItem>
                <SelectItem value="fixed">{t('fields.pricing.fixed')}</SelectItem>
                <SelectItem value="open">{t('fields.pricing.open')}</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      {pricingMode === 'fixed' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('fields.priceAmount')} error={state.fieldErrors?.defaultPriceAmount}>
            {(control) => <Input {...control} name="defaultPriceAmount" inputMode="decimal" required />}
          </Field>
          <Field label={t('fields.currency')}>
            {(control) => (
              <Input {...control} name="currency" defaultValue={baseCurrency} maxLength={3} dir="ltr" />
            )}
          </Field>
        </div>
      ) : (
        <input type="hidden" name="currency" value={baseCurrency} />
      )}

      <Field label={t('fields.assignee')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <>
            <input
              type="hidden"
              name="defaultAssigneeEmployeeId"
              value={assigneeId === NONE ? '' : assigneeId}
            />
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger id={control.id}>
                <SelectValue placeholder={t('fields.noAssignee')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('fields.noAssignee')}</SelectItem>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      <Field label={t('fields.checklistTemplateId')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <Input {...control} name="defaultChecklistTemplateId" placeholder="UUID" autoComplete="off" dir="ltr" />
        )}
      </Field>

      <Field label={t('fields.notes')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Textarea {...control} name="notes" rows={3} maxLength={2000} />}
      </Field>

      <Button type="submit" disabled={pending} className="min-h-11 w-full sm:w-auto">
        {pending ? tCommon('actions.saving') : t('create.submit')}
      </Button>
    </form>
  );
}
