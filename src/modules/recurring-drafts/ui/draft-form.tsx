'use client';

import { useActionState, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MoneyInput } from '@/components/patterns/money-input';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type {
  DraftKind,
  DraftFrequency,
  ManagerialCostKind,
  StoredDraftPayload,
} from '../domain/types';
import { DRAFT_FREQUENCIES } from '../domain/types';
import { retroMonthRangeFromStart } from '../domain/missing-months';
import { ExpenseVatModeSelector } from '@/modules/expenses/ui/expense-vat-mode-selector';
import { displayCostCategoryName } from '@/modules/expenses/domain/cost-category-display';
import {
  DEFAULT_EXPENSE_VAT_MODE,
  isExpenseVatMode,
  type ExpenseVatMode,
} from '@/modules/expenses/domain/vat-mode';
import type { CostCategoryRow, CostFamily } from '@/modules/expenses/domain/types';
import { isDeprecatedForNewTransactionEntry } from '@/modules/financials/domain/economic-classification';

const COST_FAMILY_ORDER: readonly CostFamily[] = [
  'direct_project',
  'shared',
  'business_overhead',
  'asset_capital',
];

const NONE = '__none__';
type ExpenseDestination = 'project' | 'general' | 'shared';
type CreationMode = 'automatic' | 'draft';

export interface RecurringDraftFormState {
  readonly error?: string;
  readonly fieldErrors?: Record<string, string>;
  readonly success?: boolean;
  readonly historyMessage?: string;
}

export interface RecurringDraftFormOption {
  readonly id: string;
  readonly name: string;
}

function initialDestination(payload: StoredDraftPayload | undefined): ExpenseDestination {
  if (!payload || payload.kind !== 'expense') return 'general';
  if (payload.data.costFamily === 'shared') return 'shared';
  if (payload.data.costFamily === 'business_overhead') return 'general';
  if (payload.data.projectId) return 'project';
  return 'general';
}

