'use client';

import { useTranslations } from 'next-intl';
import {
  ADVANCE_RECOVERY_METHODS,
  SUBCONTRACT_CHANGE_TYPES,
  SUBCONTRACT_LINE_TYPES,
  SUBCONTRACT_VAT_TREATMENTS,
  type AgreementLifecycleAction,
} from '../domain/types';
import { ActionForm, FieldGrid, FormField } from './action-form';
import {
  addWorkLineAction,
  agreementLifecycleAction,
  approveChangeAction,
  archiveWorkLineAction,
  closeUnpricedWorkAction,
  contractorCounterChangeAction,
  contractorProposeChangeAction,
  convertUnpricedWorkAction,
  createChangeAction,
  createDraftAgreementAction,
  proposeChangeVersionAction,
  recordUnpricedWorkAction,
  rejectChangeAction,
  submitChangeAction,
  updateAgreementAction,
  updateFinancialTermsAction,
  updateWorkLineAction,
  withdrawChangeAction,
} from './actions';
import { VersionLinesEditor, type VersionLineOption } from './version-lines-editor';

type Option = { readonly id: string; readonly name: string };

function useOptions() {
  const t = useTranslations('subcontracts');
  return {
    none: { value: '', label: t('common.none') },
    lineTypes: SUBCONTRACT_LINE_TYPES.map((value) => ({ value, label: t(`lineTypes.${value}`) })),
    changeTypes: SUBCONTRACT_CHANGE_TYPES.filter((value) => value !== 'contractor_proposal').map((value) => ({
      value,
      label: t(`changeTypes.${value}`),
    })),
    vat: SUBCONTRACT_VAT_TREATMENTS.map((value) => ({ value, label: t(`vat.${value}`) })),
    recovery: ADVANCE_RECOVERY_METHODS.map((value) => ({ value, label: t(`advanceRecovery.${value}`) })),
  };
}

function toOptions(items: readonly Option[], none: { value: string; label: string }) {
  return [none, ...items.map((item) => ({ value: item.id, label: item.name }))];
}

/** Create a draft agreement on a project. Mounted by Track S (contractors list) / Track U (FAB). */
export function CreateAgreementForm({
  projectId,
  vendors,
  workPackages,
}: {
  projectId: string;
  vendors: readonly Option[];
  workPackages: readonly Option[];
}) {
  const t = useTranslations('subcontracts');
  const options = useOptions();
  return (
    <ActionForm
      action={createDraftAgreementAction}
      hidden={{ projectId }}
      submitLabel={t('agreement.createSubmit')}
      successLabel={t('agreement.created')}
      resetOnSuccess
    >
      <FieldGrid>
        <FormField
          label={t('agreement.fields.vendor')}
          name="vendorId"
          required
          options={[{ value: '', label: t('agreement.chooseVendor') }, ...vendors.map((v) => ({ value: v.id, label: v.name }))]}
        />
        <FormField label={t('agreement.fields.title')} name="title" required />
        <FormField label={t('agreement.fields.number')} name="subcontractNumber" />
        <FormField label={t('agreement.fields.trade')} name="trade" />
        <FormField label={t('agreement.fields.workPackage')} name="workPackageId" options={toOptions(workPackages, options.none)} />
        <FormField label={t('agreement.fields.startDate')} name="startDate" type="date" />
        <FormField label={t('agreement.fields.endDate')} name="endDate" type="date" />
        <FormField label={t('agreement.fields.originalAmount')} name="originalAmount" type="number" />
        <FormField label={t('terms.retentionPercent')} name="retentionPercent" type="number" />
        <FormField label={t('terms.retentionCapAmount')} name="retentionCapAmount" type="number" />
        <FormField label={t('terms.advancePercent')} name="advancePercent" type="number" />
        <FormField label={t('terms.vatTreatment')} name="vatTreatment" options={options.vat} />
        <FormField label={t('terms.paymentTermsDays')} name="paymentTermsDays" type="number" inputMode="numeric" />
      </FieldGrid>
      <FormField label={t('agreement.fields.scope')} name="scopeSummary" multiline />
    </ActionForm>
  );
}

