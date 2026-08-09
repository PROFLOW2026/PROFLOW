'use client';

import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
import type { CostCategoryRow, CostFamily, ProjectOption, VendorOption, WorkPackageOption } from '@/modules/expenses/domain/types';
import type { RecurrenceCadence } from '@/modules/expenses/domain/types';
import { rtlFlipClassName } from '@/shared/i18n/ltr-island';
import { AllocationEditor, type AllocationDraft } from './allocation-editor';

const OVERHEAD_VALUE = '__overhead__';
const NONE_VALUE = '__none__';

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
  netAmount: string;
  taxAmount: string;
  paymentMethod: string;
  notes: string;
  recurrenceCadence: RecurrenceCadence;
  recurrenceCustomLabel: string;
  allocations: AllocationDraft[];
}

export interface ExpenseFormProps {
  readonly mode: 'create' | 'edit';
  readonly defaultCurrency: string;
  readonly initialValues?: Partial<ExpenseFormValues>;
  readonly projects: readonly ProjectOption[];
  readonly categories: readonly CostCategoryRow[];
  readonly workPackages: readonly WorkPackageOption[];
  readonly vendors?: readonly VendorOption[];
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
  readOnly = false,
  onProjectChange,
  error,
  fieldErrors = {},
  children,
}: ExpenseFormProps) {
  const t = useTranslations('expenses');
  const tCommon = useTranslations('common');
  const [showMore, setShowMore] = React.useState(
    Boolean(initialValues?.vendorId || initialValues?.allocations?.length || initialValues?.taxAmount),
  );
  const [showAdvanced, setShowAdvanced] = React.useState(
    Boolean(initialValues?.allocations?.length || initialValues?.taxAmount),
  );

  const [amount, setAmount] = React.useState(initialValues?.amount ?? '');
  const [currency] = React.useState(initialValues?.currency ?? defaultCurrency);
  const [description, setDescription] = React.useState(initialValues?.description ?? '');
  const [expenseDate, setExpenseDate] = React.useState(initialValues?.expenseDate ?? '');
  const [supplierName, setSupplierName] = React.useState(initialValues?.supplierName ?? '');
  const [vendorId, setVendorId] = React.useState(initialValues?.vendorId ?? '');
  const [targeting, setTargeting] = React.useState(
    initialValues?.targeting ??
      (initialValues?.projectId ? initialValues.projectId : initialValues?.targeting === OVERHEAD_VALUE ? OVERHEAD_VALUE : NONE_VALUE),
  );
  const [workPackageId, setWorkPackageId] = React.useState(initialValues?.workPackageId ?? '');
  const [costFamily, setCostFamily] = React.useState<CostFamily | ''>(initialValues?.costFamily ?? '');
  const [costCategoryId, setCostCategoryId] = React.useState(initialValues?.costCategoryId ?? '');
  const [netAmount, setNetAmount] = React.useState(initialValues?.netAmount ?? '');
  const [taxAmount, setTaxAmount] = React.useState(initialValues?.taxAmount ?? '');
  const [paymentMethod, setPaymentMethod] = React.useState(initialValues?.paymentMethod ?? '');
  const [notes, setNotes] = React.useState(initialValues?.notes ?? '');
  const [recurrenceCadence, setRecurrenceCadence] = React.useState<RecurrenceCadence>(
    initialValues?.recurrenceCadence ?? 'one_time',
  );
  const [recurrenceCustomLabel, setRecurrenceCustomLabel] = React.useState(
    initialValues?.recurrenceCustomLabel ?? '',
  );
  const [allocations, setAllocations] = React.useState<AllocationDraft[]>(initialValues?.allocations ?? []);

  const isOverhead = targeting === OVERHEAD_VALUE;
  const projectId = isOverhead || targeting === NONE_VALUE ? '' : targeting;

  function handleTargetingChange(value: string) {
    setTargeting(value);
    if (value !== OVERHEAD_VALUE && value !== NONE_VALUE) {
      onProjectChange?.(value);
    }
  }

  const filteredCategories = costFamily
    ? categories.filter((category) => category.family === costFamily)
    : categories;

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
                <SelectItem value={NONE_VALUE}>{t('targeting.none')}</SelectItem>
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
        <Button type="button" variant="ghost" className="self-start" onClick={() => setShowMore(true)}>
          {tCommon('actions.showMore')}
          <ChevronRight className={rtlFlipClassName('size-4')} aria-hidden />
        </Button>
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
                onValueChange={(value) => setCostCategoryId(value === NONE_VALUE ? '' : value)}
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

          {isOverhead ? (
            <Field label={t('fields.recurrence')} optionalLabel={tCommon('labels.optional')}>
              {(controlProps) => (
                <Select
                  value={recurrenceCadence}
                  onValueChange={(value) => setRecurrenceCadence(value as RecurrenceCadence)}
                  disabled={readOnly}
                >
                  <SelectTrigger {...controlProps}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['one_time', 'monthly', 'quarterly', 'yearly', 'custom'] as const).map((cadence) => (
                      <SelectItem key={cadence} value={cadence}>
                        {t(`recurrence.${cadence}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          ) : null}

          <input type="hidden" name="recurrenceCadence" value={recurrenceCadence} />

          {isOverhead && recurrenceCadence === 'custom' ? (
            <Field label={t('fields.recurrenceCustom')}>
              {(controlProps) => (
                <Input
                  {...controlProps}
                  name="recurrenceCustomLabel"
                  value={recurrenceCustomLabel}
                  onChange={(event) => setRecurrenceCustomLabel(event.target.value)}
                  disabled={readOnly}
                />
              )}
            </Field>
          ) : (
            <input type="hidden" name="recurrenceCustomLabel" value={recurrenceCustomLabel} />
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

              <AllocationEditor
                currency={currency}
                totalAmount={amount}
                projects={projects}
                categories={categories}
                value={allocations}
                onChange={setAllocations}
                disabled={readOnly}
              />
              <input type="hidden" name="allocations" value={JSON.stringify(allocations)} />
            </div>
          )}
        </section>
      )}

      {children}
    </div>
  );
}
