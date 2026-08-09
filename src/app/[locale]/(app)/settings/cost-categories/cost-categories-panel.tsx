'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ConfirmAction } from '@/components/patterns/confirm-action';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import {
  archiveCostCategoryAction,
  createCostCategoryAction,
  renameCostCategoryAction,
  setCostCategoryPolicyAction,
  type SettingsActionState,
} from '../actions';
import type { CostCategoryRow } from '../_lib/cost-categories';
import {
  ALLOCATION_METHODS,
  COST_FAMILIES,
  PERIOD_BEHAVIORS,
} from '../_lib/cost-categories';

const NONE_VALUE = '__none__';

export function CostCategoriesPanel({
  categories,
  canEdit,
}: {
  categories: CostCategoryRow[];
  canEdit: boolean;
}) {
  const t = useTranslations('settings.costCategories');
  const tFinancial = useTranslations('financial');
  const [createState, createAction, createPending] = useActionState(
    createCostCategoryAction,
    {} as SettingsActionState,
  );

  const grouped = COST_FAMILIES.map((family) => ({
    family,
    items: categories.filter((category) => category.family === family),
  }));

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
      <p className="text-xs text-[var(--pf-text-muted)]">{t('policyHint')}</p>

      {categories.length === 0 && !canEdit ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyHint')} />
      ) : (
        grouped.map(({ family, items }) =>
          items.length === 0 ? null : (
            <section key={family}>
              <h3 className="text-sm font-semibold">{tFinancial(`costFamilies.${family}`)}</h3>
              <ul className="mt-2 flex flex-col gap-3">
                {items.map((category) => (
                  <CategoryRow key={category.id} category={category} canEdit={canEdit} />
                ))}
              </ul>
            </section>
          ),
        )
      )}

      {canEdit ? (
        <section className="rounded-lg border border-[var(--pf-border-default)] p-4">
          <h3 className="font-medium">{t('addCategory')}</h3>
          <CreateCategoryForm
            createAction={createAction}
            createState={createState}
            createPending={createPending}
          />
        </section>
      ) : null}
    </div>
  );
}

