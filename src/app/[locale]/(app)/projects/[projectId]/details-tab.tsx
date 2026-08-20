'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { resolveDisplayOriginalEntered } from '@/modules/projects/domain/entry-baseline';
import { PROJECT_STATUSES } from '@/modules/projects/domain/types';
import type { ProjectDetail } from '@/modules/projects/application/get-project-detail';
import { ContractAmountFields } from '@/modules/projects/ui/contract-amount-fields';
import { PROJECT_EXPERIENCE_PROFILE_KEYS } from '@/modules/tenancy/domain/project-profiles';
import { type CustomFieldValueView } from '@/modules/custom-fields/domain/types';
import { EntityCustomFieldsPanel } from '@/modules/custom-fields/ui';
import { Link } from '@/shared/i18n/navigation';
import { upsertEntityFieldValueAction } from '../../settings/custom-fields/actions';
import { updateProjectAction, type ProjectFormState } from '../actions';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

type ContactMode = 'none' | 'existing' | 'new';

interface DetailsTabProps {
  detail: ProjectDetail;
  clients: {
    id: string;
    name: string;
    contacts: { id: string; name: string; phone: string | null; role: string }[];
  }[];
  baseCurrency: string;
  currencySymbol: string;
  canManageContract: boolean;
  customFields?: CustomFieldValueView[];
  taxRatePercent?: string | null;
  showOpeningReduction?: boolean;
  customFieldsRevalidatePath?: string;
  amountLabel?: string;
  amountDescription?: string;
  amountPlaceholder?: string;
  taxModeDescription?: string;
}

