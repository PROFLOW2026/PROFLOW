'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { updateBoqNodeMappingsAction, type BoqFormState } from './actions';

export interface MappingOption {
  readonly id: string;
  readonly label: string;
}

export interface RelatedMappingsSectionProps {
  readonly projectId: string;
  readonly nodeId: string;
  readonly workPackageId: string | null;
  readonly costCategoryId: string | null;
  readonly budgetLineId: string | null;
  readonly workPackages: readonly MappingOption[];
  readonly costCategories: readonly MappingOption[];
  readonly budgetLines: readonly MappingOption[];
  readonly canManage: boolean;
}

/**
 * Related mappings on BOQ item edit - WP / cost category / budget line.
 * Never mutates BOQ money columns.
 */
export function RelatedMappingsSection({
  projectId,
  nodeId,
  workPackageId,
  costCategoryId,
  budgetLineId,
  workPackages,
  costCategories,
  budgetLines,
  canManage,
}: RelatedMappingsSectionProps) {
  const t = useTranslations('boq');
  const [state, action, pending] = useActionState(
    updateBoqNodeMappingsAction,
    {} as BoqFormState,
  );

  return (
    <section className="flex min-w-0 flex-col gap-3 border-t border-[var(--pf-border-default)] pt-4">
      <div className="min-w-0 text-start">
        <h3 className="text-sm font-semibold">{t('mappings.title')}</h3>
        <p className="text-xs text-[var(--pf-text-secondary)]">{t('mappings.description')}</p>
      </div>

      <form action={action} className="grid min-w-0 gap-3 sm:grid-cols-3">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="nodeId" value={nodeId} />

        <label className="flex flex-col gap-1 text-sm text-start">
          <span>{t('mappings.workPackage')}</span>
          <select
            name="workPackageId"
            defaultValue={workPackageId ?? ''}
            disabled={!canManage || pending}
            className="w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2 py-2 text-sm"
          >
            <option value="">{t('mappings.none')}</option>
            {workPackages.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-start">
          <span>{t('mappings.costCategory')}</span>
          <select
            name="costCategoryId"
            defaultValue={costCategoryId ?? ''}
            disabled={!canManage || pending}
            className="w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2 py-2 text-sm"
          >
            <option value="">{t('mappings.none')}</option>
            {costCategories.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-start">
          <span>{t('mappings.budgetLine')}</span>
          <select
            name="budgetLineId"
            defaultValue={budgetLineId ?? ''}
            disabled={!canManage || pending}
            className="w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2 py-2 text-sm"
          >
            <option value="">{t('mappings.none')}</option>
            {budgetLines.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        {canManage ? (
          <div className="sm:col-span-3">
            <Button type="submit" disabled={pending}>
              {t('mappings.save')}
            </Button>
            {state.ok ? (
              <p className="mt-2 text-xs text-[var(--pf-text-secondary)]">{t('mappings.saved')}</p>
            ) : null}
            {state.error ? (
              <p className="mt-2 text-xs text-[var(--pf-status-danger-fg)]">{state.error}</p>
            ) : null}
          </div>
        ) : null}
      </form>
    </section>
  );
}
