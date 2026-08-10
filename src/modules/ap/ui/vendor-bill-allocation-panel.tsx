'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { saveBillProjectAllocationsAction } from '@/app/[locale]/(app)/procurement/ap/actions';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MoneyInput } from '@/components/patterns/money-input';
import { MoneyText } from '@/components/patterns/money-text';
import { money } from '@/shared/money/money';
import {
  previewBillAllocationStrip,
  type BillAllocationMethod,
} from '@/modules/ap/domain/bill-project-allocation';
import { areApBillProjectAllocationsAvailable } from '@/modules/ap/domain/vendor-bill-project-attribution';

export interface VendorBillProjectOption {
  readonly id: string;
  readonly name: string;
}

export interface VendorBillAllocationLineDraft {
  readonly key: string;
  projectId: string;
  method: 'manual_amount' | 'manual_percent' | 'active_days';
  amount: string;
  percent: string;
  days: string;
}

export interface VendorBillAllocationPanelProps {
  readonly billId: string;
  readonly currency: string;
  /** Recognized economic amount (bill NET / total for V1). */
  readonly recognizedNet: string;
  readonly headerProjectId: string | null;
  readonly projects: readonly VendorBillProjectOption[];
  readonly canManage: boolean;
}

function newKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `line-${Date.now()}`;
}

function emptyLine(projectId = ''): VendorBillAllocationLineDraft {
  return {
    key: newKey(),
    projectId,
    method: 'manual_amount',
    amount: '',
    percent: '',
    days: '',
  };
}

/**
 * Vendor bill → project cost split (Advanced).
 * Gate off → draft-only live preview; never persists Actual until Lead flips READY.
 * Gate on → persists draft / apply via server actions (only applied lines hit financials).
 * PAYMENT stays separate (handled by VendorPaymentPanel).
 */