export function RecurringDraftForm({
  mode,
  action,
  defaultCurrency,
  defaultNextRunDate,
  writableKinds,
  vendors,
  projects,
  categories = [],
  initial,
  expenseFocused = false,
}: {
  mode: 'create' | 'edit';
  action: (prev: RecurringDraftFormState, formData: FormData) => Promise<RecurringDraftFormState>;
  defaultCurrency: string;
  defaultNextRunDate: string;
  writableKinds: readonly DraftKind[];
  vendors: readonly RecurringDraftFormOption[];
  projects: readonly RecurringDraftFormOption[];
  categories?: readonly CostCategoryRow[];
  expenseFocused?: boolean;
  initial?: {
    readonly draftId?: string;
    readonly title: string;
    readonly draftKind: DraftKind;
    readonly frequency: DraftFrequency;
    readonly intervalCount: number;
    readonly nextRunDate: string;
    readonly endDate: string | null;
    readonly autoFinalizeExpense?: boolean;
    readonly managerialCostKind?: ManagerialCostKind | null;
    readonly payload?: StoredDraftPayload;
  };
}) {
  const t = useTranslations('recurringDrafts');
  const tExpenses = useTranslations('expenses');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState(action, {} as RecurringDraftFormState);

  const initialKind = initial?.draftKind ?? writableKinds[0] ?? 'expense';
  const showExpensePrimary = expenseFocused || initialKind === 'expense';

  const [kind, setKind] = useState<DraftKind>(initialKind);
  const [frequency, setFrequency] = useState<DraftFrequency>(initial?.frequency ?? 'monthly');
  const [startDate, setStartDate] = useState(initial?.nextRunDate ?? defaultNextRunDate);
  const [destination, setDestination] = useState<ExpenseDestination>(initialDestination(initial?.payload));
  const [projectId, setProjectId] = useState(payloadString(initial?.payload, 'projectId') || NONE);
  const [vendorId, setVendorId] = useState(payloadString(initial?.payload, 'vendorId') || '');
  const [amount, setAmount] = useState(initialAmount(initial?.payload, defaultCurrency).amount);
  const [currency, setCurrency] = useState(
    initialAmount(initial?.payload, defaultCurrency).currency,
  );
  const [creationMode, setCreationMode] = useState<CreationMode>(() =>
    initial?.autoFinalizeExpense === false ? 'draft' : 'automatic',
  );
  const [costCategoryId, setCostCategoryId] = useState(
    initial?.payload?.kind === 'expense' ? (initial.payload.data.costCategoryId ?? '') : '',
  );
  const [generateRetro, setGenerateRetro] = useState(true);
  const [vatMode, setVatMode] = useState<ExpenseVatMode>(() => {
    if (initial?.payload?.kind === 'expense' && isExpenseVatMode(initial.payload.data.vatMode)) {
      return initial.payload.data.vatMode;
    }
    return DEFAULT_EXPENSE_VAT_MODE;
  });

  const kinds = mode === 'edit' ? [initialKind] : writableKinds;
  const isMonthlyExpenseForm = showExpensePrimary && kind === 'expense' && frequency === 'monthly';

  const retroPreview = useMemo(() => {
    if (mode !== 'create' || !isMonthlyExpenseForm) return null;
    return retroMonthRangeFromStart(startDate, defaultNextRunDate, null);
  }, [mode, isMonthlyExpenseForm, startDate, defaultNextRunDate]);

  const showRetroOption =
    mode === 'create' && isMonthlyExpenseForm && retroPreview != null && retroPreview.count > 0;

  const filteredCategories = categories.filter(
    (category) => !isDeprecatedForNewTransactionEntry(category.key),
  );
  const categoriesByFamily = COST_FAMILY_ORDER.map((family) => ({
    family,
    items: filteredCategories.filter((category) => category.family === family),
  })).filter((group) => group.items.length > 0);

  return (
    <form action={formAction} className="mx-auto flex w-full max-w-lg flex-col gap-5">
      {initial?.draftId ? <input type="hidden" name="draftId" value={initial.draftId} /> : null}
      {mode === 'edit' ? <input type="hidden" name="draftKind" value={initialKind} /> : null}
      <input type="hidden" name="frequency" value={frequency} />
      <input type="hidden" name="nextRunDate" value={startDate} />
      {showExpensePrimary && kind === 'expense' ? (
        <input
          type="hidden"
          name="managerialCostKind"
          value={
            destination === 'project'
              ? 'direct_project'
              : destination === 'general'
                ? 'general_business'
                : ''
          }
        />
      ) : null}
      {showExpensePrimary && kind === 'expense' && destination === 'shared' ? (
        <input type="hidden" name="expenseDestination" value="shared" />
      ) : null}

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field
        label={showExpensePrimary && kind === 'expense' ? t('fields.expenseTitle') : t('fields.title')}
        required
        error={state.fieldErrors?.title}
      >
        {(controlProps) => (
          <Input
            {...controlProps}
            name="title"
            required
            maxLength={200}
            defaultValue={initial?.title ?? ''}
          />
        )}
      </Field>

      {showExpensePrimary && kind === 'expense' ? (
        <>
          <Field label={t('fields.amount')} required error={state.fieldErrors?.amount}>
            {(controlProps) => (
              <>
                <MoneyInput {...controlProps} value={amount} onValueChange={setAmount} required />
                <input type="hidden" name="amount" value={amount} />
              </>
            )}
          </Field>

          <Field label={t('fields.vatMode')}>
            {() => (
              <ExpenseVatModeSelector value={vatMode} onChange={setVatMode} name="vatMode" />
            )}
          </Field>

          <input type="hidden" name="currency" value={currency} />

          <Field label={t('fields.supplierName')} optionalLabel={tCommon('labels.optional')}>
            {(controlProps) => (
              <Input
                {...controlProps}
                name="supplierName"
                maxLength={500}
                defaultValue={payloadString(initial?.payload, 'supplierName')}
              />
            )}
          </Field>

          <Field
            label={t('fields.costCategory')}
            required
            error={state.fieldErrors?.costCategoryId}
          >
            {(controlProps) => (
              <>
                <input type="hidden" name="costCategoryId" value={costCategoryId} />
                <Select value={costCategoryId || NONE} onValueChange={(value) => setCostCategoryId(value === NONE ? '' : value)}>
                  <SelectTrigger {...controlProps}>
                    <SelectValue placeholder={tExpenses('placeholders.category')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{tExpenses('placeholders.category')}</SelectItem>
                    {categoriesByFamily.map((group) => (
                      <SelectGroup key={group.family}>
                        <SelectLabel>{tExpenses(`costFamilies.${group.family}`)}</SelectLabel>
                        {group.items.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {displayCostCategoryName(category, (key) => tExpenses(key))}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </Field>

          <Field label={t('fields.destination')} required error={state.fieldErrors?.projectId}>
            {(controlProps) => (
              <>
                <Select
                  value={destination}
                  onValueChange={(value) => setDestination(value as ExpenseDestination)}
                >
                  <SelectTrigger {...controlProps}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="project">{t('destination.project')}</SelectItem>
                    <SelectItem value="general">{t('destination.general')}</SelectItem>
                    <SelectItem value="shared">{t('destination.shared')}</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}
          </Field>

          {destination === 'project' || destination === 'shared' ? (
            <Field
              label={t('fields.project')}
              required={destination === 'project'}
              error={state.fieldErrors?.projectId}
            >
              {(controlProps) => (
                <>
                  <input type="hidden" name="projectId" value={projectId === NONE ? '' : projectId} />
                  <Select value={projectId} onValueChange={setProjectId}>
                    <SelectTrigger {...controlProps}>
                      <SelectValue placeholder={t('fields.project')} />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </Field>
          ) : (
            <input type="hidden" name="projectId" value="" />
          )}

          <Field label={t('fields.frequency')} required>
            {(controlProps) => (
              <Select value={frequency} onValueChange={(value) => setFrequency(value as DraftFrequency)}>
                <SelectTrigger {...controlProps}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DRAFT_FREQUENCIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`frequency.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          <Field
            label={isMonthlyExpenseForm ? t('fields.startDate') : t('fields.nextRunDate')}
            required
            error={state.fieldErrors?.nextRunDate}
          >
            {(controlProps) => (
              <Input
                {...controlProps}
                name="startDateDisplay"
                type="date"
                required
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                dir="ltr"
              />
            )}
          </Field>

          <Field label={t('fields.endDate')} optionalLabel={tCommon('labels.optional')}>
            {(controlProps) => (
              <Input
                {...controlProps}
                name="endDate"
                type="date"
                defaultValue={initial?.endDate ?? ''}
                dir="ltr"
              />
            )}
          </Field>

          {showRetroOption ? (
            <div className="flex flex-col gap-2 rounded-lg border border-[var(--pf-border-default)] p-3">
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  name="generateRetroMonths"
                  value="true"
                  checked={generateRetro}
                  onChange={(event) => setGenerateRetro(event.target.checked)}
                  className="mt-1 size-4"
                />
                <span>
                  <span className="font-medium">{t('retro.createPast')}</span>
                  <span className="mt-1 block text-[var(--pf-text-secondary)]">
                    {t('retro.preview', {
                      count: retroPreview!.count,
                      from: retroPreview!.fromYearMonth,
                      to: retroPreview!.toYearMonth,
                    })}
                  </span>
                </span>
              </label>
            </div>
          ) : null}

          <details className="rounded-lg border border-[var(--pf-border-default)] p-3">
            <summary className="cursor-pointer text-sm font-medium">{t('advanced.title')}</summary>
            <div className="mt-4 flex flex-col gap-4">
              <Field label={t('fields.description')} optionalLabel={tCommon('labels.optional')}>
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    name="description"
                    maxLength={2000}
                    defaultValue={payloadString(initial?.payload, 'description')}
                  />
                )}
              </Field>
              <Field label={t('fields.intervalCount')} required>
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    name="intervalCount"
                    type="number"
                    min={1}
                    max={52}
                    defaultValue={String(initial?.intervalCount ?? 1)}
                    dir="ltr"
                  />
                )}
              </Field>
              <fieldset className="flex flex-col gap-3">
                <legend className="text-sm font-medium">{t('advanced.creationMode')}</legend>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="radio"
                    name="creationMode"
                    value="automatic"
                    checked={creationMode === 'automatic'}
                    onChange={() => setCreationMode('automatic')}
                    className="mt-1 size-4"
                  />
                  <span>
                    <span className="font-medium">{t('advanced.automaticLabel')}</span>
                    <span className="mt-1 block text-[var(--pf-text-secondary)]">
                      {t('advanced.automaticHint')}
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="radio"
                    name="creationMode"
                    value="draft"
                    checked={creationMode === 'draft'}
                    onChange={() => setCreationMode('draft')}
                    className="mt-1 size-4"
                  />
                  <span>
                    <span className="font-medium">{t('advanced.draftLabel')}</span>
                    <span className="mt-1 block text-[var(--pf-text-secondary)]">
                      {t('advanced.draftHint')}
                    </span>
                  </span>
                </label>
              </fieldset>
            </div>
          </details>
        </>
      ) : (
        <>
          <Field label={t('fields.kind')} required>
            {(controlProps) =>
              mode === 'edit' ? (
                <Input {...controlProps} value={t(`kind.${initialKind}`)} readOnly />
              ) : (
                <>
                  <Select name="draftKind" value={kind} onValueChange={(value) => setKind(value as DraftKind)}>
                    <SelectTrigger {...controlProps}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {kinds.map((value) => (
                        <SelectItem key={value} value={value}>
                          {t(`kind.${value}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <input type="hidden" name="draftKind" value={kind} />
                </>
              )
            }
          </Field>

          <Field label={t('fields.frequency')} required>
            {(controlProps) => (
              <Select value={frequency} onValueChange={(value) => setFrequency(value as DraftFrequency)}>
                <SelectTrigger {...controlProps}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DRAFT_FREQUENCIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`frequency.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          <Field label={t('fields.intervalCount')} required>
            {(controlProps) => (
              <Input
                {...controlProps}
                name="intervalCount"
                type="number"
                min={1}
                max={52}
                defaultValue={String(initial?.intervalCount ?? 1)}
                dir="ltr"
              />
            )}
          </Field>

          <Field label={t('fields.nextRunDate')} required error={state.fieldErrors?.nextRunDate}>
            {(controlProps) => (
              <Input
                {...controlProps}
                type="date"
                required
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                dir="ltr"
              />
            )}
          </Field>

          <Field label={t('fields.endDate')} optionalLabel={tCommon('labels.optional')}>
            {(controlProps) => (
              <Input
                {...controlProps}
                name="endDate"
                type="date"
                defaultValue={initial?.endDate ?? ''}
                dir="ltr"
              />
            )}
          </Field>

          <Field label={t('fields.amount')} required error={state.fieldErrors?.amount}>
            {(controlProps) => (
              <>
                <MoneyInput {...controlProps} value={amount} onValueChange={setAmount} required />
                <input type="hidden" name="amount" value={amount} />
              </>
            )}
          </Field>

          <Field label={t('fields.currency')} required>
            {(controlProps) => (
              <Input
                {...controlProps}
                name="currency"
                value={currency}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                maxLength={3}
                dir="ltr"
                required
              />
            )}
          </Field>

          {kind === 'vendor_bill' ? (
            <>
              <Field label={t('fields.vendor')} required error={state.fieldErrors?.vendorId}>
                {(controlProps) => (
                  <>
                    <input type="hidden" name="vendorId" value={vendorId} />
                    <Select value={vendorId} onValueChange={setVendorId}>
                      <SelectTrigger {...controlProps}>
                        <SelectValue placeholder={t('fields.vendor')} />
                      </SelectTrigger>
                      <SelectContent>
                        {vendors.map((vendor) => (
                          <SelectItem key={vendor.id} value={vendor.id}>
                            {vendor.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </Field>
              <Field label={t('fields.lineDescription')} optionalLabel={tCommon('labels.optional')}>
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    name="lineDescription"
                    maxLength={500}
                    defaultValue={vendorLineDescription(initial?.payload)}
                  />
                )}
              </Field>
              <Field label={t('fields.reference')} optionalLabel={tCommon('labels.optional')}>
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    name="reference"
                    maxLength={80}
                    defaultValue={payloadString(initial?.payload, 'reference')}
                  />
                )}
              </Field>
              <Field label={t('fields.project')} optionalLabel={tCommon('labels.optional')}>
                {(controlProps) => (
                  <>
                    <input type="hidden" name="projectId" value={projectId === NONE ? '' : projectId} />
                    <Select value={projectId} onValueChange={setProjectId}>
                      <SelectTrigger {...controlProps}>
                        <SelectValue placeholder={t('fields.none')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>{t('fields.none')}</SelectItem>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </Field>
            </>
          ) : null}

          {kind === 'billing_record' ? (
            <Field label={t('fields.project')} required error={state.fieldErrors?.projectId}>
              {(controlProps) => (
                <>
                  <input type="hidden" name="projectId" value={projectId === NONE ? '' : projectId} />
                  <Select value={projectId} onValueChange={setProjectId}>
                    <SelectTrigger {...controlProps}>
                      <SelectValue placeholder={t('fields.project')} />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </Field>
          ) : null}

          <Field label={t('fields.notes')} optionalLabel={tCommon('labels.optional')}>
            {(controlProps) => (
              <Textarea
                {...controlProps}
                name="notes"
                rows={3}
                defaultValue={payloadString(initial?.payload, 'notes')}
              />
            )}
          </Field>
        </>
      )}

      {showExpensePrimary && kind === 'expense' ? (
        <input type="hidden" name="draftKind" value="expense" />
      ) : null}

      <Button type="submit" disabled={pending} className="min-h-11 w-full sm:w-auto">
        {pending
          ? tCommon('states.saving')
          : mode === 'edit'
            ? t('edit.submit')
            : showExpensePrimary
              ? t('create.fixedExpenseSubmit')
              : t('create.submit')}
      </Button>
    </form>
  );
}

function initialAmount(
  payload: StoredDraftPayload | undefined,
  fallbackCurrency: string,
): { amount: string; currency: string } {
  if (!payload) return { amount: '', currency: fallbackCurrency };
  if (payload.kind === 'expense') {
    return { amount: payload.data.amount, currency: payload.data.currency || fallbackCurrency };
  }
  if (payload.kind === 'vendor_bill') {
    return {
      amount: payload.data.totalAmount,
      currency: payload.data.currency || fallbackCurrency,
    };
  }
  return {
    amount: payload.data.amount,
    currency: payload.data.currency || fallbackCurrency,
  };
}

function payloadString(payload: StoredDraftPayload | undefined, key: string): string {
  if (!payload) return '';
  const value = (payload.data as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

function vendorLineDescription(payload: StoredDraftPayload | undefined): string {
  if (!payload || payload.kind !== 'vendor_bill') return '';
  return payload.data.lines[0]?.description ?? '';
}