export function AgreementHeaderForm({
  projectId,
  agreement,
  workPackages,
  baselineEditable,
}: {
  projectId: string;
  agreement: {
    id: string;
    title: string;
    trade: string | null;
    scopeSummary: string | null;
    workPackageId: string | null;
    subcontractNumber: string | null;
    startDate: string | null;
    endDate: string | null;
  };
  workPackages: readonly Option[];
  baselineEditable: boolean;
}) {
  const t = useTranslations('subcontracts');
  const options = useOptions();
  return (
    <ActionForm
      action={updateAgreementAction}
      hidden={{ projectId, agreementId: agreement.id }}
      submitLabel={t('common.save')}
      successLabel={t('common.saved')}
    >
      <FieldGrid>
        <FormField label={t('agreement.fields.title')} name="title" defaultValue={agreement.title} required />
        <FormField label={t('agreement.fields.trade')} name="trade" defaultValue={agreement.trade} />
        <FormField
          label={t('agreement.fields.workPackage')}
          name="workPackageId"
          defaultValue={agreement.workPackageId ?? ''}
          options={toOptions(workPackages, options.none)}
        />
        {baselineEditable ? (
          <>
            <FormField label={t('agreement.fields.number')} name="subcontractNumber" defaultValue={agreement.subcontractNumber} />
            <FormField label={t('agreement.fields.startDate')} name="startDate" type="date" defaultValue={agreement.startDate} />
            <FormField label={t('agreement.fields.endDate')} name="endDate" type="date" defaultValue={agreement.endDate} />
          </>
        ) : null}
      </FieldGrid>
      <FormField label={t('agreement.fields.scope')} name="scopeSummary" defaultValue={agreement.scopeSummary} multiline />
    </ActionForm>
  );
}

export function FinancialTermsForm({
  projectId,
  agreementId,
  terms,
  valueFromLines,
}: {
  projectId: string;
  agreementId: string;
  terms: {
    originalAmount: string;
    retentionPercent: string | null;
    retentionCapPercent: string | null;
    retentionCapAmount: string | null;
    advancePercent: string | null;
    advanceAmount: string | null;
    advanceRecoveryMethod: string;
    advanceRecoveryPercent: string | null;
    vatTreatment: string;
    paymentTermsDays: number | null;
    paymentTermsText: string | null;
  };
  valueFromLines: boolean;
}) {
  const t = useTranslations('subcontracts');
  const options = useOptions();
  return (
    <ActionForm
      action={updateFinancialTermsAction}
      hidden={{ projectId, agreementId }}
      submitLabel={t('common.save')}
      successLabel={t('common.saved')}
    >
      <FieldGrid>
        {valueFromLines ? null : (
          <FormField label={t('agreement.fields.originalAmount')} name="originalAmount" type="number" defaultValue={terms.originalAmount} />
        )}
        <FormField label={t('terms.retentionPercent')} name="retentionPercent" type="number" defaultValue={terms.retentionPercent} />
        <FormField label={t('terms.retentionCapPercent')} name="retentionCapPercent" type="number" defaultValue={terms.retentionCapPercent} />
        <FormField label={t('terms.retentionCapAmount')} name="retentionCapAmount" type="number" defaultValue={terms.retentionCapAmount} />
        <FormField label={t('terms.advancePercent')} name="advancePercent" type="number" defaultValue={terms.advancePercent} />
        <FormField label={t('terms.advanceAmount')} name="advanceAmount" type="number" defaultValue={terms.advanceAmount} />
        <FormField
          label={t('terms.advanceRecoveryMethod')}
          name="advanceRecoveryMethod"
          defaultValue={terms.advanceRecoveryMethod}
          options={options.recovery}
        />
        <FormField
          label={t('terms.advanceRecoveryPercent')}
          name="advanceRecoveryPercent"
          type="number"
          defaultValue={terms.advanceRecoveryPercent}
        />
        <FormField label={t('terms.vatTreatment')} name="vatTreatment" defaultValue={terms.vatTreatment} options={options.vat} />
        <FormField
          label={t('terms.paymentTermsDays')}
          name="paymentTermsDays"
          type="number"
          inputMode="numeric"
          defaultValue={terms.paymentTermsDays}
        />
        <FormField label={t('terms.paymentTermsText')} name="paymentTermsText" defaultValue={terms.paymentTermsText} />
      </FieldGrid>
    </ActionForm>
  );
}