function PolicySelects({
  method,
  period,
  onMethodChange,
  onPeriodChange,
  methodName = 'defaultAllocationMethod',
  periodName = 'defaultPeriodBehavior',
}: {
  method: string;
  period: string;
  onMethodChange: (value: string) => void;
  onPeriodChange: (value: string) => void;
  methodName?: string;
  periodName?: string;
}) {
  const t = useTranslations('settings.costCategories');

  return (
    <div className="grid w-full gap-3 sm:grid-cols-2">
      <Field label={t('defaultMethod')}>
        {(props) => (
          <>
            <input type="hidden" name={methodName} value={method} />
            <Select value={method} onValueChange={onMethodChange}>
              <SelectTrigger id={props.id} aria-describedby={props['aria-describedby']}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>{t('noDefault')}</SelectItem>
                {ALLOCATION_METHODS.map((methodKey) => (
                  <SelectItem key={methodKey} value={methodKey}>
                    {t(`methods.${methodKey}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      <Field label={t('defaultPeriod')}>
        {(props) => (
          <>
            <input type="hidden" name={periodName} value={period} />
            <Select value={period} onValueChange={onPeriodChange}>
              <SelectTrigger id={props.id} aria-describedby={props['aria-describedby']}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>{t('noDefault')}</SelectItem>
                {PERIOD_BEHAVIORS.map((periodKey) => (
                  <SelectItem key={periodKey} value={periodKey}>
                    {t(`periods.${periodKey}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>
    </div>
  );
}

function CreateCategoryForm({
  createAction,
  createState,
  createPending,
}: {
  createAction: (payload: FormData) => void;
  createState: SettingsActionState;
  createPending: boolean;
}) {
  const t = useTranslations('settings.costCategories');
  const tFinancial = useTranslations('financial');
  const tCommon = useTranslations('common');
  const [family, setFamily] = useState<string>(COST_FAMILIES[0] ?? '');
  const [method, setMethod] = useState(NONE_VALUE);
  const [period, setPeriod] = useState(NONE_VALUE);

  return (
    <form action={createAction} className="mt-3 flex w-full max-w-xl flex-col gap-3">
      {createState.error ? <Alert tone="danger">{createState.error}</Alert> : null}
      {createState.ok ? (
        <Alert tone="success" role="status" aria-live="polite">
          {tCommon('states.saved')}
        </Alert>
      ) : null}

      <Field label={tCommon('labels.name')} required>
        {(props) => <Input {...props} name="name" required />}
      </Field>

      <Field label={t('family')} required>
        {(props) => (
          <>
            <input type="hidden" name="family" value={family} />
            <Select value={family} onValueChange={setFamily}>
              <SelectTrigger id={props.id} aria-describedby={props['aria-describedby']}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COST_FAMILIES.map((familyKey) => (
                  <SelectItem key={familyKey} value={familyKey}>
                    {tFinancial(`costFamilies.${familyKey}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      <PolicySelects
        method={method}
        period={period}
        onMethodChange={setMethod}
        onPeriodChange={setPeriod}
      />

      <Button type="submit" loading={createPending}>
        {t('addCategory')}
      </Button>
    </form>
  );
}

function CategoryRow({ category, canEdit }: { category: CostCategoryRow; canEdit: boolean }) {
  const t = useTranslations('settings.costCategories');
  const tCommon = useTranslations('common');
  const [renameState, renameAction, renamePending] = useActionState(
    renameCostCategoryAction,
    {} as SettingsActionState,
  );
  const [policyState, policyAction, policyPending] = useActionState(
    setCostCategoryPolicyAction,
    {} as SettingsActionState,
  );
  const [method, setMethod] = useState(category.defaultAllocationMethod ?? NONE_VALUE);
  const [period, setPeriod] = useState(category.defaultPeriodBehavior ?? NONE_VALUE);
  const renameLabel = t('renameLabel', { name: category.name });

  async function handleArchive() {
    const result = await archiveCostCategoryAction(category.id);
    if (result.error) {
      return { error: result.error };
    }
    return { ok: true };
  }

  const methodLabel =
    category.defaultAllocationMethod != null
      ? t(`methods.${category.defaultAllocationMethod}`)
      : t('noDefault');
  const periodLabel =
    category.defaultPeriodBehavior != null
      ? t(`periods.${category.defaultPeriodBehavior}`)
      : t('noDefault');

  return (
    <li className="flex flex-col gap-3 rounded-md border border-[var(--pf-border-default)] px-3 py-3">
      {canEdit ? (
        <form action={renameAction} className="flex flex-1 flex-wrap items-center gap-2">
          <input type="hidden" name="categoryId" value={category.id} />
          <Input
            name="name"
            defaultValue={category.name}
            className="min-w-0 w-full max-w-xs flex-1"
            aria-label={renameLabel}
          />
          <Button type="submit" size="sm" variant="secondary" loading={renamePending}>
            {tCommon('actions.save')}
          </Button>
          {renameState.error ? (
            <Alert tone="danger" className="w-full">
              {renameState.error}
            </Alert>
          ) : null}
          {renameState.ok ? (
            <Alert tone="success" className="w-full" role="status" aria-live="polite">
              {tCommon('states.saved')}
            </Alert>
          ) : null}
        </form>
      ) : (
        <span className="flex-1 text-sm font-medium">{category.name}</span>
      )}

      {canEdit ? (
        <form action={policyAction} className="flex flex-col gap-3">
          <input type="hidden" name="categoryId" value={category.id} />
          <PolicySelects
            method={method}
            period={period}
            onMethodChange={setMethod}
            onPeriodChange={setPeriod}
          />
          {policyState.error ? <Alert tone="danger">{policyState.error}</Alert> : null}
          {policyState.ok ? (
            <Alert tone="success" role="status" aria-live="polite">
              {tCommon('states.saved')}
            </Alert>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" loading={policyPending}>
              {t('savePolicy')}
            </Button>
            {!category.isSystem ? (
              <ConfirmAction
                title={tCommon('actions.archive')}
                description={
                  <>
                    <p>{t('archiveQuestion', { name: category.name })}</p>
                    <p>{t('archiveConsequence')}</p>
                  </>
                }
                confirmLabel={tCommon('actions.archive')}
                successMessage={t('archiveSuccess')}
                onConfirm={handleArchive}
                trigger={
                  <Button type="button" size="sm" variant="ghost">
                    {tCommon('actions.archive')}
                  </Button>
                }
              />
            ) : null}
          </div>
        </form>
      ) : (
        <dl className="grid gap-1 text-xs text-[var(--pf-text-secondary)] sm:grid-cols-2">
          <div>
            <dt className="text-[var(--pf-text-muted)]">{t('defaultMethod')}</dt>
            <dd>{methodLabel}</dd>
          </div>
          <div>
            <dt className="text-[var(--pf-text-muted)]">{t('defaultPeriod')}</dt>
            <dd>{periodLabel}</dd>
          </div>
        </dl>
      )}
    </li>
  );
}
