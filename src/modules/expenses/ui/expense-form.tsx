'use client';

import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MoneyInput } from '@/components/patterns/money-input';
import { computeTaxAmountBreakdown } from '@/modules/tax/domain/amounts';
import type {
  AllocationMethod,
  AllocationScheduleMode,
  CategoryPeriodBehavior,
  CostCategoryRow,
  CostFamily,
  ProjectOption,
  RecurrenceCadence,
  VendorOption,
  WorkPackageOption,
} from '@/modules/expenses/domain/types';
import { isWeightAllocationMethod } from '@/modules/expenses/domain/types';
import { scheduleModeFromCategoryPeriodBehavior } from '@/modules/expenses/domain/allocation-schedule';
import { formatMoney } from '@/shared/money/format';
import { rtlFlipClassName } from '@/shared/i18n/ltr-island';
import { Link } from '@/shared/i18n/navigation';
import { AllocationEditor, type AllocationDraft } from './allocation-editor';

const OVERHEAD_VALUE = '__overhead__';
const NONE_VALUE = '__none__';
const MANUAL_DRIVER = '__manual__';

const WEIGHT_METHODS: readonly AllocationMethod[] = [
  'contract_weight',
  'labor_hours_weight',
  'direct_cost_weight',
  'equal_split',
];

export interface ExpenseFormValues {
  amount: string;
  currency: string;
  description: string;
  expenseDate: string;
  supplierName: string;
  vendorId: string;
  targeting: string;
  projectId: string;
  workPackageId: string;
  costFamily: CostFamily | '';
  costCategoryId: string;
  /** true = כולל מע״מ; false = לא כולל מע״מ */
  amountIncludesTax: boolean;
  netAmount: string;
  taxAmount: string;
  paymentMethod: string;
  notes: string;
  recurrenceCadence: RecurrenceCadence;
  recurrenceCustomLabel: string;
  allocations: AllocationDraft[];
  allocationDriverMethod: AllocationMethod | '';
  allocationPeriodStart: string;
  allocationPeriodEnd: string;
  allocationScheduleMode: AllocationScheduleMode | '';
}

export interface ExpenseFormProps {
  readonly mode: 'create' | 'edit';
  readonly defaultCurrency: string;
  readonly initialValues?: Partial<ExpenseFormValues>;
  readonly projects: readonly ProjectOption[];
  readonly categories: readonly CostCategoryRow[];
  readonly workPackages: readonly WorkPackageOption[];
  readonly vendors?: readonly VendorOption[];
  /**
   * Org default percentage tax rate for live נטו / מע״מ / סה״כ preview.
   * From resolveApplicableDefaultTax - never a hardcoded Israeli rate.
   */
  readonly taxRatePercent?: string | null;
  readonly readOnly?: boolean;
  readonly onProjectChange?: (projectId: string) => void;
  readonly error?: string | null;
  readonly fieldErrors?: Record<string, string>;
  readonly children?: React.ReactNode;
}

