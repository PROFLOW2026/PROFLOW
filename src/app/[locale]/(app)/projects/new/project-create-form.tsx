'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { MoneyInput } from '@/components/patterns/money-input';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { createProjectAction, type ProjectFormState } from '../actions';

type ClientMode = 'none' | 'new' | 'existing';

interface ProjectCreateFormProps {
  baseCurrency: string;
  currencySymbol: string;
  clients: { id: string; name: string }[];
}

export function ProjectCreateForm({ baseCurrency, currencySymbol, clients }: ProjectCreateFormProps) {
  const t = useTranslations('projects');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<ProjectFormState, FormData>(
    createProjectAction,
    {},
  );
  const [clientMode, setClientMode] = useState<ClientMode>('none');
  const [showMore, setShowMore] = useState(false);
  const [contractValue, setContractValue] = useState('');

  return (
    <form action={formAction} className="mx-auto flex max-w-lg flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label={t('create.nameLabel')} required error={state.fieldErrors?.name}>
        {(control) => (
          <Input
            {...control}
            name="name"
            placeholder={t('create.namePlaceholder')}
            autoFocus
            required
          />
        )}
      </Field>

      <Field label={t('create.clientLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <>
            <input type="hidden" name="clientMode" value={clientMode} />
            <Select value={clientMode} onValueChange={(value) => setClientMode(value as ClientMode)}>
              <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('create.clientNone')}</SelectItem>
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
        <Field label={t('create.clientNew')} error={state.fieldErrors?.clientName}>
          {(control) => (
            <Input
              {...control}
              name="clientName"
              placeholder={t('create.clientNameExample')}
            />
          )}
        </Field>
      ) : null}

      {clientMode === 'existing' ? (
        <Field label={t('create.clientSelect')} error={state.fieldErrors?.clientId}>
          {(control) => (
            <Select name="clientId">
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
      ) : null}

      <Field
        label={t('create.contractValueLabel')}
        optionalLabel={tCommon('labels.optional')}
        error={state.fieldErrors?.contractValueAmount}
      >
        {(control) => (
          <>
            <input type="hidden" name="contractValueAmount" value={contractValue} />
            <input type="hidden" name="contractValueCurrency" value={baseCurrency} />
            <MoneyInput
              {...control}
              value={contractValue}
              onValueChange={setContractValue}
              currencySymbol={currencySymbol}
              placeholder={t('create.contractValuePlaceholder')}
            />
          </>
        )}
      </Field>

      <Field
        label={t('create.domainLabel')}
        optionalLabel={tCommon('labels.optional')}
        error={state.fieldErrors?.domainName}
      >
        {(control) => (
          <Input {...control} name="domainName" placeholder={t('create.domainPlaceholder')} />
        )}
      </Field>

      <Field
        label={t('create.locationLabel')}
        optionalLabel={tCommon('labels.optional')}
        error={state.fieldErrors?.location}
      >
        {(control) => (
          <Input {...control} name="location" placeholder={t('create.locationPlaceholder')} />
        )}
      </Field>

      <Button type="button" variant="ghost" onClick={() => setShowMore((open) => !open)}>
        {t('create.moreDetails')}
      </Button>

      {showMore ? (
        <div className="flex flex-col gap-4 border-t border-[var(--pf-border-default)] pt-4">
          <Field
            label={t('details.descriptionLabel')}
            optionalLabel={tCommon('labels.optional')}
            error={state.fieldErrors?.description}
          >
            {(control) => <Textarea {...control} name="description" rows={3} />}
          </Field>
          <Field
            label={t('details.startDate')}
            optionalLabel={tCommon('labels.optional')}
            error={state.fieldErrors?.startDate}
          >
            {(control) => <Input {...control} name="startDate" type="date" />}
          </Field>
          <Field
            label={t('details.targetEndDate')}
            optionalLabel={tCommon('labels.optional')}
            error={state.fieldErrors?.targetEndDate}
          >
            {(control) => <Input {...control} name="targetEndDate" type="date" />}
          </Field>
          <Field
            label={t('details.notesLabel')}
            optionalLabel={tCommon('labels.optional')}
            error={state.fieldErrors?.notes}
          >
            {(control) => <Textarea {...control} name="notes" rows={2} />}
          </Field>
        </div>
      ) : null}

      <Button type="submit" loading={pending} block>
        {t('create.submit')}
      </Button>
    </form>
  );
}