export function LifecycleActions({
  projectId,
  agreementId,
  actions,
}: {
  projectId: string;
  agreementId: string;
  actions: readonly AgreementLifecycleAction[];
}) {
  const t = useTranslations('subcontracts');
  if (actions.length === 0) return null;
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      {actions.map((action) => (
        <ActionForm
          key={action}
          action={agreementLifecycleAction}
          hidden={{ projectId, agreementId, action }}
          submitLabel={t(`lifecycle.actions.${action}`)}
          submitVariant={action === 'cancel' ? 'dangerGhost' : action === 'activate' ? 'primary' : 'secondary'}
          className="rounded-md border border-[var(--pf-border-subtle)] p-3"
        >
          <p className="text-xs text-[var(--pf-text-muted)]">{t(`lifecycle.hints.${action}`)}</p>
          {action === 'suspend' || action === 'cancel' ? (
            <FormField label={t('common.reason')} name="reason" required={action === 'suspend'} />
          ) : null}
        </ActionForm>
      ))}
    </div>
  );
}

export function AddWorkLineForm({
  projectId,
  agreementId,
  locations,
  workPackages,
  showPrices,
}: {
  projectId: string;
  agreementId: string;
  locations: readonly Option[];
  workPackages: readonly Option[];
  showPrices: boolean;
}) {
  const t = useTranslations('subcontracts');
  const options = useOptions();
  return (
    <ActionForm
      action={addWorkLineAction}
      hidden={{ projectId, agreementId }}
      submitLabel={t('lines.add')}
      successLabel={t('lines.added')}
      resetOnSuccess
    >
      <FieldGrid>
        <FormField label={t('lines.fields.code')} name="code" />
        <FormField label={t('lines.fields.description')} name="description" required className="sm:col-span-2" />
        <FormField label={t('lines.fields.lineType')} name="lineType" options={options.lineTypes} />
        <FormField label={t('lines.fields.unit')} name="unit" placeholder="m2" />
        <FormField label={t('lines.fields.quantity')} name="quantity" type="number" />
        <FormField label={t('lines.fields.weightPercent')} name="weightPercent" type="number" />
        <FormField label={t('lines.fields.plannedStart')} name="plannedStart" type="date" />
        <FormField label={t('lines.fields.plannedEnd')} name="plannedEnd" type="date" />
        <FormField label={t('lines.fields.location')} name="locationId" options={toOptions(locations, options.none)} />
        <FormField label={t('lines.fields.workPackage')} name="workPackageId" options={toOptions(workPackages, options.none)} />
        {showPrices ? (
          <>
            <FormField label={t('lines.fields.unitPrice')} name="unitPrice" type="number" />
            <FormField label={t('lines.fields.contractAmount')} name="contractAmount" type="number" />
          </>
        ) : null}
      </FieldGrid>
      <p className="text-xs text-[var(--pf-text-muted)]">{t('lines.pricingHint')}</p>
    </ActionForm>
  );
}

