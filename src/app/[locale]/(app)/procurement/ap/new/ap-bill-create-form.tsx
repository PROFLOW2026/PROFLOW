'use client';

import { useMemo, useState, useActionState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { MoneyInput } from '@/components/patterns/money-input';
import { Alert } from '@/components/ui/alert';
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
import { addMoney, money, multiplyMoney, toNumericString, zeroMoney } from '@/shared/money/money';
import { RetentionCaptureFields } from '@/modules/retention/ui/retention-capture-fields';
import type { ExpenseOverlapCandidate } from '@/modules/financials/domain/expense-ap-overlap';
import { findSimilarFinalizedExpensesForBill } from '@/modules/financials/domain/expense-ap-overlap';
import { ExpenseApOverlapWarning } from '@/modules/financials/ui/expense-ap-overlap-warning';
import {
  findExpensesForVendorReference,
  findNonVoidBillsForVendorReference,
  type SupplierBillReferenceRow,
} from '@/modules/expenses/domain/supplier-cost-guidance';
import {
  DuplicateVendorBillReferenceWarning,
  SupplierExpenseMatchAffordance,
} from '@/modules/ap/ui/supplier-bill-reference-warnings';
import { createApBillAction, type ApFormState } from '../actions';

const NONE = '__none__';

interface LineDraft {
  key: string;
  description: string;
  quantity: string;
  unitAmount: string;
  lineTotal: string;
  purchaseOrderLineId: string;
  costCategoryId: string;
  inventoryItemId: string;
}

function newKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `line-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyLine(): LineDraft {
  return {
    key: newKey(),
    description: '',
    quantity: '1',
    unitAmount: '',
    lineTotal: '',
    purchaseOrderLineId: '',
    costCategoryId: '',
    inventoryItemId: '',
  };
}

function computeLineTotal(quantity: string, unitAmount: string, currency: string): string {
  if (!quantity.trim() || !unitAmount.trim()) return '';
  try {
    return toNumericString(multiplyMoney(money(unitAmount, currency), quantity));
  } catch {
    return '';
  }
}

export function ApBillCreateForm({
  defaultCurrency,
  vendors,
  projects,
  purchaseOrders,
  poLinesByPoId,
  paymentTerms,
  costCategories,
  defaultPurchaseOrderId = '',
  defaultVendorId = '',
  defaultProjectId = '',
  expenseOverlapCandidates = [],
  existingBills = [],
  inventoryItems = [],
}: {
  defaultCurrency: string;
  vendors: readonly { id: string; name: string; defaultPaymentTermId: string | null }[];
  projects: readonly { id: string; name: string }[];
  purchaseOrders: readonly { id: string; reference: string | null; vendorId: string }[];
  poLinesByPoId: Record<
    string,
    readonly { id: string; description: string; lineTotal: string; currency: string }[]
  >;
  paymentTerms: readonly { id: string; name: string }[];
  costCategories: readonly { id: string; key: string; name: string; family: string }[];
  defaultPurchaseOrderId?: string;
  defaultVendorId?: string;
  defaultProjectId?: string;
  expenseOverlapCandidates?: readonly ExpenseOverlapCandidate[];
  existingBills?: readonly SupplierBillReferenceRow[];
  inventoryItems?: readonly { id: string; name: string }[];
}) {
  const t = useTranslations('ap.create');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<ApFormState, FormData>(createApBillAction, {});

  const initialPo = purchaseOrders.find((po) => po.id === defaultPurchaseOrderId) ?? null;
  const [vendorId, setVendorId] = useState(() => {
    if (initialPo?.vendorId) return initialPo.vendorId;
    if (defaultVendorId && vendors.some((vendor) => vendor.id === defaultVendorId)) {
      return defaultVendorId;
    }
    return '';
  });
  const [projectId, setProjectId] = useState(() =>
    defaultProjectId && projects.some((project) => project.id === defaultProjectId)
      ? defaultProjectId
      : '',
  );
  const [reference, setReference] = useState('');
  const [acknowledgeDuplicateReference, setAcknowledgeDuplicateReference] = useState(false);
  const [linkExpenseId, setLinkExpenseId] = useState('');
  const [purchaseOrderId, setPurchaseOrderId] = useState(initialPo?.id ?? '');
  const [paymentTermId, setPaymentTermId] = useState(() => {
    const id =
      initialPo?.vendorId ??
      (defaultVendorId && vendors.some((vendor) => vendor.id === defaultVendorId)
        ? defaultVendorId
        : '');
    const vendor = vendors.find((row) => row.id === id);
    return vendor?.defaultPaymentTermId ?? '';
  });
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const currency = defaultCurrency;

  const filteredPos = useMemo(
    () => purchaseOrders.filter((po) => !vendorId || po.vendorId === vendorId),
    [purchaseOrders, vendorId],
  );

  const availablePoLines = useMemo(() => {
    if (!purchaseOrderId || purchaseOrderId === NONE) return [];
    return poLinesByPoId[purchaseOrderId] ?? [];
  }, [poLinesByPoId, purchaseOrderId]);

  const totalAmount = useMemo(() => {
    try {
      return toNumericString(
        lines.reduce((sum, line) => {
          if (!line.lineTotal.trim()) return sum;
          return addMoney(sum, money(line.lineTotal, currency));
        }, zeroMoney(currency)),
      );
    } catch {
      return '0';
    }
  }, [currency, lines]);

  const linesPayload = useMemo(
    () =>
      JSON.stringify(
        lines
          .filter((line) => line.description.trim() && line.unitAmount.trim() && line.lineTotal.trim())
          .map((line) => ({
            description: line.description.trim(),
            quantity: line.quantity.trim() || '1',
            unitAmount: line.unitAmount.trim(),
            lineTotal: line.lineTotal.trim(),
            currency,
            purchaseOrderLineId: line.purchaseOrderLineId.trim() || null,
            costCategoryId: line.costCategoryId.trim() || null,
            inventoryItemId:
              line.inventoryItemId && line.inventoryItemId !== NONE ? line.inventoryItemId : null,
            costFamily:
              costCategories.find((c) => c.id === line.costCategoryId)?.family ?? null,
          })),
      ),
    [currency, lines, costCategories],
  );

  const duplicateReferenceHits = useMemo(
    () =>
      findNonVoidBillsForVendorReference({ vendorId, reference }, existingBills).map((bill) => ({
        id: bill.id,
        label: bill.reference?.trim() || bill.id.slice(0, 8),
        href: `/procurement/ap/${bill.id}`,
      })),
    [existingBills, reference, vendorId],
  );

  const expenseReferenceHits = useMemo(
    () =>
      findExpensesForVendorReference({ vendorId, reference }, expenseOverlapCandidates).map(
        (expense) => ({
          id: expense.id,
          label: expense.description?.trim() || expense.id.slice(0, 8),
          href: `/expenses/${expense.id}`,
        }),
      ),
    [expenseOverlapCandidates, reference, vendorId],
  );

  const selectedLinkExpenseId = expenseReferenceHits.some((hit) => hit.id === linkExpenseId)
    ? linkExpenseId
    : '';

  const overlapHits = useMemo(() => {
    if (!vendorId || Number(totalAmount) <= 0) return [];
    return findSimilarFinalizedExpensesForBill(
      {
        vendorId,
        projectId: projectId && projectId !== NONE ? projectId : null,
        totalAmount,
        currency,
      },
      expenseOverlapCandidates,
    ).map((expense) => ({
      id: expense.id,
      label: expense.description?.trim() || expense.id.slice(0, 8),
      amount: expense.netAmount,
      currency: expense.currency,
      href: `/expenses/${expense.id}`,
    }));
  }, [currency, expenseOverlapCandidates, projectId, totalAmount, vendorId]);

  return (
    <form action={formAction} className="flex w-full min-w-0 max-w-2xl flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <ExpenseApOverlapWarning hits={overlapHits} namespace="ap.create" />
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="confirmDistinctCosts"
          value="true"
          className="mt-1"
          checked={acknowledgeDuplicateReference}
          onChange={(event) => setAcknowledgeDuplicateReference(event.target.checked)}
        />
        <span>{t('overlapConfirmDistinct')}</span>
      </label>

      {selectedLinkExpenseId ? (
        <input type="hidden" name="linkExpenseId" value={selectedLinkExpenseId} />
      ) : null}
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="totalAmount" value={totalAmount} />
      <input type="hidden" name="lines" value={linesPayload} />
      <input type="hidden" name="vendorId" value={vendorId} />
      <input type="hidden" name="projectId" value={projectId === NONE ? '' : projectId} />
      <input
        type="hidden"
        name="purchaseOrderId"
        value={purchaseOrderId === NONE ? '' : purchaseOrderId}
      />
      <input
        type="hidden"
        name="paymentTermId"
        value={paymentTermId === NONE ? '' : paymentTermId}
      />

      <Field label={t('vendorLabel')} required>
        {(props) => (
          <Select
            value={vendorId || undefined}
            onValueChange={(value) => {
              setVendorId(value);
              setPurchaseOrderId('');
              const vendor = vendors.find((row) => row.id === value);
              setPaymentTermId(vendor?.defaultPaymentTermId ?? '');
            }}
          >
            <SelectTrigger {...props}>
              <SelectValue placeholder={t('vendorPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {vendors.map((vendor) => (
                <SelectItem key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label={t('projectLabel')}>
        {(props) => (
          <Select value={projectId || NONE} onValueChange={setProjectId}>
            <SelectTrigger {...props}>
              <SelectValue placeholder={t('projectNone')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t('projectNone')}</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label={t('poLabel')}>
        {(props) => (
          <Select
            value={purchaseOrderId || NONE}
            onValueChange={(value) => {
              setPurchaseOrderId(value);
              setLines((prev) => prev.map((row) => ({ ...row, purchaseOrderLineId: '' })));
            }}
          >
            <SelectTrigger {...props}>
              <SelectValue placeholder={t('poNone')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t('poNone')}</SelectItem>
              {filteredPos.map((po) => (
                <SelectItem key={po.id} value={po.id}>
                  {po.reference?.trim() || po.id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label={t('referenceLabel')}>
        {(props) => (
          <Input
            {...props}
            name="reference"
            value={reference}
            onChange={(event) => {
              setReference(event.target.value);
              setAcknowledgeDuplicateReference(false);
            }}
          />
        )}
      </Field>

      <DuplicateVendorBillReferenceWarning
        hits={duplicateReferenceHits}
        acknowledged={acknowledgeDuplicateReference}
        onAcknowledgedChange={setAcknowledgeDuplicateReference}
      />
      <SupplierExpenseMatchAffordance
        hits={expenseReferenceHits}
        selectedExpenseId={selectedLinkExpenseId}
        onSelectExpenseId={setLinkExpenseId}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('billDateLabel')}>
          {(props) => <Input {...props} name="billDate" type="date" dir="ltr" />}
        </Field>
        <Field label={t('dueDateLabel')} description={t('dueDateHint')}>
          {(props) => <Input {...props} name="dueDate" type="date" dir="ltr" />}
        </Field>
      </div>

      {paymentTerms.length > 0 ? (
        <Field label={t('paymentTermLabel')} description={t('paymentTermHint')}>
          {(props) => (
            <Select value={paymentTermId || NONE} onValueChange={setPaymentTermId}>
              <SelectTrigger {...props}>
                <SelectValue placeholder={t('paymentTermNone')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('paymentTermNone')}</SelectItem>
                {paymentTerms.map((term) => (
                  <SelectItem key={term.id} value={term.id}>
                    {term.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      ) : null}

      <Field label={t('notesLabel')}>
        {(props) => <Textarea {...props} name="notes" rows={3} />}
      </Field>

      <div className="rounded-lg border border-[var(--pf-border-default)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">{t('linesTitle')}</h2>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setLines((prev) => [...prev, emptyLine()])}
          >
            <Plus aria-hidden className="size-4" />
            {t('addLine')}
          </Button>
        </div>
        {inventoryItems.length > 0 ? (
          <p className="mt-2 text-xs text-[var(--pf-text-secondary)]">{t('inventoryStockHint')}</p>
        ) : null}

        <div className="mt-3 flex flex-col gap-4">
          {lines.map((line, index) => (
            <div
              key={line.key}
              className="grid gap-3 rounded-md border border-[var(--pf-border-default)] p-3 sm:grid-cols-2"
            >
              <Field label={t('lineDescription')} className="sm:col-span-2">
                {(props) => (
                  <Input
                    {...props}
                    value={line.description}
                    onChange={(event) => {
                      const description = event.target.value;
                      setLines((prev) =>
                        prev.map((row, i) => (i === index ? { ...row, description } : row)),
                      );
                    }}
                  />
                )}
              </Field>
              <Field label={t('lineQuantity')}>
                {(props) => (
                  <Input
                    {...props}
                    dir="ltr"
                    value={line.quantity}
                    onChange={(event) => {
                      const quantity = event.target.value;
                      setLines((prev) =>
                        prev.map((row, i) =>
                          i === index
                            ? {
                                ...row,
                                quantity,
                                lineTotal: computeLineTotal(quantity, row.unitAmount, currency),
                              }
                            : row,
                        ),
                      );
                    }}
                  />
                )}
              </Field>
              <Field label={t('lineUnitAmount')}>
                {(props) => (
                  <MoneyInput
                    {...props}
                    value={line.unitAmount}
                    onValueChange={(unitAmount) => {
                      setLines((prev) =>
                        prev.map((row, i) =>
                          i === index
                            ? {
                                ...row,
                                unitAmount,
                                lineTotal: computeLineTotal(row.quantity, unitAmount, currency),
                              }
                            : row,
                        ),
                      );
                    }}
                  />
                )}
              </Field>
              {availablePoLines.length > 0 ? (
                <Field label={t('linePoLine')} className="sm:col-span-2">
                  {(props) => (
                    <Select
                      value={line.purchaseOrderLineId || NONE}
                      onValueChange={(value) => {
                        const nextId = value === NONE ? '' : value;
                        const poLine = availablePoLines.find((item) => item.id === nextId);
                        setLines((prev) =>
                          prev.map((row, i) =>
                            i === index
                              ? {
                                  ...row,
                                  purchaseOrderLineId: nextId,
                                  description:
                                    row.description.trim() || poLine?.description || row.description,
                                }
                              : row,
                          ),
                        );
                      }}
                    >
                      <SelectTrigger {...props}>
                        <SelectValue placeholder={t('linePoLineNone')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>{t('linePoLineNone')}</SelectItem>
                        {availablePoLines.map((poLine) => (
                          <SelectItem key={poLine.id} value={poLine.id}>
                            {poLine.description} · {poLine.lineTotal} {poLine.currency}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </Field>
              ) : null}
              <Field label={t('lineCategory')} className="sm:col-span-2">
                {(props) => (
                  <Select
                    value={line.costCategoryId || NONE}
                    onValueChange={(value) => {
                      const nextId = value === NONE ? '' : value;
                      setLines((prev) =>
                        prev.map((row, i) =>
                          i === index ? { ...row, costCategoryId: nextId } : row,
                        ),
                      );
                    }}
                  >
                    <SelectTrigger {...props}>
                      <SelectValue placeholder={t('lineCategoryNone')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t('lineCategoryNone')}</SelectItem>
                      {costCategories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
              {inventoryItems.length > 0 ? (
                <Field label={t('inventoryItemLabel')} className="sm:col-span-2">
                  {(props) => (
                    <Select
                      value={line.inventoryItemId || NONE}
                      onValueChange={(value) => {
                        const nextId = value === NONE ? '' : value;
                        setLines((prev) =>
                          prev.map((row, i) =>
                            i === index ? { ...row, inventoryItemId: nextId } : row,
                          ),
                        );
                      }}
                    >
                      <SelectTrigger {...props}>
                        <SelectValue placeholder={t('inventoryItemNone')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>{t('inventoryItemNone')}</SelectItem>
                        {inventoryItems.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </Field>
              ) : null}
              <div className="flex flex-wrap items-end justify-between gap-2 sm:col-span-2">
                <p className="text-sm text-[var(--pf-text-secondary)]">
                  {t('lineTotal')}:{' '}
                  <span dir="ltr" className="pf-numeric">
                    {line.lineTotal || '-'} {currency}
                  </span>
                </p>
                {lines.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <Trash2 aria-hidden className="size-4" />
                    {t('removeLine')}
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-3 text-sm font-medium">
          {t('totalLabel')}:{' '}
          <span dir="ltr" className="pf-numeric">
            {totalAmount} {currency}
          </span>
        </p>
      </div>

      <RetentionCaptureFields
        namespace="ap.retention"
        currency={currency}
        totalAmount={totalAmount}
      />

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="amountIncludesTax" defaultChecked className="mt-1" />
        <span>
          <span className="font-medium">{t('amountIncludesTax')}</span>
          <span className="mt-0.5 block text-[var(--pf-text-secondary)]">{t('taxSplitHint')}</span>
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="asDraft" className="mt-1" />
        <span>
          <span className="font-medium">{t('saveAsDraft')}</span>
          <span className="mt-0.5 block text-[var(--pf-text-secondary)]">{t('saveAsDraftHint')}</span>
        </span>
      </label>

      <p className="text-sm text-[var(--pf-text-secondary)]">{t('actualVsPayableHint')}</p>

      {duplicateReferenceHits.length > 0 && !acknowledgeDuplicateReference ? (
        <p className="text-sm text-[var(--pf-status-warning-fg)]">{t('duplicateReferenceBlocked')}</p>
      ) : null}

      <Button
        type="submit"
        loading={pending}
        disabled={!vendorId || (duplicateReferenceHits.length > 0 && !acknowledgeDuplicateReference)}
      >
        {pending ? tCommon('states.saving') : t('submit')}
      </Button>
    </form>
  );
}
