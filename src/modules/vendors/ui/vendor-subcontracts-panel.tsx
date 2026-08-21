'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type {
  SubcontractDetail,
  SubcontractListItem,
  SubcontractParentContractOption,
} from '@/modules/vendors';
import {
  createSubcontractAction,
  type VendorFormState,
} from '@/app/[locale]/(app)/vendors/actions';
import { SubcontractCard } from './subcontract-card';

export interface VendorSubcontractsPanelProps {
  readonly vendorId: string;
  readonly vendorType?: 'supplier' | 'subcontractor' | 'both' | 'other';
  readonly items: readonly SubcontractListItem[];
  readonly details: readonly SubcontractDetail[];
  readonly candidateProjects: readonly { id: string; name: string }[];
  readonly parentContracts: readonly SubcontractParentContractOption[];
  readonly documentCandidates: readonly { id: string; originalFilename: string }[];
  readonly canManage: boolean;
  readonly defaultStartDate: string;
}

export function VendorSubcontractsPanel({
  vendorId,
  vendorType = 'subcontractor',
  items,
  details,
  candidateProjects,
  parentContracts,
  documentCandidates,
  canManage,
  defaultStartDate,
}: VendorSubcontractsPanelProps) {
  const t = useTranslations('vendors.subcontracts');
  const tCommon = useTranslations('common');
  const [showAdd, setShowAdd] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [parentContractId, setParentContractId] = useState<string>('none');
  const [state, formAction, pending] = useActionState<VendorFormState, FormData>(
    createSubcontractAction,
    {},
  );

  const resolvedProjectId =
    projectId && candidateProjects.some((project) => project.id === projectId)
      ? projectId
      : (candidateProjects[0]?.id ?? '');

  const contractsForProject = useMemo(
    () => parentContracts.filter((contract) => contract.projectId === resolvedProjectId),
    [parentContracts, resolvedProjectId],
  );

  const detailById = useMemo(() => {
    const map = new Map<string, SubcontractDetail>();
    for (const detail of details) map.set(detail.id, detail);
    return map;
  }, [details]);

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 text-start">
          <h2 className="text-base font-semibold">{t('sectionTitle')}</h2>
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
          <input type="hidden" name="vendorId" value={vendorId} />
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.ok ? <Alert tone="success">{t('addSuccess')}</Alert> : null}

          {candidateProjects.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-muted)]">{t('noProjects')}</p>
          ) : (
            <>
              <Field label={t('titleLabel')} required>
                {(control) => (
                  <Input
                    {...control}
                    name="title"
                    required
                    placeholder={t('titlePlaceholder')}
                  />
                )}
              </Field>
              <Field label={t('projectLabel')} required>
                {(control) => (
                  <>
                    <input type="hidden" name="projectId" value={resolvedProjectId} />
                    <Select
                      value={resolvedProjectId}
                      onValueChange={(value) => {
                        setProjectId(value);
                        setParentContractId('none');
                      }}
                    >
                      <SelectTrigger id={control.id}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {candidateProjects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
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
                          {contractsForProject.map((contract) => (
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
              {vendorType === 'supplier' ? (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="promoteVendorToBoth"
                    value="true"
                    className="mt-1 size-4 shrink-0"
                    required
                  />
                  <span>{t('promoteSupplierToBoth')}</span>
                </label>
              ) : null}
              {vendorType === 'other' ? (
                <Alert tone="warning">{t('vendorTypeOtherBlocked')}</Alert>
              ) : null}
              <Button
                type="submit"
                size="sm"
                loading={pending}
                className="self-start"
                disabled={vendorType === 'other'}
              >
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
              counterpartHref={`/projects/${item.projectId}`}
              counterpartLabel={item.projectName}
              documentCandidates={documentCandidates}
            />
          ))}
        </ul>
      )}

      <p className="text-xs text-[var(--pf-text-muted)]">{t('commitmentNote')}</p>
      <p className="text-xs text-[var(--pf-text-muted)]">{t('cashNote')}</p>
    </Card>
  );
}
