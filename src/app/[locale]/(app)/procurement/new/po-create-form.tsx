'use client';

import { useMemo, useState, useActionState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
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
import { createPurchaseOrderAction, type ProcurementFormState } from '../actions';

const NONE = '__none__';

export interface PoVendorOption {
  readonly id: string;
  readonly name: string;
}

export interface PoProjectOption {
  readonly id: string;
  readonly name: string;
}

export interface PoMaterialOption {
  readonly id: string;
  readonly name: string;
  readonly defaultUnitPrice: string | null;
  readonly currency: string | null;
}

interface LineDraft {
  key: string;
  description: string;
  materialItemId: string;
  quantity: string;
  unitAmount: string;
  lineTotal: string;
}

function newKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `line-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyLine(): LineDraft {
  return {
    key: newKey(),
    description: '',
    materialItemId: '',
    quantity: '1',
    unitAmount: '',
    lineTotal: '',
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

export function PurchaseOrderCreateForm({
  defaultCurrency,
  vendors,
  projects,
  materials,
}: {
  defaultCurrency: string;
  vendors: readonly PoVendorOption[];
  projects: readonly PoProjectOption[];
  materials: readonly PoMaterialOption[];
}) {
  const t = useTranslations('procurement.create');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<ProcurementFormState, FormData>(
    createPurchaseOrderAction,
    {},
  );

  const [vendorId, setVendorId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const currency = defaultCurrency;

  const committedAmount = useMemo(() => {
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
            materialItemId: line.materialItemId || undefined,
            quantity: line.quantity.trim() || '1',
            unitAmount: line.unitAmount.trim(),
            lineTotal: line.lineTotal.trim(),
            currency,
          })),
      ),
    [currency, lines],
  );

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, ...patch };
        if (patch.quantity !== undefined || patch.unitAmount !== undefined) {
          next.lineTotal = computeLineTotal(next.quantity, next.unitAmount, currency);
        }
        return next;
      }),
    );
  }

  function applyMaterial(index: number, materialId: string) {
    const material = materials.find((item) => item.id === materialId);
    updateLine(index, {
      materialItemId: materialId === NONE ? '' : materialId,
      description: material?.name ?? lines[index]?.description ?? '',
      unitAmount: material?.defaultUnitPrice ?? lines[index]?.unitAmount ?? '',
    });
  }

  return (
    <form action={formAction} className="flex w-full min-w-0 flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="committedAmount" value={committedAmount} />
      <input type="hidden" name="lines" value={linesPayload} />
      <input type="hidden" name="vendorId" value={vendorId} />
      <input type="hidden" name="projectId" value={projectId} />

      {projects.length > 0 && !projectId ? (
        <Alert tone="warning">{t('projectMissingWarning')}</Alert>
      ) : null}

      <MainAppFormGrid dense>
        <Field label={t('vendorLabel')} required error={state.fieldErrors?.vendorId} className={mainAppFieldSpan.lg}>
          {(control) => (
            <Select value={vendorId || NONE} onValueChange={(value) => setVendorId(value === NONE ? '' : value)}>
              <SelectTrigger {...control}>
                <SelectValue placeholder={t('vendorPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('vendorPlaceholder')}</SelectItem>
                {vendors.map((vendor) => (
                  <SelectItem key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        {projects.length > 0 ? (
          <Field label={t('projectLabel')} optionalLabel={tCommon('labels.optional')} className={mainAppFieldSpan.lg}>
            {(control) => (
              <Select
                value={projectId || NONE}
                onValueChange={(value) => setProjectId(value === NONE ? '' : value)}
              >
                <SelectTrigger {...control}>
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
        ) : null}

        <Field label={t('referenceLabel')} optionalLabel={tCommon('labels.optional')} className={mainAppFieldSpan.md}>
          {(control) => <Input {...control} name="reference" />}
        </Field>

        <Field label={t('orderedOnLabel')} optionalLabel={tCommon('labels.optional')} className={mainAppFieldSpan.md}>
          {(control) => <Input {...control} name="orderedOn" type="date" dir="ltr" />}
        </Field>
      </MainAppFormGrid>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{t('linesTitle')}</h2>
          <Button type="button" variant="ghost" size="sm" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
            <Plus aria-hidden />
            {t('addLine')}
          </Button>
        </div>

        {lines.map((line, index) => (
          <div
            key={line.key}
            className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-3"
          >
            {materials.length > 0 ? (
              <Field label={t('lineMaterial')} optionalLabel={tCommon('labels.optional')}>
                {(control) => (
                  <Select
                    value={line.materialItemId || NONE}
                    onValueChange={(value) => applyMaterial(index, value)}
                  >
                    <SelectTrigger {...control}>
                      <SelectValue placeholder={t('lineMaterialNone')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t('lineMaterialNone')}</SelectItem>
                      {materials.map((material) => (
                        <SelectItem key={material.id} value={material.id}>
                          {material.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            ) : null}

            <Field label={t('lineDescription')} required>
              {(control) => (
                <Input
                  {...control}
                  value={line.description}
                  onChange={(event) => updateLine(index, { description: event.target.value })}
                />
              )}
            </Field>

            <MainAppFormGrid dense>
              <Field label={t('lineQuantity')} className={mainAppFieldSpan.md}>
                {(control) => (
                  <Input
                    {...control}
                    inputMode="decimal"
                    numeric
                    value={line.quantity}
                    onChange={(event) => updateLine(index, { quantity: event.target.value })}
                  />
                )}
              </Field>
              <Field label={t('lineUnitAmount')} required className={mainAppFieldSpan.md}>
                {(control) => (
                  <MoneyInput
                    {...control}
                    value={line.unitAmount}
                    onValueChange={(value) => updateLine(index, { unitAmount: value })}
                  />
                )}
              </Field>
              <Field label={t('lineTotal')} className={mainAppFieldSpan.md}>
                {(control) => (
                  <MoneyInput
                    {...control}
                    value={line.lineTotal}
                    onValueChange={(value) => updateLine(index, { lineTotal: value })}
                  />
                )}
              </Field>
            </MainAppFormGrid>

            {lines.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
              >
                <Trash2 aria-hidden />
                {t('removeLine')}
              </Button>
            ) : null}
          </div>
        ))}
      </section>

      <p className="text-sm text-[var(--pf-text-secondary)]">
        {t('committedLabel')}:{' '}
        <span className="pf-numeric font-medium" dir="ltr">
          {committedAmount} {currency}
        </span>
      </p>

      <MainAppFormGrid dense>
        <Field label={t('notesLabel')} optionalLabel={tCommon('labels.optional')} className={mainAppFieldSpan.full}>
          {(control) => <Textarea {...control} name="notes" rows={3} />}
        </Field>
      </MainAppFormGrid>

      <Button type="submit" loading={pending} className="self-start">
        {t('submit')}
      </Button>
    </form>
  );
}
