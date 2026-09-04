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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { MoneyInput } from '@/components/patterns/money-input';
import { computeTaxAmountBreakdown } from '@/modules/tax/domain/amounts';
import type {
  AllocationMethod,
  AllocationScheduleMode,
  CategoryPeriodBehavior,
  CostCategoryRow,
  CostFamily,
  InventoryItemOption,
  ProjectOption,
  RecurrenceCadence,
  VendorOption,
  WorkPackageOption,
} from '@/modules/expenses/domain/types';
import { isWeightAllocationMethod } from '@/modules/expenses/domain/types';
import { scheduleModeFromCategoryPeriodBehavior } from '@/modules/expenses/domain/allocation-schedule';
import { INTERNAL_EMPLOYEE_PAYROLL_CATEGORY_KEY } from '@/modules/financials/domain/labor-expense-integrity';
import { isDeprecatedForNewTransactionEntry } from '@/modules/financials/domain/economic-classification';
import { displayCostCategoryName } from '@/modules/expenses/domain/cost-category-display';
import { formatMoney } from '@/shared/money/format';
import { money } from '@/shared/money/money';
import { rtlFlipClassName } from '@/shared/i18n/ltr-island';
import { Link } from '@/shared/i18n/navigation';
import { AllocationEditor, type AllocationDraft } from './allocation-editor';
import type { ApBillOverlapCandidate } from '@/modules/financials/domain/expense-ap-overlap';
import { findSimilarOpenApBillsForExpense } from '@/modules/financials/domain/expense-ap-overlap';
import { ExpenseApOverlapWarning } from '@/modules/financials/ui/expense-ap-overlap-warning';
import { ExpenseVatModeSelector } from './expense-vat-mode-selector';
import type { ExpenseVatMode } from '../domain/vat-mode';
import { resolveExpenseVatMode } from '../domain/vat-mode';

const OVERHEAD_VALUE = '__overhead__';
const NONE_VALUE = '__none__';
const MANUAL_DRIVER = '__manual__';

type ExpenseDestination = 'project' | 'general' | 'inventory' | 'asset';

const COST_FAMILY_ORDER: readonly CostFamily[] = [
  'direct_project',
  'shared',
  'business_overhead',
  'asset_capital',
];

const WEIGHT_METHODS: readonly AllocationMethod[] = [
  'contract_weight',
  'labor_hours_weight',
  'direct_cost_weight',
  'equal_split',
];

function resolveInitialDestination(initialValues?: Partial<ExpenseFormValues>): ExpenseDestination {
  if (initialValues?.inventoryStockPurchase) return 'inventory';
  if (initialValues?.costFamily === 'asset_capital') return 'asset';
  if (initialValues?.projectId) return 'project';
  if (initialValues?.targeting && initialValues.targeting !== OVERHEAD_VALUE && initialValues.targeting !== NONE_VALUE) {
    return 'project';
  }
  return 'general';
}

function hasAdvancedInitialValues(initialValues?: Partial<ExpenseFormValues>): boolean {
  if (!initialValues) return false;
  return Boolean(
    initialValues.vendorId ||
      initialValues.allocations?.length ||
      initialValues.taxAmount ||
      initialValues.netAmount ||
      initialValues.notes ||
      initialValues.paymentMethod ||
      initialValues.workPackageId ||
      (Number(initialValues.installmentCount) > 1) ||
      initialValues.inventoryStockPurchase ||
      initialValues.costFamily === 'asset_capital' ||
      (initialValues.recurrenceCadence && initialValues.recurrenceCadence !== 'one_time') ||
      initialValues.allocationDriverMethod,
  );
}

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
  /** @deprecated Use vatMode */
  amountIncludesTax?: boolean;
  vatMode?: ExpenseVatMode;
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
  installmentCount: string;
  installmentStartDate: string;
  inventoryStockPurchase: boolean;
  inventoryItemId: string;
  inventoryPurchaseQty: string;
}