function stripStorageScale(raw: string): string {
  if (!raw) return '';
  return raw.replace(/\.?0+$/, '') === ''
    ? raw
    : raw.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

function displayEnteredAmount(detail: ProjectDetail): string {
  const contract = detail.contract;
  if (!contract) return '';
  const raw =
    resolveDisplayOriginalEntered(contract) ??
    contract.enteredValueAmount ??
    contract.originalValueAmount ??
    '';
  return stripStorageScale(raw);
}

function displayOpeningReduction(detail: ProjectDetail): string {
  const raw = detail.contract?.openingReductionEnteredAmount ?? '';
  return stripStorageScale(raw);
}

export function DetailsTab({
  detail,
  clients,
  baseCurrency,
  currencySymbol,
  canManageContract,
  customFields = [],
  taxRatePercent = null,
  showOpeningReduction = true,
  customFieldsRevalidatePath,
  amountLabel,
  amountDescription,
  amountPlaceholder,
  taxModeDescription,
}: DetailsTabProps) {
  const t = useTranslations('projects.details');
  const tCreate = useTranslations('projects.create');
  const tStatus = useTranslations('status.project');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<ProjectFormState, FormData>(
    updateProjectAction,
    {},
  );

  const { project } = detail;
  const [selectedClientId, setSelectedClientId] = useState<string>(project.clientId ?? 'none');
  const [contactMode, setContactMode] = useState<ContactMode>(
    project.primaryContactId ? 'existing' : 'none',
  );
  const [selectedContactId, setSelectedContactId] = useState<string>(
    project.primaryContactId ?? '',
  );

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId) ?? null,
    [clients, selectedClientId],
  );

  const currency = detail.contract?.currency ?? project.currency ?? baseCurrency;
  const fieldsRevalidatePath = customFieldsRevalidatePath ?? `/projects/${project.id}`;
  const isClassicProject = project.workKind === 'project';
  const [statusValue, setStatusValue] = useState(project.status);
  const [experienceProfileValue, setExperienceProfileValue] = useState(
    project.experienceProfile ?? 'auto',
  );

  return (
    <>
      <form
        action={formAction}
        className="mx-auto flex max-w-xl flex-col gap-4"
      >
        <input type="hidden" name="projectId" value={project.id} />
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

        <Field label={tCommon('labels.name')} required error={state.fieldErrors?.name}>
          {(control) => <Input {...control} name="name" defaultValue={project.name} required />}
        </Field>

        <Field label={t('experienceProfileLabel')} optionalLabel={tCommon('labels.optional')}>
          {(control) => (
            <Select
              name="experienceProfile"
              value={experienceProfileValue}
              onValueChange={setExperienceProfileValue}
            >
              <SelectTrigger id={control.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t('experienceProfiles.auto')}</SelectItem>
                {PROJECT_EXPERIENCE_PROFILE_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {t(`experienceProfiles.${key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        <Field label={t('statusLabel')}>
          {(control) =>
            isClassicProject && project.status === 'completed' ? (
              <>
                <input type="hidden" name="status" value="completed" />
                <p id={control.id} className="text-sm">
                  {tStatus('closed')}
                </p>
              </>
            ) : (
              <Select
                name="status"
                value={statusValue}
                onValueChange={(value) => setStatusValue(value as (typeof PROJECT_STATUSES)[number])}
              >
                <SelectTrigger id={control.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_STATUSES.filter((status) => {
                    if (status === 'archived') return false;
                    if (isClassicProject && status === 'completed') return false;
                    return true;
                  }).map((status) => (
                    <SelectItem key={status} value={status}>
                      {tStatus(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )
          }
        </Field>
        {isClassicProject ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">
            {project.status === 'completed' ? t('closeoutClosedHint') : t('closeoutUseTab')}{' '}
            <Link href={`/projects/${project.id}?tab=closeout`} className={cn(textNavLinkClassName, 'text-sm')}>
              {t('closeoutTabLink')}
            </Link>
          </p>
        ) : null}

        <Field label={t('clientLabel')} optionalLabel={tCommon('labels.optional')}>
          {(control) => (
            <Select
              name="clientId"
              value={selectedClientId}
              onValueChange={(value) => {
                setSelectedClientId(value);
                setContactMode('none');
                setSelectedContactId('');
              }}
            >
              <SelectTrigger id={control.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{tCommon('labels.none')}</SelectItem>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        {selectedClientId !== 'none' ? (
          <div className="flex flex-col gap-4 rounded-md border border-[var(--pf-border-default)] p-3">
            <p className="text-sm font-medium">{t('contactPersonLabel')}</p>
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('contactPersonHint')}</p>
            <input type="hidden" name="contactMode" value={contactMode} />
            <Field label={tCreate('contactModeLabel')}>
              {(control) => (
                <Select
                  value={contactMode}
                  onValueChange={(value) => {
                    const mode = value as ContactMode;
                    setContactMode(mode);
                    if (mode !== 'existing') setSelectedContactId('');
                  }}
                >
                  <SelectTrigger id={control.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{tCreate('contactNone')}</SelectItem>
                    {(selectedClient?.contacts.length ?? 0) > 0 ? (
                      <SelectItem value="existing">{tCreate('contactSelect')}</SelectItem>
                    ) : null}
                    <SelectItem value="new">{tCreate('contactQuickAdd')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </Field>

            {contactMode === 'existing' && selectedClient ? (
              <Field label={t('contactPersonLabel')} error={state.fieldErrors?.primaryContactId}>
                {(control) => (
                  <Select
                    name="primaryContactId"
                    value={selectedContactId || undefined}
                    onValueChange={setSelectedContactId}
                  >
                    <SelectTrigger id={control.id} aria-invalid={control['aria-invalid']}>
                      <SelectValue placeholder={tCreate('contactSelect')} />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedClient.contacts.map((contact) => (
                        <SelectItem key={contact.id} value={contact.id}>
                          {contact.name}
                          {contact.phone ? ` · ${contact.phone}` : ''}
                          {contact.role === 'primary'
                            ? ` (${tCreate('contactClientPrimaryHint')})`
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
                <Field label={tCreate('contactNameLabel')} error={state.fieldErrors?.contactName}>
                  {(control) => (
                    <Input
                      {...control}
                      name="contactName"
                      required
                      placeholder={tCreate('contactNamePlaceholder')}
                    />
                  )}
                </Field>
                <Field label={tCreate('contactPhoneLabel')} error={state.fieldErrors?.contactPhone}>
                  {(control) => (
                    <Input
                      {...control}
                      name="contactPhone"
                      type="tel"
                      dir="ltr"
                      required
                      placeholder={tCreate('contactPhonePlaceholder')}
                    />
                  )}
                </Field>
                <Field
                  label={tCreate('contactEmailLabel')}
                  optionalLabel={tCommon('labels.optional')}
                  error={state.fieldErrors?.contactEmail}
                >
                  {(control) => <Input {...control} name="contactEmail" type="email" dir="ltr" />}
                </Field>
              </>
            ) : null}
          </div>
        ) : (
          <input type="hidden" name="contactMode" value="none" />
        )}

        {canManageContract ? (
          <ContractAmountFields
            baseCurrency={currency}
            currencySymbol={currencySymbol}
            initialAmount={displayEnteredAmount(detail)}
            initialIncludesTax={detail.contract?.amountIncludesTax ?? false}
            initialOpeningReduction={showOpeningReduction ? displayOpeningReduction(detail) : ''}
            amountError={state.fieldErrors?.contractValueAmount}
            taxModeError={state.fieldErrors?.amountIncludesTax}
            reductionError={state.fieldErrors?.openingReductionAmount}
            locked={detail.originalContractAmountLocked}
            taxRatePercent={taxRatePercent}
            showOpeningReduction={showOpeningReduction}
            amountLabel={amountLabel}
            amountDescription={amountDescription}
            amountPlaceholder={amountPlaceholder}
            taxModeDescription={taxModeDescription}
          />
        ) : null}

        <Field label={t('domainLabel')} optionalLabel={tCommon('labels.optional')}>
          {(control) => (
            <Input {...control} name="domainName" defaultValue={detail.domainName ?? ''} />
          )}
        </Field>

        <Field label={t('locationLabel')} optionalLabel={tCommon('labels.optional')}>
          {(control) => (
            <Input {...control} name="location" defaultValue={project.location ?? ''} />
          )}
        </Field>

        <Field label={t('startDate')} optionalLabel={tCommon('labels.optional')}>
          {(control) => (
            <Input
              {...control}
              name="startDate"
              type="date"
              defaultValue={project.startDate ?? ''}
            />
          )}
        </Field>

        <Field label={t('targetEndDate')} optionalLabel={tCommon('labels.optional')}>
          {(control) => (
            <Input
              {...control}
              name="targetEndDate"
              type="date"
              defaultValue={project.targetEndDate ?? ''}
            />
          )}
        </Field>

        <Field label={t('actualEndDate')} optionalLabel={tCommon('labels.optional')}>
          {(control) => (
            <Input
              {...control}
              name="actualEndDate"
              type="date"
              defaultValue={project.actualEndDate ?? ''}
            />
          )}
        </Field>

        <Field label={t('progressPercent')} optionalLabel={tCommon('labels.optional')}>
          {(control) => (
            <Input
              {...control}
              name="progressPercent"
              inputMode="decimal"
              defaultValue={project.progressPercent ?? ''}
              placeholder="0–100"
            />
          )}
        </Field>

        <Field label={t('progressStatus')} optionalLabel={tCommon('labels.optional')}>
          {(control) => (
            <Select name="progressStatus" defaultValue={project.progressStatus ?? 'none'}>
              <SelectTrigger id={control.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{tCommon('labels.none')}</SelectItem>
                {(['not_started', 'on_track', 'at_risk', 'delayed', 'completed'] as const).map(
                  (status) => (
                    <SelectItem key={status} value={status}>
                      {t(`progressStatuses.${status}`)}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          )}
        </Field>

        <Field label={t('roleLabel')} optionalLabel={tCommon('labels.optional')}>
          {(control) => (
            <Input {...control} name="projectRole" defaultValue={project.projectRole ?? ''} />
          )}
        </Field>

        <Field label={t('deliveryModeLabel')} optionalLabel={tCommon('labels.optional')}>
          {(control) => (
            <Input {...control} name="deliveryMode" defaultValue={project.deliveryMode ?? ''} />
          )}
        </Field>

        <Field label={t('descriptionLabel')} optionalLabel={tCommon('labels.optional')}>
          {(control) => (
            <Textarea
              {...control}
              name="description"
              rows={3}
              defaultValue={project.description ?? ''}
            />
          )}
        </Field>

        <Field label={t('notesLabel')} optionalLabel={tCommon('labels.optional')}>
          {(control) => (
            <Textarea {...control} name="notes" rows={2} defaultValue={project.notes ?? ''} />
          )}
        </Field>

        <Button type="submit" loading={pending}>
          {t('save')}
        </Button>
      </form>

      <div className="mx-auto mt-6 max-w-xl">
        <EntityCustomFieldsPanel
          entityId={project.id}
          fields={customFields}
          revalidatePath={fieldsRevalidatePath}
          saveAction={upsertEntityFieldValueAction}
        />
      </div>
    </>
  );
}