export function WorkLineEditForm({
  projectId,
  agreementId,
  line,
  baselineEditable,
  showPrices,
  locations,
  workPackages,
}: {
  projectId: string;
  agreementId: string;
  line: {
    id: string;
    code: string | null;
    description: string;
    unit: string;
    quantity: string;
    lineType: string;
    weightPercent: string | null;
    plannedStart: string | null;
    plannedEnd: string | null;
    locationId: string | null;
    workPackageId: string | null;
    unitPrice?: string;
    contractAmount?: string;
  };
  baselineEditable: boolean;
  showPrices: boolean;
  locations: readonly Option[];
  workPackages: readonly Option[];
}) {
  const t = useTranslations('subcontracts');
  const options = useOptions();
  return (
    <ActionForm
      action={updateWorkLineAction}
      hidden={{ projectId, agreementId, workLineId: line.id }}
      submitLabel={t('common.save')}
      successLabel={t('common.saved')}
    >
      <FieldGrid>
        {baselineEditable ? (
          <>
            <FormField label={t('lines.fields.code')} name="code" defaultValue={line.code} />
            <FormField label={t('lines.fields.description')} name="description" defaultValue={line.description} required />
            <FormField label={t('lines.fields.lineType')} name="lineType" defaultValue={line.lineType} options={options.lineTypes} />
            <FormField label={t('lines.fields.unit')} name="unit" defaultValue={line.unit} />
            <FormField label={t('lines.fields.quantity')} name="quantity" type="number" defaultValue={line.quantity} />
            <FormField label={t('lines.fields.weightPercent')} name="weightPercent" type="number" defaultValue={line.weightPercent} />
            {showPrices ? (
              <>
                <FormField label={t('lines.fields.unitPrice')} name="unitPrice" type="number" defaultValue={line.unitPrice} />
                <FormField label={t('lines.fields.contractAmount')} name="contractAmount" type="number" defaultValue={line.contractAmount} />
              </>
            ) : null}
          </>
        ) : null}
        <FormField label={t('lines.fields.plannedStart')} name="plannedStart" type="date" defaultValue={line.plannedStart} />
        <FormField label={t('lines.fields.plannedEnd')} name="plannedEnd" type="date" defaultValue={line.plannedEnd} />
        <FormField
          label={t('lines.fields.location')}
          name="locationId"
          defaultValue={line.locationId ?? ''}
          options={toOptions(locations, options.none)}
        />
        <FormField
          label={t('lines.fields.workPackage')}
          name="workPackageId"
          defaultValue={line.workPackageId ?? ''}
          options={toOptions(workPackages, options.none)}
        />
      </FieldGrid>
      {!baselineEditable ? <p className="text-xs text-[var(--pf-text-muted)]">{t('lines.lockedHint')}</p> : null}
    </ActionForm>
  );
}

export function ArchiveWorkLineForm({ projectId, agreementId, workLineId }: { projectId: string; agreementId: string; workLineId: string }) {
  const t = useTranslations('subcontracts');
  return (
    <ActionForm
      action={archiveWorkLineAction}
      hidden={{ projectId, agreementId, workLineId }}
      submitLabel={t('lines.archive')}
      submitVariant="dangerGhost"
    />
  );
}

export function CreateChangeForm({ projectId, agreementId }: { projectId: string; agreementId: string }) {
  const t = useTranslations('subcontracts');
  const options = useOptions();
  return (
    <ActionForm
      action={createChangeAction}
      hidden={{ projectId, agreementId }}
      submitLabel={t('changes.create')}
      successLabel={t('changes.created')}
      resetOnSuccess
    >
      <FieldGrid>
        <FormField label={t('changes.fields.type')} name="changeType" options={options.changeTypes} required />
        <FormField label={t('changes.fields.title')} name="title" required className="sm:col-span-2" />
        <FormField label={t('changes.fields.timeExtensionDays')} name="timeExtensionDays" type="number" inputMode="numeric" />
      </FieldGrid>
      <FormField label={t('changes.fields.description')} name="description" multiline />
    </ActionForm>
  );
}