export function VendorBillAllocationPanel({
  billId,
  currency,
  recognizedNet,
  headerProjectId,
  projects,
  canManage,
}: VendorBillAllocationPanelProps) {
  const t = useTranslations('ap');
  const tCommon = useTranslations('common');
  const ready = areApBillProjectAllocationsAvailable();
  const [pending, startTransition] = useTransition();

  const [mode, setMode] = useState<'single' | 'split'>(headerProjectId ? 'single' : 'split');
  const [singleProjectId, setSingleProjectId] = useState(headerProjectId ?? projects[0]?.id ?? '');
  const [lines, setLines] = useState<VendorBillAllocationLineDraft[]>([emptyLine(projects[0]?.id ?? '')]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [applied, setApplied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (mode === 'single') {
      const net = Number(recognizedNet) || 0;
      return {
        allocated: net.toFixed(2),
        unallocated: '0.00',
        exceeds: false,
        lineAmounts: [] as string[],
      };
    }
    return previewBillAllocationStrip({
      recognizedNet,
      lines: lines.map((line) => ({
        projectId: line.projectId,
        method: line.method as BillAllocationMethod,
        amount: line.amount,
        percent: line.percent,
        days: line.days,
      })),
    });
  }, [mode, lines, recognizedNet]);

  // Managers only — ap.read viewers without manage must not get the split editor
  // when READY flips true (Reviewer 2 H2).
  if (!canManage) return null;

  function buildPersistLines() {
    if (mode === 'single') {
      if (!singleProjectId) return [];
      return [
        {
          projectId: singleProjectId,
          method: 'manual_amount' as const,
          amount: recognizedNet,
          percent: null,
          days: null,
        },
      ];
    }
    return lines
      .filter((line) => line.projectId)
      .map((line) => ({
        projectId: line.projectId,
        method: line.method,
        amount: line.amount || null,
        percent: line.percent || null,
        days: line.days || null,
      }));
  }

  function handleSave(apply: boolean) {
    setActionError(null);
    if (!ready) {
      setDraftSaved(true);
      return;
    }
    if (preview.exceeds) return;

    startTransition(async () => {
      const result = await saveBillProjectAllocationsAction({
        apBillId: billId,
        linesJson: JSON.stringify(buildPersistLines()),
        apply,
      });
      if (result.error) {
        setActionError(result.error);
        return;
      }
      setDraftSaved(true);
      setApplied(apply);
    });
  }

  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] p-4">
      <div>
        <h2 className="text-sm font-semibold">{t('allocation.title')}</h2>
        <p className="text-xs text-[var(--pf-text-muted)]">{t('allocation.subtitle')}</p>
      </div>

      {!ready ? <Alert tone="info">{t('allocation.gateOff')}</Alert> : null}
      {actionError ? <Alert tone="danger">{actionError}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('allocation.recognizedNet')}</p>
          <MoneyText value={money(recognizedNet, currency)} />
        </div>
        <div>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('allocation.allocated')}</p>
          <MoneyText value={money(preview.allocated, currency)} />
        </div>
        <div>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('allocation.unallocated')}</p>
          <MoneyText value={money(preview.unallocated, currency)} />
        </div>
      </div>

      {preview.exceeds ? (
        <Alert tone="danger">{t('allocation.exceedsNet')}</Alert>
      ) : null}

      <Field label={t('allocation.mode')}>
        {(control) => (
          <Select value={mode} onValueChange={(value) => setMode(value as 'single' | 'split')}>
            <SelectTrigger id={control.id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="single">{t('allocation.modeSingle')}</SelectItem>
              <SelectItem value="split">{t('allocation.modeSplit')}</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>

      {mode === 'single' ? (
        <Field label={t('create.projectLabel')}>
          {(control) => (
            <Select value={singleProjectId} onValueChange={setSingleProjectId}>
              <SelectTrigger id={control.id}>
                <SelectValue placeholder={t('create.projectNone')} />
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
        <div className="flex flex-col gap-3">
          {lines.map((line, index) => (
            <div
              key={line.key}
              className="flex flex-col gap-2 rounded-md border border-[var(--pf-border-default)] p-3"
            >
              <Field label={t('allocation.lineProject', { row: index + 1 })}>
                {(control) => (
                  <Select
                    value={line.projectId}
                    onValueChange={(value) =>
                      setLines((prev) =>
                        prev.map((item) =>
                          item.key === line.key ? { ...item, projectId: value } : item,
                        ),
                      )
                    }
                  >
                    <SelectTrigger id={control.id}>
                      <SelectValue />
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

              {!showAdvanced ? (
                <Field label={t('allocation.amount')}>
                  {(control) => (
                    <MoneyInput
                      {...control}
                      value={line.amount}
                      onValueChange={(value) =>
                        setLines((prev) =>
                          prev.map((item) =>
                            item.key === line.key
                              ? { ...item, method: 'manual_amount', amount: value }
                              : item,
                          ),
                        )
                      }
                      currencySymbol={currency}
                    />
                  )}
                </Field>
              ) : (
                <>
                  <Field label={t('allocation.method')}>
                    {(control) => (
                      <Select
                        value={line.method}
                        onValueChange={(value) =>
                          setLines((prev) =>
                            prev.map((item) =>
                              item.key === line.key
                                ? {
                                    ...item,
                                    method: value as VendorBillAllocationLineDraft['method'],
                                  }
                                : item,
                            ),
                          )
                        }
                      >
                        <SelectTrigger id={control.id}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manual_amount">{t('allocation.methods.amount')}</SelectItem>
                          <SelectItem value="manual_percent">{t('allocation.methods.percent')}</SelectItem>
                          <SelectItem value="active_days">{t('allocation.methods.days')}</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </Field>
                  {line.method === 'manual_amount' ? (
                    <Field label={t('allocation.amount')}>
                      {(control) => (
                        <MoneyInput
                          {...control}
                          value={line.amount}
                          onValueChange={(value) =>
                            setLines((prev) =>
                              prev.map((item) =>
                                item.key === line.key ? { ...item, amount: value } : item,
                              ),
                            )
                          }
                          currencySymbol={currency}
                        />
                      )}
                    </Field>
                  ) : null}
                  {line.method === 'manual_percent' ? (
                    <Field label={t('allocation.percent')}>
                      {(control) => (
                        <Input
                          {...control}
                          inputMode="decimal"
                          value={line.percent}
                          onChange={(event) =>
                            setLines((prev) =>
                              prev.map((item) =>
                                item.key === line.key
                                  ? { ...item, percent: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          dir="ltr"
                        />
                      )}
                    </Field>
                  ) : null}
                  {line.method === 'active_days' ? (
                    <Field label={t('allocation.days')}>
                      {(control) => (
                        <Input
                          {...control}
                          inputMode="decimal"
                          value={line.days}
                          onChange={(event) =>
                            setLines((prev) =>
                              prev.map((item) =>
                                item.key === line.key ? { ...item, days: event.target.value } : item,
                              ),
                            )
                          }
                          dir="ltr"
                        />
                      )}
                    </Field>
                  ) : null}
                </>
              )}

              {lines.length > 1 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="self-start"
                  onClick={() => setLines((prev) => prev.filter((item) => item.key !== line.key))}
                >
                  {t('allocation.removeLine')}
                </Button>
              ) : null}
            </div>
          ))}

          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={() => setLines((prev) => [...prev, emptyLine(projects[0]?.id ?? '')])}
          >
            {t('allocation.addLine')}
          </Button>

          {!showAdvanced ? (
            <Button type="button" variant="ghost" className="self-start" onClick={() => setShowAdvanced(true)}>
              {tCommon('actions.showAdvanced')}
            </Button>
          ) : null}
        </div>
      )}

      <Button
        type="button"
        size="lg"
        block
        variant="secondary"
        disabled={preview.exceeds || !canManage || pending}
        onClick={() => handleSave(false)}
      >
        {ready ? t('allocation.save') : t('allocation.saveDraft')}
      </Button>

      {ready ? (
        <Button
          type="button"
          size="lg"
          block
          disabled={preview.exceeds || !canManage || pending}
          onClick={() => handleSave(true)}
        >
          {t('allocation.apply')}
        </Button>
      ) : null}

      {draftSaved ? (
        <p className="text-xs text-[var(--pf-text-muted)]">
          {applied ? t('allocation.applied') : t('allocation.draftSaved')}
        </p>
      ) : null}

      <p className="text-xs text-[var(--pf-text-muted)]">{t('allocation.paymentNote')}</p>
    </section>
  );
}