export interface ExpenseFormProps {
  readonly mode: 'create' | 'edit';
  readonly defaultCurrency: string;
  readonly initialValues?: Partial<ExpenseFormValues>;
  readonly projects: readonly ProjectOption[];
  readonly categories: readonly CostCategoryRow[];
  readonly workPackages: readonly WorkPackageOption[];
  readonly vendors?: readonly VendorOption[];
  /** When provided, enables inventory stock purchase advanced capture. */
  readonly inventoryItems?: readonly InventoryItemOption[];
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
  /** Open AP bills for duplicate-capture warnings on create. */
  readonly apBillOverlapCandidates?: readonly ApBillOverlapCandidate[];
}

export function ExpenseForm({
  mode,
  defaultCurrency,
  initialValues,
  projects,
  categories,
  workPackages,
  vendors = [],
  inventoryItems = [],
  taxRatePercent = null,
  readOnly = false,
  onProjectChange,
  error,
  fieldErrors = {},
  children,
  apBillOverlapCandidates = [],
}: ExpenseFormProps) {
  const t = useTranslations('expenses');
  const tCommon = useTranslations('common');
  const locale = useLocale();

  const initialDestination = resolveInitialDestination(initialValues);
  const [showAdvancedOptions, setShowAdvancedOptions] = React.useState(
    () => hasAdvancedInitialValues(initialValues) || initialDestination === 'inventory' || initialDestination === 'asset',
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
  const [destination, setDestination] = React.useState<ExpenseDestination>(() => initialDestination);
  const [workPackageId, setWorkPackageId] = React.useState(initialValues?.workPackageId ?? '');
  const [costFamily, setCostFamily] = React.useState<CostFamily | ''>(initialValues?.costFamily ?? '');
  const [costCategoryId, setCostCategoryId] = React.useState(initialValues?.costCategoryId ?? '');
  const [vatMode, setVatMode] = React.useState<ExpenseVatMode>(() =>
    resolveExpenseVatMode({
      vatMode: initialValues?.vatMode,
      amountIncludesTax: initialValues?.amountIncludesTax,
      forCreate: mode === 'create',
    }),
  );
  const [netAmount, setNetAmount] = React.useState(initialValues?.netAmount ?? '');
  const [taxAmount, setTaxAmount] = React.useState(initialValues?.taxAmount ?? '');
  const [paymentMethod, setPaymentMethod] = React.useState(initialValues?.paymentMethod ?? '');
  const [notes, setNotes] = React.useState(initialValues?.notes ?? '');
  const [recurrenceCadence, setRecurrenceCadence] = React.useState<RecurrenceCadence>(
    initialValues?.recurrenceCadence ?? 'one_time',
  );
  const [recurrenceCustomLabel] = React.useState(initialValues?.recurrenceCustomLabel ?? '');
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
  const [installmentCount, setInstallmentCount] = React.useState(
    initialValues?.installmentCount?.trim() ? initialValues.installmentCount : '1',
  );
  const [installmentStartDate, setInstallmentStartDate] = React.useState(
    initialValues?.installmentStartDate ?? initialValues?.expenseDate ?? '',
  );
  const [inventoryStockPurchase, setInventoryStockPurchase] = React.useState(
    Boolean(initialValues?.inventoryStockPurchase),
  );
  const [inventoryItemId, setInventoryItemId] = React.useState(initialValues?.inventoryItemId ?? '');
  const [inventoryPurchaseQty, setInventoryPurchaseQty] = React.useState(
    initialValues?.inventoryPurchaseQty ?? '',
  );
  const [policyOverridden, setPolicyOverridden] = React.useState(false);

  const isOverhead = targeting === OVERHEAD_VALUE;
  const projectId = isOverhead || targeting === NONE_VALUE ? '' : targeting;
  const usesAutomaticDriver =
    Boolean(allocationDriverMethod) && isWeightAllocationMethod(allocationDriverMethod as AllocationMethod);
  const hasProjectAllocation = allocations.some(
    (line) => line.targetType === 'project' && Boolean(line.projectId),
  );
  const primaryDestination = destination === 'project' ? 'project' : 'general';
  const selectedCategory = costCategoryId
    ? categories.find((category) => category.id === costCategoryId) ?? null
    : null;
  const showSharedAllocationWarning =
    isOverhead &&
    selectedCategory?.family === 'shared' &&
    !hasProjectAllocation &&
    !usesAutomaticDriver;
  const showCompanyOnlyOverheadHint =
    primaryDestination === 'general' && selectedCategory?.family === 'business_overhead';

  const isInternalPayrollCategory =
    selectedCategory?.key.trim().toLowerCase() === INTERNAL_EMPLOYEE_PAYROLL_CATEGORY_KEY;

  const hasManualTaxOverride = Boolean(netAmount.trim() || taxAmount.trim());

  const taxPreview = React.useMemo(() => {
    if (hasManualTaxOverride) return null;
    const entered = amount.trim();
    if (!entered) return null;
    try {
      if (vatMode === 'zero') {
        const enteredAmount = money(amount.trim(), currency);
        return {
          net: formatMoney(enteredAmount, locale, { currencyDisplay: 'narrowSymbol' }),
          tax: formatMoney(money('0', currency), locale, { currencyDisplay: 'narrowSymbol' }),
          gross: formatMoney(enteredAmount, locale, { currencyDisplay: 'narrowSymbol' }),
          netAmountRaw: enteredAmount.amount,
        };
      }
      const amountIncludesTax = vatMode === 'inclusive';
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
  }, [amount, currency, hasManualTaxOverride, vatMode, locale, taxRatePercent]);

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
    setRecurrenceCadence('yearly');
  }

  function handleTargetingChange(value: string) {
    setTargeting(value);
    if (value === OVERHEAD_VALUE || value === NONE_VALUE) {
      if (destination === 'project') setDestination('general');
    } else {
      setDestination('project');
      onProjectChange?.(value);
    }
  }

  function handlePrimaryDestinationChange(value: 'project' | 'general') {
    if (value === 'project') {
      handleDestinationChange('project');
      return;
    }
    handleDestinationChange('general');
  }

  function handleDestinationChange(value: ExpenseDestination) {
    setDestination(value);
    if (value === 'project') {
      setInventoryStockPurchase(false);
      setInventoryItemId('');
      setInventoryPurchaseQty('');
      if (targeting === OVERHEAD_VALUE || targeting === NONE_VALUE) {
        const firstProject = projects[0]?.id;
        if (firstProject) {
          setTargeting(firstProject);
          onProjectChange?.(firstProject);
        }
      }
      if (costFamily === 'asset_capital') setCostFamily('');
      return;
    }
    if (value === 'general') {
      setTargeting(OVERHEAD_VALUE);
      setInventoryStockPurchase(false);
      setInventoryItemId('');
      setInventoryPurchaseQty('');
      if (costFamily === 'asset_capital') setCostFamily('');
      return;
    }
    if (value === 'inventory') {
      setTargeting(OVERHEAD_VALUE);
      setShowAdvancedOptions(true);
      setInventoryStockPurchase(true);
      if (costFamily === 'asset_capital') setCostFamily('');
      return;
    }
    setInventoryStockPurchase(false);
    setInventoryItemId('');
    setInventoryPurchaseQty('');
    setCostFamily('asset_capital');
    setCostCategoryId('');
    setShowAdvancedOptions(true);
  }

  const filteredCategories = (costFamily
    ? categories.filter((category) => category.family === costFamily)
    : categories
  ).filter((category) => !isDeprecatedForNewTransactionEntry(category.key));

  const categoriesByFamily = COST_FAMILY_ORDER.map((family) => ({
    family,
    items: filteredCategories.filter((category) => category.family === family),
  })).filter((group) => group.items.length > 0);

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

  const showingPolicyOverride =
    Boolean(selectedCategory) && (policyOverridden || !policyMethodMatches || !policyPeriodMatches);

  const captureNetAmount = netAmount.trim() || taxPreview?.netAmountRaw || '';
  const overlapHits = React.useMemo(() => {
    if (mode !== 'create' || !vendorId || !captureNetAmount.trim()) return [];
    return findSimilarOpenApBillsForExpense(
      {
        vendorId,
        projectId: projectId || null,
        netAmount: captureNetAmount,
        currency,
      },
      apBillOverlapCandidates,
    ).map((bill) => ({
      id: bill.id,
      label: bill.reference?.trim() || bill.id.slice(0, 8),
      amount: bill.netAmount,
      currency: bill.currency,
      href: `/procurement/ap/${bill.id}`,
    }));
  }, [apBillOverlapCandidates, captureNetAmount, currency, mode, projectId, vendorId]);

  function renderAdvancedHiddenInputs() {
    return (
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
        <input type="hidden" name="installmentCount" value={installmentCount || '1'} />
        <input type="hidden" name="installmentStartDate" value={installmentStartDate} />
        <input type="hidden" name="inventoryStockPurchase" value={inventoryStockPurchase ? 'true' : 'false'} />
        <input type="hidden" name="inventoryItemId" value={inventoryItemId} />
        <input type="hidden" name="inventoryPurchaseQty" value={inventoryPurchaseQty} />
        <input type="hidden" name="notes" value={notes} />
        <input type="hidden" name="netAmount" value={netAmount} />
        <input type="hidden" name="taxAmount" value={taxAmount} />
        <input type="hidden" name="paymentMethod" value={paymentMethod} />
        <input type="hidden" name="vendorId" value={vendorId} />
        <input type="hidden" name="workPackageId" value={workPackageId} />
      </>
    );
  }

  return (
    <div className="flex min-w-0 w-full flex-col gap-6">
      {error ? (
        <p className="rounded-md border border-[var(--pf-action-danger)] bg-[var(--pf-status-danger-bg)] px-3 py-2 text-start text-sm text-[var(--pf-status-danger-fg)]">
          {error}
        </p>
      ) : null}
      {mode === 'create' ? (
        <ExpenseApOverlapWarning hits={overlapHits} namespace="expenses.capture" />
      ) : null}

      <section className="flex min-w-0 flex-col gap-4">
        <Field label={t('fields.amount')} required error={fieldErrors.amount}>
          {(controlProps) => (
            <MoneyInput
              {...controlProps}
              value={amount}
              onValueChange={setAmount}
              currency={currency}
              disabled={readOnly}
              autoFocus={mode === 'create'}
              className="text-lg"
            />
          )}
        </Field>

        <input type="hidden" name="currency" value={currency} />
        <input type="hidden" name="amount" value={amount} />

        <Field
          label={t('fields.amountTaxMode')}
          error={fieldErrors.vatMode ?? fieldErrors.amountIncludesTax}
          description={t('fields.amountTaxModeHint')}
        >
          {(controlProps) => (
            <ExpenseVatModeSelector
              value={vatMode}
              onChange={setVatMode}
              disabled={readOnly || hasManualTaxOverride}
              controlId={controlProps.id}
              describedBy={controlProps['aria-describedby']}
            />
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

        <div id="expense-category" className="scroll-mt-24">
        <Field
          label={t('fields.category')}
          description={t('fields.categoryRequiredHint')}
          error={fieldErrors.costCategoryId}
        >
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
                    setShowAdvancedOptions(true);
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
                {categoriesByFamily.map((group) => (
                  <SelectGroup key={group.family}>
                    <SelectLabel>{t(`costFamilies.${group.family}`)}</SelectLabel>
                    {group.items.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {displayCostCategoryName(category, (key) => t(key))}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        </div>
        <input type="hidden" name="costCategoryId" value={costCategoryId} />

        {isInternalPayrollCategory ? (
          <p
            role="status"
            className="rounded-md border border-[var(--pf-status-warning-border)] bg-[var(--pf-status-warning-bg)] px-3 py-2 text-start text-sm text-[var(--pf-status-warning-fg)]"
          >
            {t('fields.internalPayrollWarning')}
          </p>
        ) : null}

        <Field label={t('destination.label')} description={t('fields.expenseType')}>
          {(controlProps) => (
            <Select
              value={primaryDestination}
              onValueChange={(value) => handlePrimaryDestinationChange(value as 'project' | 'general')}
              disabled={readOnly || destination === 'inventory' || destination === 'asset'}
            >
              <SelectTrigger {...controlProps}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="project">{t('destination.project')}</SelectItem>
                <SelectItem value="general">{t('generalBusiness')}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>

        {destination === 'inventory' ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('destination.inventory')}</p>
        ) : null}
        {destination === 'asset' ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('destination.asset')}</p>
        ) : null}

        {primaryDestination === 'project' ? (
          <Field label={t('fields.project')}>
            {(controlProps) => (
              <Select
                value={targeting === OVERHEAD_VALUE ? NONE_VALUE : targeting}
                onValueChange={(value) =>
                  handleTargetingChange(value === NONE_VALUE ? OVERHEAD_VALUE : value)
                }
                disabled={readOnly}
              >
                <SelectTrigger {...controlProps}>
                  <SelectValue placeholder={t('placeholders.target')} />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
        ) : (
          <input type="hidden" name="destinationTarget" value={OVERHEAD_VALUE} />
        )}

        {primaryDestination === 'general' ? (
          <p className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-3 py-2 text-start text-sm text-[var(--pf-text-secondary)]">
            {showCompanyOnlyOverheadHint
              ? t('lifecycle.companyOnlyOverheadHint')
              : t('allocation.subtitle')}
          </p>
        ) : null}

        {showSharedAllocationWarning ? (
          <p
            role="status"
            className="rounded-md border border-[var(--pf-status-warning-border)] bg-[var(--pf-status-warning-bg)] px-3 py-2 text-start text-sm text-[var(--pf-status-warning-fg)]"
          >
            {t('lifecycle.sharedUnallocatedWarning')}
          </p>
        ) : null}

        <input type="hidden" name="projectId" value={projectId} />

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

        {children}
      </section>

      {!showAdvancedOptions ? (
        <>
          {renderAdvancedHiddenInputs()}
          <Button
            type="button"
            variant="ghost"
            className="self-start"
            onClick={() => setShowAdvancedOptions(true)}
          >
            {t('advancedOptions')}
            <ChevronRight className={rtlFlipClassName('size-4')} aria-hidden />
          </Button>
        </>
      ) : (
        <section className="flex flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] p-4">
          <h2 className="text-sm font-semibold">{t('advancedOptions')}</h2>

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
          ) : (
            <input type="hidden" name="workPackageId" value={workPackageId} />
          )}

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
          ) : (
            <input type="hidden" name="vendorId" value={vendorId} />
          )}

          <Field
            label={t('fields.installmentCount')}
            optionalLabel={tCommon('labels.optional')}
            error={fieldErrors.installmentCount}
            description={t('fields.installmentHint')}
          >
            {(controlProps) => (
              <Input
                {...controlProps}
                type="number"
                name="installmentCount"
                min={1}
                max={120}
                step={1}
                value={installmentCount}
                onChange={(event) => setInstallmentCount(event.target.value)}
                disabled={readOnly}
                dir="ltr"
              />
            )}
          </Field>

          {Number(installmentCount) > 1 ? (
            <Field
              label={t('fields.installmentStart')}
              optionalLabel={tCommon('labels.optional')}
              error={fieldErrors.installmentStartDate}
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
                  type="date"
                  name="installmentStartDate"
                  value={installmentStartDate || expenseDate}
                  onChange={(event) => setInstallmentStartDate(event.target.value)}
                  disabled={readOnly}
                  dir="ltr"
                />
              )}
            </Field>
          ) : (
            <input type="hidden" name="installmentStartDate" value={installmentStartDate} />
          )}

          <Field label={t('destination.label')} optionalLabel={tCommon('labels.optional')}>
            {(controlProps) => (
              <Select
                value={destination}
                onValueChange={(value) => handleDestinationChange(value as ExpenseDestination)}
                disabled={readOnly}
              >
                <SelectTrigger {...controlProps}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="project">{t('destination.project')}</SelectItem>
                  <SelectItem value="general">{t('generalBusiness')}</SelectItem>
                  <SelectItem value="inventory">{t('destination.inventory')}</SelectItem>
                  <SelectItem value="asset">{t('destination.asset')}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </Field>

          {inventoryItems.length > 0 ? (
            <div className="flex flex-col gap-4 rounded-md border border-dashed border-[var(--pf-border-default)] p-3">
              <label className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  checked={inventoryStockPurchase}
                  onCheckedChange={(checked) => {
                    const next = checked === true;
                    setInventoryStockPurchase(next);
                    if (!next) {
                      setInventoryItemId('');
                      setInventoryPurchaseQty('');
                      if (destination === 'inventory') {
                        setDestination(projectId ? 'project' : 'general');
                      }
                    } else {
                      setDestination('inventory');
                      setTargeting(OVERHEAD_VALUE);
                    }
                  }}
                  disabled={readOnly}
                  aria-label={t('fields.inventoryStockPurchase')}
                />
                <span className="text-sm leading-snug">{t('fields.inventoryStockPurchase')}</span>
              </label>
              <input
                type="hidden"
                name="inventoryStockPurchase"
                value={inventoryStockPurchase ? 'true' : 'false'}
              />

              {inventoryStockPurchase ? (
                <>
                  <Field label={t('fields.inventoryItem')} error={fieldErrors.inventoryItemId}>
                    {(controlProps) => (
                      <Select
                        value={inventoryItemId || NONE_VALUE}
                        onValueChange={(value) =>
                          setInventoryItemId(value === NONE_VALUE ? '' : value)
                        }
                        disabled={readOnly}
                      >
                        <SelectTrigger {...controlProps}>
                          <SelectValue placeholder={t('placeholders.inventoryItem')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>{t('placeholders.inventoryItem')}</SelectItem>
                          {inventoryItems.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.name}
                              {item.unit ? ` (${item.unit})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </Field>
                  <input type="hidden" name="inventoryItemId" value={inventoryItemId} />

                  <Field
                    label={t('fields.inventoryPurchaseQty')}
                    error={fieldErrors.inventoryPurchaseQty}
                    description={t('fields.inventoryPurchaseQtyHint')}
                  >
                    {(controlProps) => (
                      <Input
                        {...controlProps}
                        name="inventoryPurchaseQty"
                        value={inventoryPurchaseQty}
                        onChange={(event) => setInventoryPurchaseQty(event.target.value)}
                        disabled={readOnly}
                        inputMode="decimal"
                        dir="ltr"
                      />
                    )}
                  </Field>
                </>
              ) : (
                <>
                  <input type="hidden" name="inventoryItemId" value="" />
                  <input type="hidden" name="inventoryPurchaseQty" value="" />
                </>
              )}
            </div>
          ) : (
            <>
              <input type="hidden" name="inventoryStockPurchase" value={inventoryStockPurchase ? 'true' : 'false'} />
              <input type="hidden" name="inventoryItemId" value={inventoryItemId} />
              <input type="hidden" name="inventoryPurchaseQty" value={inventoryPurchaseQty} />
            </>
          )}

          <input type="hidden" name="costFamily" value={costFamily} />

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
                {showingPolicyOverride ? t('categoryPolicy.overridden') : t('categoryPolicy.fromPolicy')}
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
            <div id="expense-allocation" className="flex scroll-mt-24 flex-col gap-3">
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
            </div>
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

          <div className="flex flex-col gap-4 border-t border-[var(--pf-border-default)] pt-4">
            <h3 className="text-sm font-semibold">{tCommon('actions.showAdvanced')}</h3>

            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <Field label={t('fields.netAmount')} optionalLabel={tCommon('labels.optional')}>
                {(controlProps) => (
                  <MoneyInput
                    {...controlProps}
                    name="netAmount"
                    value={netAmount}
                    onValueChange={setNetAmount}
                    currency={currency}
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
                    currency={currency}
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
          </div>
        </section>
      )}
    </div>
  );
}
