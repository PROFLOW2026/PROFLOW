'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
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
import { type CustomFieldValueView } from '@/modules/custom-fields/domain/types';
import { EntityCustomFieldsPanel } from '@/modules/custom-fields/ui';
import { upsertEntityFieldValueAction } from '../../settings/custom-fields/actions';
import { updateProjectAction, type ProjectFormState } from '../actions';

interface DetailsTabProps {
  detail: ProjectDetail;
  clients: { id: string; name: string }[];
  baseCurrency: string;
  currencySymbol: string;
  canManageContract: boolean;
  customFields?: CustomFieldValueView[];
  taxRatePercent?: string | null;
  /** Jobs omit mid-project opening-reduction capture. */
  showOpeningReduction?: boolean;
  /** Path to revalidate after custom-field saves (job vs project workspace). */
  customFieldsRevalidatePath?: string;
  /** Override contract amount labels for jobs (price language). */
  amountLabel?: string;
  amountDescription?: string;
  amountPlaceholder?: string;
  taxModeDescription?: string;
}

function stripStorageScale(raw: string): string {
  if (!raw) return '';
  return raw.replace(/\.?0+$/, '') === '' ? raw : raw.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
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
  const tStatus = useTranslations('status.project');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<ProjectFormState, FormData>(
    updateProjectAction,
    {},
  );

  const { project } = detail;
  const currency = detail.contract?.currency ?? project.currency ?? baseCurrency;
  const fieldsRevalidatePath =
    customFieldsRevalidatePath ?? `/projects/${project.id}`;

  return (
    <>
    <form action={formAction} className="mx-auto flex max-w-xl flex-col gap-4">
      <input type="hidden" name="projectId" value={project.id} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label={tCommon('labels.name')} required error={state.fieldErrors?.name}>
        {(control) => <Input {...control} name="name" defaultValue={project.name} required />}
      </Field>

      <Field label={t('statusLabel')}>
        {(control) => (
          <Select name="status" defaultValue={project.status}>
            <SelectTrigger id={control.id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_STATUSES.filter((status) => status !== 'archived').map((status) => (
                <SelectItem key={status} value={status}>
                  {tStatus(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label={t('clientLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <Select name="clientId" defaultValue={project.clientId ?? 'none'}>
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

      {canManageContract ? (
        <ContractAmountFields
          baseCurrency={currency}
          currencySymbol={currencySymbol}
          initialAmount={displayEnteredAmount(detail)}
          initialIncludesTax={detail.contract?.amountIncludesTax ?? false}
          initialOpeningReduction={
            showOpeningReduction ? displayOpeningReduction(detail) : ''
          }
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
        {(control) => <Input {...control} name="location" defaultValue={project.location ?? ''} />}
      </Field>

      <Field label={t('startDate')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <Input {...control} name="startDate" type="date" defaultValue={project.startDate ?? ''} />
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
              {(
                ['not_started', 'on_track', 'at_risk', 'delayed', 'completed'] as const
              ).map((status) => (
                <SelectItem key={status} value={status}>
                  {t(`progressStatuses.${status}`)}
                </SelectItem>
              ))}
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
          <Textarea {...control} name="description" rows={3} defaultValue={project.description ?? ''} />
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