export function ExpenseForm({
  mode,
  defaultCurrency,
  initialValues,
  projects,
  categories,
  workPackages,
  vendors = [],
  taxRatePercent = null,
  readOnly = false,
  onProjectChange,
  error,
  fieldErrors = {},
  children,
}: ExpenseFormProps) {
  const t = useTranslations('expenses');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const [showMore, setShowMore] = React.useState(
    Boolean(
      initialValues?.vendorId ||
        initialValues?.allocations?.length ||
        initialValues?.taxAmount ||
        !initialValues?.projectId,
    ),
  );
  const [showAdvanced, setShowAdvanced] = React.useState(
    Boolean(initialValues?.taxAmount && initialValues?.netAmount),
  );

  const [amount, setAmount] = React.useState(initialValues?.amount ?? '');
  const [currency] = React.useState(initialValues?.currency ?? defaultCurrency);
  const [description, setDescription] = React.useState(initialValues?.description ?? '');
  const [expenseDate, setExpenseDate] = React.useState(initialValues?.expenseDate ?? '');
  const [supplierName, setSupplierName] = React.useState(initialValues?.supplierName ?? '');
  const [vendorId, setVendorId] = React.useState(initialValues?.vendorId ?? '');
  const [targeting, setTargeting] = React.useState(() => {
    if (initialValues?.projectId) return initialValues.projectId;
    if (initialValues?.targeting === OVERHEAD_VALUE || initialValues?.targeting === NONE_VALUE) {
      return OVERHEAD_VALUE;
    }
    if (initialValues?.targeting && initialValues.targeting !== NONE_VALUE) {
      return initialValues.targeting;
    }
    return OVERHEAD_VALUE;
  });
  const [workPackageId, setWorkPackageId] = React.useState(initialValues?.workPackageId ?? '');
  const [costFamily, setCostFamily] = React.useState<CostFamily | ''>(initialValues?.costFamily ?? '');
  const [costCategoryId, setCostCategoryId] = React.useState(initialValues?.costCategoryId ?? '');
  const [includesTax, setIncludesTax] = React.useState(
    initialValues?.amountIncludesTax ? 'including' : 'excluding',
  );
  const [netAmount, setNetAmount] = React.useState(initialValues?.netAmount ?? '');
  const [taxAmount, setTaxAmount] = React.useState(initialValues?.taxAmount ?? '');
  const [paymentMethod, setPaymentMethod] = React.useState(initialValues?.paymentMethod ?? '');
  const [notes, setNotes] = React.useState(initialValues?.notes ?? '');
  const [recurrenceCadence, setRecurrenceCadence] = React.useState<RecurrenceCadence>(
    initialValues?.recurrenceCadence ?? 'one_time',
  );
  const [recurrenceCustomLabel] = React.useState(
    initialValues?.recurrenceCustomLabel ?? '',
  );
  const [allocations, setAllocations] = React.useState<AllocationDraft[]>(initialValues?.allocations ?? []);
  const [allocationDriverMethod, setAllocationDriverMethod] = React.useState<AllocationMethod | ''>(
    initialValues?.allocationDriverMethod ?? '',
  );
  const [allocationPeriodStart, setAllocationPeriodStart] = React.useState(
    initialValues?.allocationPeriodStart ?? '',
  );
  const [allocationPeriodEnd, setAllocationPeriodEnd] = React.useState(
    initialValues?.allocationPeriodEnd ?? '',
  );
  const [allocationScheduleMode, setAllocationScheduleMode] = React.useState<AllocationScheduleMode | ''>(
    initialValues?.allocationScheduleMode ?? '',
  );
  /** Once the operator changes driver/period after a category apply, stop re-applying. */
  const [policyOverridden, setPolicyOverridden] = React.useState(false);

  const isOverhead = targeting === OVERHEAD_VALUE;
  const projectId = isOverhead || targeting === NONE_VALUE ? '' : targeting;
  const usesAutomaticDriver =
    Boolean(allocationDriverMethod) && isWeightAllocationMethod(allocationDriverMethod as AllocationMethod);
  const hasProjectAllocation = allocations.some(
    (line) => line.targetType === 'project' && Boolean(line.projectId),
  );
  const showOverheadUnallocatedWarning =
    isOverhead && !hasProjectAllocation && !usesAutomaticDriver;

  const selectedCategory = costCategoryId
    ? categories.find((category) => category.id === costCategoryId) ?? null
    : null;

  const hasManualTaxOverride = Boolean(netAmount.trim() || taxAmount.trim());

  const taxPreview = React.useMemo(() => {
    if (hasManualTaxOverride) return null;
    const entered = amount.trim();
    if (!entered) return null;
    try {
      const amountIncludesTax = includesTax === 'including';
      const resolved =
        taxRatePercent && taxRatePercent.trim() !== ''
          ? ({ method: 'percentage' as const, ratePercent: taxRatePercent })
          : null;
      if (amountIncludesTax && !resolved) return null;
      const breakdown = computeTaxAmountBreakdown({
        enteredAmount: entered,
        currency,
        amountIncludesTax,
        resolved,
      });
      return {
        net: formatMoney(breakdown.net, locale, { currencyDisplay: 'narrowSymbol' }),
        tax: formatMoney(breakdown.tax, locale, { currencyDisplay: 'narrowSymbol' }),
        gross: formatMoney(breakdown.gross, locale, { currencyDisplay: 'narrowSymbol' }),
        netAmountRaw: breakdown.net.amount,
      };
    } catch {
      return null;
    }
  }, [amount, currency, hasManualTaxOverride, includesTax, locale, taxRatePercent]);

  /** Manual allocation lines must sum to NET (Actual Cost basis). */
  const allocationTotalAmount = taxPreview?.netAmountRaw ?? amount;

  function applyCategoryPolicy(category: CostCategoryRow | null | undefined) {
    if (!category) return;
    if (category.family) {
      setCostFamily(category.family);
    }
    const defaultMethod = category.defaultAllocationMethod;
    if (defaultMethod && isWeightAllocationMethod(defaultMethod)) {
      setAllocationDriverMethod(defaultMethod);
      setAllocations([]);
    } else if (defaultMethod === 'manual_amount' || defaultMethod === 'manual_percent') {
      setAllocationDriverMethod('');
    }
    applyPeriodBehavior(category.defaultPeriodBehavior);
    setPolicyOverridden(false);
  }

  function applyPeriodBehavior(behavior: CategoryPeriodBehavior | null | undefined) {
    if (!behavior) {
      setAllocationScheduleMode('');
      return;
    }
    const scheduleMode = scheduleModeFromCategoryPeriodBehavior(behavior);
    setAllocationScheduleMode(scheduleMode ?? '');
    if (behavior === 'one_time') {
      setRecurrenceCadence('one_time');
      return;
    }
    if (behavior === 'monthly') {
      setRecurrenceCadence('monthly');
      return;
    }
    // date_range / annual: prefer yearly cadence and expose period date fields.
    setRecurrenceCadence('yearly');
  }

  function handleTargetingChange(value: string) {
    setTargeting(value);
    if (value === OVERHEAD_VALUE || value === NONE_VALUE) {
      setShowMore(true);
    } else {
      onProjectChange?.(value);
    }
  }

  const filteredCategories = costFamily
    ? categories.filter((category) => category.family === costFamily)
    : categories;

  const policyMethodMatches =
    !selectedCategory?.defaultAllocationMethod ||
    (isWeightAllocationMethod(selectedCategory.defaultAllocationMethod)
      ? allocationDriverMethod === selectedCategory.defaultAllocationMethod
      : !allocationDriverMethod);

  const policyPeriodMatches = (() => {
    const behavior = selectedCategory?.defaultPeriodBehavior;
    if (!behavior) return true;
    if (behavior === 'one_time') return recurrenceCadence === 'one_time';
    if (behavior === 'monthly') return recurrenceCadence === 'monthly';
    return recurrenceCadence === 'yearly' || Boolean(allocationPeriodStart && allocationPeriodEnd);
  })();

  const showingPolicyOverride = Boolean(selectedCategory) && (policyOverridden || !policyMethodMatches || !policyPeriodMatches);

  return (
    <div className="flex min-w-0 w-full flex-col gap-6">
      {error ? (
        <p className="rounded-md border border-[var(--pf-action-danger)] bg-[var(--pf-status-danger-bg)] px-3 py-2 text-start text-sm text-[var(--pf-status-danger-fg)]">
          {error}
        </p>
      ) : null}

      <section className="flex min-w-0 flex-col gap-4">
        <Field
          label={t('fields.amount')}
          required
          error={fieldErrors.amount}
        >
          {(controlProps) => (
            <MoneyInput
              {...controlProps}
              value={amount}
              onValueChange={setAmount}
              disabled={readOnly}
              autoFocus={mode === 'create'}
              className="text-lg"
            />
          )}
        </Field>

        <input type="hidden" name="currency" value={currency} />
        <input type="hidden" name="amount" value={amount} />
        <input
          type="hidden"
          name="amountIncludesTax"
          value={includesTax === 'including' ? 'true' : 'false'}
        />

        <Field
          label={t('fields.amountTaxMode')}
          error={fieldErrors.amountIncludesTax}
          description={t('fields.amountTaxModeHint')}
        >
          {(controlProps) => (
            <Select
              value={includesTax}
              onValueChange={setIncludesTax}
              disabled={readOnly || hasManualTaxOverride}
            >
              <SelectTrigger {...controlProps}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="excluding">{t('fields.amountExcludingTax')}</SelectItem>
                <SelectItem value="including">{t('fields.amountIncludingTax')}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>

        {taxPreview ? (
          <dl
            className="grid gap-2 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-3 py-2 text-sm sm:grid-cols-3"
            aria-live="polite"
          >
            <div>
              <dt className="text-xs text-[var(--pf-text-muted)]">{t('fields.previewNet')}</dt>
              <dd className="pf-ltr-island font-medium tabular-nums" dir="ltr">
                {taxPreview.net}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--pf-text-muted)]">{t('fields.previewTax')}</dt>
              <dd className="pf-ltr-island font-medium tabular-nums" dir="ltr">
                {taxPreview.tax}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--pf-text-muted)]">{t('fields.previewGross')}</dt>
              <dd className="pf-ltr-island font-medium tabular-nums" dir="ltr">
                {taxPreview.gross}
              </dd>
            </div>
            <p className="text-xs text-[var(--pf-text-muted)] sm:col-span-3">
              {t('fields.previewActualHint')}
            </p>
          </dl>
        ) : null}

        <Field label={t('fields.description')} optionalLabel={tCommon('labels.optional')}>
          {(controlProps) => (
            <Input
              {...controlProps}
              name="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={readOnly}
              placeholder={t('placeholders.description')}
            />
          )}
        </Field>

        <Field label={t('fields.target')}>
          {(controlProps) => (
            <Select value={targeting} onValueChange={handleTargetingChange} disabled={readOnly}>
              <SelectTrigger {...controlProps}>
                <SelectValue placeholder={t('placeholders.target')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={OVERHEAD_VALUE}>{t('targeting.overhead')}</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        {isOverhead ? (
          <p className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-3 py-2 text-start text-sm text-[var(--pf-text-secondary)]">
            {t('allocation.subtitle')}
          </p>
        ) : null}

        {showOverheadUnallocatedWarning ? (
          <p
            role="status"
            className="rounded-md border border-[var(--pf-status-warning-border)] bg-[var(--pf-status-warning-bg)] px-3 py-2 text-start text-sm text-[var(--pf-status-warning-fg)]"
          >
            {t('lifecycle.overheadUnallocatedWarning')}
          </p>
        ) : null}

        <input type="hidden" name="projectId" value={projectId} />

        {projectId ? (
          <Field label={t('fields.workPackage')} optionalLabel={tCommon('labels.optional')}>
            {(controlProps) => (
              <Select
                value={workPackageId || NONE_VALUE}
                onValueChange={(value) => setWorkPackageId(value === NONE_VALUE ? '' : value)}
                disabled={readOnly}
              >
                <SelectTrigger {...controlProps}>
                  <SelectValue placeholder={t('placeholders.workPackageDefault')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>{t('placeholders.workPackageDefault')}</SelectItem>
                  {workPackages.map((pkg) => (
                    <SelectItem key={pkg.id} value={pkg.id}>
                      {pkg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
        ) : null}

        <input type="hidden" name="workPackageId" value={workPackageId} />
        <input type="hidden" name="vendorId" value={vendorId} />

        <Field label={t('fields.supplier')} optionalLabel={tCommon('labels.optional')}>
          {(controlProps) => (
            <Input
              {...controlProps}
              name="supplierName"
              value={supplierName}
              onChange={(event) => setSupplierName(event.target.value)}
              disabled={readOnly}
              placeholder={t('placeholders.supplier')}
            />
          )}
        </Field>
      </section>

      {!showMore ? (
        <>
          <input
            type="hidden"
            name="allocations"
            value={isOverhead && !usesAutomaticDriver ? JSON.stringify(allocations) : '[]'}
          />
          <input type="hidden" name="allocationDriverMethod" value={allocationDriverMethod} />
          <input type="hidden" name="allocationPeriodStart" value={allocationPeriodStart} />
          <input type="hidden" name="allocationPeriodEnd" value={allocationPeriodEnd} />
          <input type="hidden" name="allocationScheduleMode" value={allocationScheduleMode} />
          <input type="hidden" name="recurrenceCadence" value={recurrenceCadence} />
          <input type="hidden" name="recurrenceCustomLabel" value={recurrenceCustomLabel} />
          <input type="hidden" name="costFamily" value={costFamily} />
          <input type="hidden" name="costCategoryId" value={costCategoryId} />
          {showOverheadUnallocatedWarning ? (
            <p role="status" className="text-sm text-[var(--pf-status-warning-fg)]">
              {t('lifecycle.overheadUnallocatedWarning')}
            </p>
          ) : null}
          <Button type="button" variant="ghost" className="self-start" onClick={() => setShowMore(true)}>
            {tCommon('actions.showMore')}
            <ChevronRight className={rtlFlipClassName('size-4')} aria-hidden />
          </Button>
        </>
      ) : (
        <section className="flex flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] p-4">
          <h2 className="text-sm font-semibold">{tCommon('actions.showMore')}</h2>

          {vendors.length > 0 ? (
            <Field label={t('fields.linkedVendor')} optionalLabel={tCommon('labels.optional')}>
              {(controlProps) => (
                <Select
                  value={vendorId || NONE_VALUE}
                  onValueChange={(value) => setVendorId(value === NONE_VALUE ? '' : value)}
                  disabled={readOnly}
                >
                  <SelectTrigger {...controlProps}>
                    <SelectValue placeholder={t('placeholders.vendor')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>{t('placeholders.vendorNone')}</SelectItem>
                    {vendors.map((vendor) => (
                      <SelectItem key={vendor.id} value={vendor.id}>
                        {vendor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          ) : null}

          <Field label={t('fields.date')} optionalLabel={tCommon('labels.optional')}>
            {(controlProps) => (
              <Input
                {...controlProps}
                type="date"
                name="expenseDate"
                value={expenseDate}
                onChange={(event) => setExpenseDate(event.target.value)}
                disabled={readOnly}
                dir="ltr"
              />
            )}
          </Field>

          <Field label={t('fields.costFamily')} optionalLabel={tCommon('labels.optional')}>
            {(controlProps) => (
              <Select
                value={costFamily || NONE_VALUE}
                onValueChange={(value) => {
                  setCostFamily(value === NONE_VALUE ? '' : (value as CostFamily));
                  setCostCategoryId('');
                }}
                disabled={readOnly}
              >
                <SelectTrigger {...controlProps}>
                  <SelectValue placeholder={t('placeholders.costFamily')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>{t('placeholders.costFamily')}</SelectItem>
                  {(['direct_project', 'shared', 'business_overhead', 'asset_capital'] as const).map((family) => (
                    <SelectItem key={family} value={family}>
                      {t(`costFamilies.${family}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          <input type="hidden" name="costFamily" value={costFamily} />

          <Field label={t('fields.category')} optionalLabel={tCommon('labels.optional')}>
            {(controlProps) => (
              <Select
                value={costCategoryId || NONE_VALUE}
                onValueChange={(value) => {
                  const nextId = value === NONE_VALUE ? '' : value;
                  setCostCategoryId(nextId);
                  const category = categories.find((item) => item.id === nextId);
                  if (nextId && category) {
                    applyCategoryPolicy(category);
                    if (isOverhead || category.family === 'shared' || category.family === 'business_overhead') {
                      setShowMore(true);
                    }
                  } else {
                    setPolicyOverridden(false);
                  }
                }}
                disabled={readOnly}
              >
                <SelectTrigger {...controlProps}>
                  <SelectValue placeholder={t('placeholders.category')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>{t('placeholders.category')}</SelectItem>
                  {filteredCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.isSystem ? t(`costCategories.${category.key}`) : category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          <input type="hidden" name="costCategoryId" value={costCategoryId} />

          {selectedCategory ? (
            <div
              role="status"
              className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-3 py-2 text-start text-sm"
            >
              <p className="font-medium text-[var(--pf-text-primary)]">{t('categoryPolicy.title')}</p>
              <dl className="mt-2 grid gap-1 text-xs text-[var(--pf-text-secondary)] sm:grid-cols-3">
                <div>
                  <dt className="text-[var(--pf-text-muted)]">{t('categoryPolicy.family')}</dt>
                  <dd>{t(`costFamilies.${selectedCategory.family}`)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--pf-text-muted)]">{t('categoryPolicy.method')}</dt>
                  <dd>
                    {selectedCategory.defaultAllocationMethod
                      ? selectedCategory.defaultAllocationMethod === 'manual_amount'
                        ? t('allocation.methods.amount')
                        : selectedCategory.defaultAllocationMethod === 'manual_percent'
                          ? t('allocation.methods.percent')
                          : t(`allocation.methods.${selectedCategory.defaultAllocationMethod}`)
                      : t('categoryPolicy.none')}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--pf-text-muted)]">{t('categoryPolicy.period')}</dt>
                  <dd>
                    {selectedCategory.defaultPeriodBehavior
                      ? t(`recurrence.${selectedCategory.defaultPeriodBehavior}`)
                      : t('categoryPolicy.none')}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-[var(--pf-text-muted)]">
                {showingPolicyOverride
                  ? t('categoryPolicy.overridden')
                  : t('categoryPolicy.fromPolicy')}
                {' · '}
                {t('categoryPolicy.overrideHint')}
              </p>
            </div>
          ) : null}

          {isOverhead ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">
              {t('fields.recurrenceUseDrafts')}{' '}
              <Link href="/recurring-drafts" className="underline underline-offset-2">
                {t('fields.recurrenceDraftsLink')}
              </Link>
            </p>
          ) : null}

          <input type="hidden" name="recurrenceCadence" value={recurrenceCadence} />

          <input type="hidden" name="recurrenceCustomLabel" value={recurrenceCustomLabel} />

          {isOverhead ? (
            <>
              <Field label={t('allocation.driverLabel')}>
                {(controlProps) => (
                  <Select
                    value={allocationDriverMethod || MANUAL_DRIVER}
                    onValueChange={(value) => {
                      setPolicyOverridden(true);
                      if (value === MANUAL_DRIVER) {
                        setAllocationDriverMethod('');
                        return;
                      }
                      setAllocationDriverMethod(value as AllocationMethod);
                      setAllocations([]);
                    }}
                    disabled={readOnly}
                  >
                    <SelectTrigger {...controlProps}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={MANUAL_DRIVER}>{t('allocation.driverManual')}</SelectItem>
                      {WEIGHT_METHODS.map((method) => (
                        <SelectItem key={method} value={method}>
                          {t(`allocation.methods.${method}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
              <input type="hidden" name="allocationDriverMethod" value={allocationDriverMethod} />
              <input type="hidden" name="allocationScheduleMode" value={allocationScheduleMode} />

              {usesAutomaticDriver || selectedCategory?.defaultPeriodBehavior === 'date_range' ? (
                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <Field label={t('allocation.periodStart')}>
                    {(controlProps) => (
                      <Input
                        {...controlProps}
                        type="date"
                        name="allocationPeriodStart"
                        value={allocationPeriodStart}
                        onChange={(event) => {
                          setAllocationPeriodStart(event.target.value);
                          setPolicyOverridden(true);
                        }}
                        disabled={readOnly}
                        dir="ltr"
                      />
                    )}
                  </Field>
                  <Field label={t('allocation.periodEnd')}>
                    {(controlProps) => (
                      <Input
                        {...controlProps}
                        type="date"
                        name="allocationPeriodEnd"
                        value={allocationPeriodEnd}
                        onChange={(event) => {
                          setAllocationPeriodEnd(event.target.value);
                          setPolicyOverridden(true);
                        }}
                        disabled={readOnly}
                        dir="ltr"
                      />
                    )}
                  </Field>
                </div>
              ) : (
                <>
                  <input type="hidden" name="allocationPeriodStart" value="" />
                  <input type="hidden" name="allocationPeriodEnd" value="" />
                </>
              )}

              <p className="text-xs text-[var(--pf-text-muted)]">
                {usesAutomaticDriver
                  ? t('allocation.autoDriverHint')
                  : `${t('allocation.period')}: ${t(`recurrence.${recurrenceCadence}`)}${
                      hasProjectAllocation ? ` · ${t('lifecycle.overheadAllocatedHint')}` : ''
                    }`}
              </p>

              {!usesAutomaticDriver ? (
                <>
                  <AllocationEditor
                    currency={currency}
                    totalAmount={allocationTotalAmount}
                    projects={projects}
                    categories={categories}
                    value={allocations}
                    onChange={setAllocations}
                    disabled={readOnly}
                    periodLabel={t(`recurrence.${recurrenceCadence}`)}
                  />
                  <input type="hidden" name="allocations" value={JSON.stringify(allocations)} />
                </>
              ) : (
                <input type="hidden" name="allocations" value="[]" />
              )}
            </>
          ) : (
            <>
              <input type="hidden" name="allocationDriverMethod" value={allocationDriverMethod} />
              <input type="hidden" name="allocationScheduleMode" value={allocationScheduleMode} />
              <input type="hidden" name="allocationPeriodStart" value={allocationPeriodStart} />
              <input type="hidden" name="allocationPeriodEnd" value={allocationPeriodEnd} />
              <input type="hidden" name="allocations" value="[]" />
            </>
          )}

          <Field label={t('fields.notes')} optionalLabel={tCommon('labels.optional')}>
            {(controlProps) => (
              <Textarea
                {...controlProps}
                name="notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                disabled={readOnly}
                rows={3}
              />
            )}
          </Field>

          {!showAdvanced ? (
            <Button type="button" variant="ghost" className="self-start" onClick={() => setShowAdvanced(true)}>
              {tCommon('actions.showMore')}
              <ChevronRight className={rtlFlipClassName('size-4')} aria-hidden />
            </Button>
          ) : (
            <div className="flex flex-col gap-4 border-t border-[var(--pf-border-default)] pt-4">
              <h3 className="text-sm font-semibold">{tCommon('actions.showMore')}</h3>

              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <Field label={t('fields.netAmount')} optionalLabel={tCommon('labels.optional')}>
                  {(controlProps) => (
                    <MoneyInput
                      {...controlProps}
                      name="netAmount"
                      value={netAmount}
                      onValueChange={setNetAmount}
                      disabled={readOnly}
                    />
                  )}
                </Field>

                <Field label={t('fields.taxAmount')} optionalLabel={tCommon('labels.optional')}>
                  {(controlProps) => (
                    <MoneyInput
                      {...controlProps}
                      name="taxAmount"
                      value={taxAmount}
                      onValueChange={setTaxAmount}
                      disabled={readOnly}
                    />
                  )}
                </Field>
              </div>

              <Field label={t('fields.paymentMethod')} optionalLabel={tCommon('labels.optional')}>
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    name="paymentMethod"
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                    disabled={readOnly}
                  />
                )}
              </Field>

              {!isOverhead ? (
                <input type="hidden" name="allocations" value="[]" />
              ) : null}
            </div>
          )}

          {!isOverhead && !showAdvanced ? (
            <input type="hidden" name="allocations" value="[]" />
          ) : null}
        </section>
      )}

      {children}
    </div>
  );
}
