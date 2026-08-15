'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type {
  SubcontractDetail,
  SubcontractListItem,
  SubcontractParentContractOption,
  VendorType,
} from '@/modules/vendors';
import {
  createSubcontractAction,
  type VendorFormState,
} from '@/app/[locale]/(app)/vendors/actions';
import { SubcontractCard } from './subcontract-card';

export interface ProjectSubcontractVendorOption {
  readonly id: string;
  readonly name: string;
  readonly type: VendorType;
}

export interface ProjectSubcontractsRosterProps {
  readonly projectId: string;
  readonly items: readonly SubcontractListItem[];
  readonly details: readonly SubcontractDetail[];
  readonly candidateVendors: readonly ProjectSubcontractVendorOption[];
  readonly parentContracts: readonly SubcontractParentContractOption[];
  readonly documentCandidates: readonly { id: string; originalFilename: string }[];
  readonly canManage: boolean;
  readonly defaultStartDate: string;
}

export function ProjectSubcontractsRoster({
  projectId,
  items,
  details,
  candidateVendors,
  parentContracts,
  documentCandidates,
  canManage,
  defaultStartDate,
}: ProjectSubcontractsRosterProps) {
  const t = useTranslations('vendors.subcontracts');
  const tCommon = useTranslations('common');
  const [showAdd, setShowAdd] = useState(false);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [parentContractId, setParentContractId] = useState<string>('none');
  const [state, formAction, pending] = useActionState<VendorFormState, FormData>(
    createSubcontractAction,
    {},
  );

  const resolvedVendorId =
    vendorId && candidateVendors.some((vendor) => vendor.id === vendorId)
      ? vendorId
      : (candidateVendors[0]?.id ?? '');

  const detailById = useMemo(() => {
    const map = new Map<string, SubcontractDetail>();
    for (const detail of details) map.set(detail.id, detail);
    return map;
  }, [details]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 text-start">
          <h3 className="text-base font-semibold">{t('sectionTitle')}</h3>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('sectionHint')}</p>
        </div>
        {canManage ? (
          <Button type="button" size="sm" onClick={() => setShowAdd((value) => !value)}>
            {t('add')}
          </Button>
        ) : null}
      </div>

      {canManage && showAdd ? (
        <form
          action={formAction}
          className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-3"
        >
          <input type="hidden" name="projectId" value={projectId} />
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.ok ? <Alert tone="success">{t('addSuccess')}</Alert> : null}

          {candidateVendors.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-muted)]">{t('noVendors')}</p>
          ) : (
            <>
              <Field label={t('titleLabel')} required>
                {(control) => (
                  <Input {...control} name="title" required placeholder={t('titlePlaceholder')} />
                )}
              </Field>
              <Field label={t('vendorLabel')} required>
                {(control) => (
                  <>
                    <input type="hidden" name="vendorId" value={resolvedVendorId} />
                    <Select value={resolvedVendorId} onValueChange={setVendorId}>
                      <SelectTrigger id={control.id}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {candidateVendors.map((vendor) => (
                          <SelectItem key={vendor.id} value={vendor.id}>
                            {vendor.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('numberLabel')} optionalLabel={tCommon('labels.optional')}>
                  {(control) => <Input {...control} name="subcontractNumber" dir="ltr" />}
                </Field>
                <Field label={t('originalAmountLabel')} required>
                  {(control) => (
                    <Input {...control} name="originalAmount" inputMode="decimal" dir="ltr" required />
                  )}
                </Field>
                <Field label={t('retentionLabel')} optionalLabel={tCommon('labels.optional')}>
                  {(control) => <Input {...control} name="retentionPercent" inputMode="decimal" dir="ltr" />}
                </Field>
                <Field label={t('parentContractLabel')} optionalLabel={tCommon('labels.optional')}>
                  {(control) => (
                    <>
                      <input
                        type="hidden"
                        name="parentContractId"
                        value={parentContractId === 'none' ? '' : parentContractId}
                      />
                      <Select value={parentContractId} onValueChange={setParentContractId}>
                        <SelectTrigger id={control.id}>
                          <SelectValue placeholder={t('parentContractNone')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t('parentContractNone')}</SelectItem>
                          {parentContracts.map((contract) => (
                            <SelectItem key={contract.id} value={contract.id}>
                              {contract.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  )}
                </Field>
                <Field label={t('startDate')}>
                  {(control) => (
                    <Input {...control} name="startDate" type="date" defaultValue={defaultStartDate} dir="ltr" />
                  )}
                </Field>
                <Field label={t('endDate')} optionalLabel={tCommon('labels.optional')}>
                  {(control) => <Input {...control} name="endDate" type="date" dir="ltr" />}
                </Field>
              </div>
              <Field label={t('notesLabel')} optionalLabel={tCommon('labels.optional')}>
                {(control) => <Textarea {...control} name="notes" rows={2} />}
              </Field>
              <Button type="submit" size="sm" loading={pending} className="self-start">
                {t('addSave')}
              </Button>
            </>
          )}
        </form>
      ) : null}

      {items.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <SubcontractCard
              key={item.id}
              item={item}
              detail={detailById.get(item.id)}
              canManage={canManage}
              counterpartHref={`/vendors/${item.vendorId}`}
              counterpartLabel={item.vendorName}
              documentCandidates={documentCandidates}
            />
          ))}
        </ul>
      )}

      <p className="text-xs text-[var(--pf-text-muted)]">{t('commitmentNote')}</p>
    </div>
  );
}
