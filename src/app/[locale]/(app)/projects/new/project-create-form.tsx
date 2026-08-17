'use client';

import { ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useActionState, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { pickPracticalClientContact } from '@/modules/clients/domain/practical-contact';
import type { ClientContactRecord } from '@/modules/clients/domain/types';
import {
  PROJECT_TEMPLATE_KEYS,
  previewProjectTemplate,
  type ProjectTemplateKey,
} from '@/modules/projects/domain/templates';
import { ContractAmountFields } from '@/modules/projects/ui/contract-amount-fields';
import { rtlFlipClassName } from '@/shared/i18n/ltr-island';
import { createProjectAction, type ProjectFormState } from '../actions';

type ClientMode = 'none' | 'new' | 'existing';
type ContactMode = 'none' | 'existing' | 'new';

export interface ProjectCreateClientOption {
  id: string;
  name: string;
  contacts: {
    id: string;
    name: string;
    phone: string | null;
    role: string;
    createdAt?: string;
  }[];
}

interface ProjectCreateFormProps {
  baseCurrency: string;
  currencySymbol: string;
  clients: ProjectCreateClientOption[];
  taxRatePercent?: string | null;
}

function suggestContactId(contacts: ProjectCreateClientOption['contacts']): string {
  if (contacts.length === 0) return '';
  const mapped: ClientContactRecord[] = contacts.map((contact) => ({
    id: contact.id,
    organizationId: '00000000-0000-4000-8000-000000000000',
    clientId: '00000000-0000-4000-8000-000000000001',
    name: contact.name,
    role: (contact.role as ClientContactRecord['role']) ?? 'other',
    email: null,
    phone: contact.phone,
    notes: null,
    createdAt: contact.createdAt ? new Date(contact.createdAt) : new Date(0),
    updatedAt: new Date(0),
  }));
  return pickPracticalClientContact(mapped)?.id ?? '';
}

export function ProjectCreateForm({
  baseCurrency,
  currencySymbol,
  clients,
  taxRatePercent = null,
}: ProjectCreateFormProps) {
  const t = useTranslations('projects');
  const tCommon = useTranslations('common');
  const locale = useLocale() === 'he-IL' ? 'he-IL' : 'en';
  const [state, formAction, pending] = useActionState<ProjectFormState, FormData>(
    createProjectAction,
    {},
  );
  const [clientMode, setClientMode] = useState<ClientMode>('none');
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [contactMode, setContactMode] = useState<ContactMode>('none');
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [showMore, setShowMore] = useState(false);
  const [templateKey, setTemplateKey] = useState<string>('none');

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId) ?? null,
    [clients, selectedClientId],
  );
  const templatePreview = useMemo(
    () =>
      templateKey !== 'none'
        ? previewProjectTemplate(templateKey as ProjectTemplateKey, locale)
        : null,
    [templateKey, locale],
  );

  return (
    <form action={formAction} className="mx-auto flex w-full min-w-0 max-w-lg flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field
        label={t('create.fromTemplate')}
        optionalLabel={tCommon('labels.optional')}
        description={t('create.templateHint')}
      >
        {(control) => (
          <>
            <input type="hidden" name="templateKey" value={templateKey} />
            <Select value={templateKey} onValueChange={setTemplateKey}>
              <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('create.templateNone')}</SelectItem>
                {PROJECT_TEMPLATE_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {t(`templates.keys.${key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      {templatePreview ? (
        <div className="rounded-md border border-[var(--pf-border-default)] p-3 text-sm text-[var(--pf-text-secondary)]">
          <p>{templatePreview.description}</p>
          <p className="mt-2">
            <span className="font-medium text-[var(--pf-text-primary)]">
              {t('templates.previewPackages')}:{' '}
            </span>
            {templatePreview.workPackageNames.join(', ')}
          </p>
          {templatePreview.folderNames.length > 0 ? (
            <p className="mt-1">
              <span className="font-medium text-[var(--pf-text-primary)]">
                {t('templates.previewFolders')}:{' '}
              </span>
              {templatePreview.folderNames.join(', ')}
            </p>
          ) : null}
        </div>
      ) : null}

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
            <Select
              value={clientMode}
              onValueChange={(value) => {
                setClientMode(value as ClientMode);
                setSelectedClientId('');
                setContactMode('none');
                setSelectedContactId('');
              }}
            >
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
        <div className="flex flex-col gap-4 rounded-md border border-[var(--pf-border-default)] p-3">
          <Field label={t('create.clientNew')} error={state.fieldErrors?.clientName}>
            {(control) => (
              <Input {...control} name="clientName" placeholder={t('create.clientNameExample')} />
            )}
          </Field>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('create.contactPersonHint')}</p>
          <Field
            label={t('create.contactNameLabel')}
            optionalLabel={tCommon('labels.optional')}
            error={state.fieldErrors?.contactName}
          >
            {(control) => (
              <Input
                {...control}
                name="contactName"
                placeholder={t('create.contactNamePlaceholder')}
              />
            )}
          </Field>
          <Field
            label={t('create.contactPhoneLabel')}
            optionalLabel={tCommon('labels.optional')}
            error={state.fieldErrors?.contactPhone}
          >
            {(control) => (
              <Input
                {...control}
                name="contactPhone"
                type="tel"
                dir="ltr"
                placeholder={t('create.contactPhonePlaceholder')}
              />
            )}
          </Field>
          <Field
            label={t('create.contactEmailLabel')}
            optionalLabel={tCommon('labels.optional')}
            error={state.fieldErrors?.contactEmail}
          >
            {(control) => <Input {...control} name="contactEmail" type="email" dir="ltr" />}
          </Field>
        </div>
      ) : null}

      {clientMode === 'existing' ? (
        <div className="flex flex-col gap-4">
          <Field label={t('create.clientSelect')} error={state.fieldErrors?.clientId}>
            {(control) => (
              <Select
                name="clientId"
                value={selectedClientId || undefined}
                onValueChange={(value) => {
                  setSelectedClientId(value);
                  const client = clients.find((row) => row.id === value);
                  const suggested = client ? suggestContactId(client.contacts) : '';
                  if (suggested) {
                    setContactMode('existing');
                    setSelectedContactId(suggested);
                  } else {
                    setContactMode('none');
                    setSelectedContactId('');
                  }
                }}
              >
                <SelectTrigger id={control.id} aria-invalid={control['aria-invalid']}>
                  <SelectValue placeholder={t('create.clientSelect')} />
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

          {selectedClientId ? (
            <div className="flex flex-col gap-4 rounded-md border border-[var(--pf-border-default)] p-3">
              <p className="text-sm font-medium">{t('create.contactPersonLabel')}</p>
              <p className="text-sm text-[var(--pf-text-secondary)]">{t('create.contactPersonHint')}</p>
              <input type="hidden" name="contactMode" value={contactMode} />
              <Field label={t('create.contactModeLabel')}>
                {(control) => (
                  <Select
                    value={contactMode}
                    onValueChange={(value) => {
                      const mode = value as ContactMode;
                      setContactMode(mode);
                      if (mode === 'existing' && selectedClient) {
                        setSelectedContactId(suggestContactId(selectedClient.contacts));
                      } else {
                        setSelectedContactId('');
                      }
                    }}
                  >
                    <SelectTrigger id={control.id}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('create.contactNone')}</SelectItem>
                      {(selectedClient?.contacts.length ?? 0) > 0 ? (
                        <SelectItem value="existing">{t('create.contactSelect')}</SelectItem>
                      ) : null}
                      <SelectItem value="new">{t('create.contactQuickAdd')}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </Field>

              {contactMode === 'existing' && selectedClient ? (
                <Field label={t('create.contactSelect')} error={state.fieldErrors?.contactId}>
                  {(control) => (
                    <Select
                      name="contactId"
                      value={selectedContactId || undefined}
                      onValueChange={setSelectedContactId}
                    >
                      <SelectTrigger id={control.id} aria-invalid={control['aria-invalid']}>
                        <SelectValue placeholder={t('create.contactSelect')} />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedClient.contacts.map((contact) => (
                          <SelectItem key={contact.id} value={contact.id}>
                            {contact.name}
                            {contact.phone ? ` · ${contact.phone}` : ''}
                            {contact.role === 'primary'
                              ? ` (${t('create.contactClientPrimaryHint')})`
                              : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </Field>
              ) : null}

              {contactMode === 'new' ? (
                <>
                  <Field label={t('create.contactNameLabel')} error={state.fieldErrors?.contactName}>
                    {(control) => (
                      <Input
                        {...control}
                        name="contactName"
                        required
                        placeholder={t('create.contactNamePlaceholder')}
                      />
                    )}
                  </Field>
                  <Field
                    label={t('create.contactPhoneLabel')}
                    error={state.fieldErrors?.contactPhone}
                  >
                    {(control) => (
                      <Input
                        {...control}
                        name="contactPhone"
                        type="tel"
                        dir="ltr"
                        required
                        placeholder={t('create.contactPhonePlaceholder')}
                      />
                    )}
                  </Field>
                  <Field
                    label={t('create.contactEmailLabel')}
                    optionalLabel={tCommon('labels.optional')}
                    error={state.fieldErrors?.contactEmail}
                  >
                    {(control) => (
                      <Input {...control} name="contactEmail" type="email" dir="ltr" />
                    )}
                  </Field>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <ContractAmountFields
        baseCurrency={baseCurrency}
        currencySymbol={currencySymbol}
        amountError={state.fieldErrors?.contractValueAmount}
        taxModeError={state.fieldErrors?.amountIncludesTax}
        reductionError={state.fieldErrors?.openingReductionAmount}
        taxRatePercent={taxRatePercent}
      />

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
            {(control) => <Input {...control} name="startDate" type="date" dir="ltr" />}
          </Field>
          <Field
            label={t('details.targetEndDate')}
            optionalLabel={tCommon('labels.optional')}
            error={state.fieldErrors?.targetEndDate}
          >
            {(control) => <Input {...control} name="targetEndDate" type="date" dir="ltr" />}
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