export interface ChangeActionFlags {
  readonly canSubmit: boolean;
  readonly canWithdraw: boolean;
  readonly canPropose: boolean;
  readonly canDecide: boolean;
}

export function ChangeActions({
  projectId,
  agreementId,
  changeId,
  flags,
  versions,
  lineOptions,
}: {
  projectId: string;
  agreementId: string;
  changeId: string;
  flags: ChangeActionFlags;
  versions: readonly { id: string; versionNo: number }[];
  lineOptions: readonly VersionLineOption[];
}) {
  const t = useTranslations('subcontracts');
  const hidden = { projectId, agreementId, changeId };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {flags.canSubmit ? <ActionForm action={submitChangeAction} hidden={hidden} submitLabel={t('changes.actions.submit')} /> : null}
        {flags.canWithdraw ? (
          <ActionForm action={withdrawChangeAction} hidden={hidden} submitLabel={t('changes.actions.withdraw')} submitVariant="dangerGhost">
            <FormField label={t('common.reason')} name="reason" />
          </ActionForm>
        ) : null}
      </div>
      {flags.canPropose ? (
        <details className="rounded-md border border-[var(--pf-border-subtle)] p-3">
          <summary className="cursor-pointer text-sm font-medium">{t('versions.propose')}</summary>
          <ActionForm action={proposeChangeVersionAction} hidden={hidden} submitLabel={t('versions.proposeSubmit')} className="mt-3" resetOnSuccess>
            <FieldGrid>
              <FormField label={t('versions.amount')} name="amount" type="number" />
              <FormField label={t('changes.fields.timeExtensionDays')} name="timeExtensionDays" type="number" inputMode="numeric" />
              <FormField label={t('versions.note')} name="note" />
            </FieldGrid>
            <VersionLinesEditor lineOptions={lineOptions} />
          </ActionForm>
        </details>
      ) : null}
      {flags.canDecide && versions.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ActionForm action={approveChangeAction} hidden={hidden} submitLabel={t('changes.actions.approve')}>
            <FormField
              label={t('changes.fields.approveVersion')}
              name="versionId"
              defaultValue={versions[versions.length - 1]!.id}
              options={versions.map((version) => ({ value: version.id, label: t('versions.label', { no: version.versionNo }) }))}
            />
            <FormField label={t('common.note')} name="reason" />
          </ActionForm>
          <ActionForm action={rejectChangeAction} hidden={hidden} submitLabel={t('changes.actions.reject')} submitVariant="dangerGhost">
            <FormField label={t('common.reason')} name="reason" required />
          </ActionForm>
        </div>
      ) : null}
      {flags.canDecide && versions.length === 0 ? (
        <ActionForm action={rejectChangeAction} hidden={hidden} submitLabel={t('changes.actions.reject')} submitVariant="dangerGhost">
          <FormField label={t('common.reason')} name="reason" required />
        </ActionForm>
      ) : null}
    </div>
  );
}

export function RecordUnpricedWorkForm({
  projectId,
  agreements,
  locations,
  workPackages,
  today,
}: {
  projectId: string;
  agreements: readonly { id: string; title: string; vendorName: string | null }[];
  locations: readonly Option[];
  workPackages: readonly Option[];
  today: string;
}) {
  const t = useTranslations('subcontracts');
  const options = useOptions();
  return (
    <ActionForm
      action={recordUnpricedWorkAction}
      hidden={{ projectId }}
      submitLabel={t('unpriced.record')}
      successLabel={t('unpriced.recorded')}
      resetOnSuccess
    >
      <FieldGrid>
        <FormField
          label={t('unpriced.fields.agreement')}
          name="unpricedAgreementId"
          required
          options={[
            { value: '', label: t('unpriced.chooseAgreement') },
            ...agreements.map((agreement) => ({
              value: agreement.id,
              label: agreement.vendorName ? `${agreement.vendorName} · ${agreement.title}` : agreement.title,
            })),
          ]}
        />
        <FormField label={t('unpriced.fields.title')} name="title" required />
        <FormField label={t('unpriced.fields.workDate')} name="workDate" type="date" defaultValue={today} required />
        <FormField label={t('unpriced.fields.issuer')} name="issuerName" />
        <FormField label={t('lines.fields.location')} name="locationId" options={toOptions(locations, options.none)} />
        <FormField label={t('lines.fields.workPackage')} name="workPackageId" options={toOptions(workPackages, options.none)} />
      </FieldGrid>
      <FormField label={t('unpriced.fields.scope')} name="scopeDescription" multiline />
    </ActionForm>
  );
}

