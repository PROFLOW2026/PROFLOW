'use client';

import { useState, useTransition } from 'react';
import { useRouter } from '@/shared/i18n/navigation';
import { useTranslations } from 'next-intl';
import { formatMoneyAmountForInput, MoneyInput } from '@/components/patterns/money-input';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  deriveAmountFromPercent,
  derivePercentFromAmount,
} from '@/modules/billing-plan/domain/line-math';
import { money, toNumericString } from '@/shared/money';
import {
  addPlanLineAction,
  duplicatePlanLineAction,
  removePlanLineAction,
  reorderPlanLinesAction,
  updatePlanLineAction,
} from './billing-plan-actions';
import {
  BillingPlanLineCard,
  type BillingPlanLineDraft,
} from './billing-plan-line-card';

interface BillingPlanLinesEditorProps {
  readonly projectId: string;
  readonly planId: string;
  readonly currency: string;
  readonly currencySymbol: string;
  readonly contractBaseAmount: string;
  readonly canManage: boolean;
  readonly lines: readonly BillingPlanLineDraft[];
}

function displayPercent(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.replace(/0+$/, '').replace(/\.$/, '');
  return trimmed || '0';
}

export function BillingPlanLinesEditor({
  projectId,
  planId,
  currency,
  currencySymbol,
  contractBaseAmount,
  canManage,
  lines: initialLines,
}: BillingPlanLinesEditorProps) {
  const t = useTranslations('billingPlan');
  const router = useRouter();
  const [lines, setLines] = useState<BillingPlanLineDraft[]>(() => [...initialLines]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function patchLine(id: string, patch: Partial<BillingPlanLineDraft>) {
    setLines((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function onPercent(id: string, raw: string) {
    const trimmed = raw.trim();
    if (!trimmed || !contractBaseAmount || contractBaseAmount === '0') {
      patchLine(id, { agreedPercent: trimmed });
      return;
    }
    try {
      const amount = toNumericString(
        deriveAmountFromPercent(money(contractBaseAmount, currency), trimmed),
      );
      patchLine(id, { agreedPercent: trimmed, agreedAmount: amount });
    } catch {
      patchLine(id, { agreedPercent: trimmed });
    }
  }

  function onAmount(id: string, raw: string) {
    if (!contractBaseAmount || contractBaseAmount === '0') {
      patchLine(id, { agreedAmount: raw });
      return;
    }
    try {
      const pct = derivePercentFromAmount(
        money(contractBaseAmount, currency),
        money(raw || '0', currency),
      );
      patchLine(id, { agreedAmount: raw, agreedPercent: pct });
    } catch {
      patchLine(id, { agreedAmount: raw });
    }
  }

  function saveLine(line: BillingPlanLineDraft) {
    setError(null);
    startTransition(async () => {
      const result = await updatePlanLineAction({
        projectId,
        planId,
        lineId: line.id,
        label: line.label,
        agreedAmount: line.agreedAmount || '0',
        agreedPercent: line.agreedPercent || null,
        retentionPercentOverride: line.retentionPercent || null,
      });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function removeLine(lineId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removePlanLineAction({ projectId, planId, lineId });
      if (result.error) setError(result.error);
      else {
        setLines((prev) => prev.filter((row) => row.id !== lineId));
        router.refresh();
      }
    });
  }

  function duplicateLine(lineId: string) {
    setError(null);
    startTransition(async () => {
      const result = await duplicatePlanLineAction({ projectId, planId, lineId });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function moveLine(lineId: string, direction: -1 | 1) {
    const index = lines.findIndex((row) => row.id === lineId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= lines.length) return;
    const ordered = [...lines];
    const [row] = ordered.splice(index, 1);
    ordered.splice(nextIndex, 0, row!);
    setLines(ordered);
    setError(null);
    startTransition(async () => {
      const result = await reorderPlanLinesAction({
        projectId,
        planId,
        orderedLineIds: ordered.map((item) => item.id),
      });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function addLine() {
    setError(null);
    startTransition(async () => {
      const result = await addPlanLineAction({
        projectId,
        planId,
        label: t('fields.label'),
        lineKind: 'percent_of_contract',
        agreedAmount: '0',
        agreedPercent: '0',
      });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t('lines.title')}</h3>
        {canManage ? (
          <Button type="button" size="sm" onClick={addLine} loading={pending}>
            {t('actions.addLine')}
          </Button>
        ) : null}
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {lines.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('lines.empty')}</p>
      ) : null}

      {/* Mobile cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {lines.map((line, index) => (
          <BillingPlanLineCard
            key={line.id}
            line={line}
            contractBaseAmount={contractBaseAmount}
            currency={currency}
            currencySymbol={currencySymbol}
            canManage={canManage}
            pending={pending}
            onChange={(patch) => patchLine(line.id, patch)}
            onSave={() => saveLine(line)}
            onRemove={() => removeLine(line.id)}
            onDuplicate={() => duplicateLine(line.id)}
            onMoveUp={index > 0 ? () => moveLine(line.id, -1) : undefined}
            onMoveDown={index < lines.length - 1 ? () => moveLine(line.id, 1) : undefined}
          />
        ))}
      </div>

      {/* Desktop spreadsheet */}
      <div className="hidden min-w-0 overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('lines.label')}</TableHead>
              <TableHead>{t('lines.base')}</TableHead>
              <TableHead>{t('lines.agreedPercent')}</TableHead>
              <TableHead>{t('lines.priorPercent')}</TableHead>
              <TableHead>{t('lines.priorAmount')}</TableHead>
              <TableHead>{t('lines.remaining')}</TableHead>
              <TableHead>{t('fields.retention')}</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line, index) => (
              <TableRow key={line.id}>
                <TableCell className="min-w-[10rem]">
                  <Input
                    value={line.label}
                    disabled={!canManage}
                    onChange={(e) => patchLine(line.id, { label: e.target.value })}
                    onBlur={() => canManage && saveLine(line)}
                  />
                </TableCell>
                <TableCell className="min-w-[7rem]">
                  <MoneyInput
                    value={formatMoneyAmountForInput(line.agreedAmount, currency)}
                    currency={currency}
                    currencySymbol={currencySymbol}
                    disabled={!canManage}
                    onValueChange={(next) => onAmount(line.id, next)}
                    onBlur={() => canManage && saveLine(line)}
                  />
                </TableCell>
                <TableCell className="min-w-[5rem]">
                  <Input
                    inputMode="decimal"
                    dir="ltr"
                    value={displayPercent(line.agreedPercent)}
                    disabled={!canManage}
                    onChange={(e) => onPercent(line.id, e.target.value)}
                    onBlur={() => canManage && saveLine(line)}
                  />
                </TableCell>
                <TableCell dir="ltr">{displayPercent(line.billedPercent)}</TableCell>
                <TableCell dir="ltr">
                  {formatMoneyAmountForInput(line.billedAmount, currency)}
                </TableCell>
                <TableCell dir="ltr">
                  {formatMoneyAmountForInput(line.remainingAmount, currency)}
                </TableCell>
                <TableCell className="min-w-[5rem]">
                  <Input
                    inputMode="decimal"
                    dir="ltr"
                    value={displayPercent(line.retentionPercent)}
                    disabled={!canManage}
                    onChange={(e) =>
                      patchLine(line.id, { retentionPercent: e.target.value.trim() })
                    }
                    onBlur={() => canManage && saveLine(line)}
                  />
                </TableCell>
                {canManage ? (
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={pending || index === 0}
                        onClick={() => moveLine(line.id, -1)}
                      >
                        {t('lines.moveUp')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={pending || index === lines.length - 1}
                        onClick={() => moveLine(line.id, 1)}
                      >
                        {t('lines.moveDown')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => duplicateLine(line.id)}
                      >
                        {t('actions.duplicate')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        disabled={pending}
                        onClick={() => removeLine(line.id)}
                      >
                        {t('actions.removeLine')}
                      </Button>
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