export function UnpricedWorkActions({ projectId, agreementId, unpricedWorkId, canConvert }: {
  projectId: string;
  agreementId: string;
  unpricedWorkId: string;
  canConvert: boolean;
}) {
  const t = useTranslations('subcontracts');
  const options = useOptions();
  const hidden = { projectId, agreementId, unpricedWorkId };
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {canConvert ? (
        <ActionForm action={convertUnpricedWorkAction} hidden={hidden} submitLabel={t('unpriced.actions.convert')}>
          <FormField label={t('changes.fields.type')} name="changeType" defaultValue="instruction" options={options.changeTypes} />
        </ActionForm>
      ) : null}
      <ActionForm action={closeUnpricedWorkAction} hidden={{ ...hidden, decision: 'reject' }} submitLabel={t('unpriced.actions.reject')} submitVariant="dangerGhost">
        <FormField label={t('common.reason')} name="reason" required />
      </ActionForm>
      <ActionForm action={closeUnpricedWorkAction} hidden={{ ...hidden, decision: 'cancel' }} submitLabel={t('unpriced.actions.cancel')} submitVariant="ghost">
        <FormField label={t('common.reason')} name="reason" required />
      </ActionForm>
    </div>
  );
}

export function ContractorProposalForm({
  organizationId,
  projectId,
  agreementId,
  lineOptions,
}: {
  organizationId: string;
  projectId: string;
  agreementId: string;
  lineOptions: readonly VersionLineOption[];
}) {
  const t = useTranslations('subcontracts');
  return (
    <ActionForm
      action={contractorProposeChangeAction}
      hidden={{ organizationId, projectId, agreementId }}
      submitLabel={t('portal.proposeSubmit')}
      successLabel={t('portal.proposed')}
      resetOnSuccess
    >
      <FormField label={t('changes.fields.title')} name="title" required />
      <FormField label={t('changes.fields.description')} name="description" multiline />
      <FieldGrid>
        <FormField label={t('versions.amount')} name="amount" type="number" />
        <FormField label={t('changes.fields.timeExtensionDays')} name="timeExtensionDays" type="number" inputMode="numeric" />
        <FormField label={t('versions.note')} name="note" />
      </FieldGrid>
      <VersionLinesEditor lineOptions={lineOptions} />
    </ActionForm>
  );
}

export function ContractorCounterForm({
  organizationId,
  projectId,
  agreementId,
  changeId,
  lineOptions,
}: {
  organizationId: string;
  projectId: string;
  agreementId: string;
  changeId: string;
  lineOptions: readonly VersionLineOption[];
}) {
  const t = useTranslations('subcontracts');
  return (
    <ActionForm
      action={contractorCounterChangeAction}
      hidden={{ organizationId, projectId, agreementId, changeId }}
      submitLabel={t('portal.counterSubmit')}
      successLabel={t('portal.countered')}
      resetOnSuccess
    >
      <FieldGrid>
        <FormField label={t('versions.amount')} name="amount" type="number" />
        <FormField label={t('changes.fields.timeExtensionDays')} name="timeExtensionDays" type="number" inputMode="numeric" />
        <FormField label={t('versions.note')} name="note" />
      </FieldGrid>
      <VersionLinesEditor lineOptions={lineOptions} />
    </ActionForm>
  );
}
