'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { bidiIsolate } from '@/shared/money';
import type { ClaimDraftWorkLine } from '../application/draft-work-lines';
import {
  currentAmountFromClaimQuantity,
  currentAmountFromProgressPercent,
} from '../domain/claim-line-draft-math';
import { saveClaimDraftAction, saveContractorClaimDraftAction } from './actions';

type EntryMode = 'amount' | 'percent' | 'quantity';

export function ClaimDraftEditor(props: {
  readonly mode: 'contractor' | 'internal';
  readonly projectId: string;
  readonly claimId: string;
  readonly currency: string;
  readonly workLines: readonly ClaimDraftWorkLine[];
  readonly organizationId?: string;
  readonly basePath?: string;
  readonly revisionNote?: string | null;
}) {
  const t = useTranslations('subcontractClaims');
  const saveAction = props.mode === 'contractor' ? saveContractorClaimDraftAction : saveClaimDraftAction;
  const [state, formAction, pending] = useActionState(saveAction, null);
  const [entryMode, setEntryMode] = useState<EntryMode>('amount');
  const [lines, setLines] = useState(() =>
    props.workLines.map((line) => ({
      workLineId: line.workLineId,
      currentAmount: line.currentAmount === '0' ? '' : line.currentAmount,
      progressPercent: line.progressPercent ?? '',
      cumulativeQuantity: line.cumulativeQuantity ?? '',
      note: line.note ?? '',
      meta: line,
    })),
  );

  const totals = useMemo(() => {
    let current = 0;
    let revised = 0;
    let prior = 0;
    let remaining = 0;
    for (const row of lines) {
      const amount = row.currentAmount.trim() || '0';
      current += Number.parseFloat(amount) || 0;
      revised += Number.parseFloat(row.meta.figures.revisedValue) || 0;
      prior += Number.parseFloat(row.meta.figures.priorCertified) || 0;
      remaining += Number.parseFloat(row.meta.figures.remaining) || 0;
    }
    return { current: current.toFixed(2), revised: revised.toFixed(2), prior: prior.toFixed(2), remaining: remaining.toFixed(2) };
  }, [lines]);

  const applyDerivedAmount = (index: number, patch: Partial<(typeof lines)[number]>) => {
    setLines((prev) => {
      const next = [...prev];
      const row = { ...next[index]!, ...patch };
      const meta = row.meta;
      if (entryMode === 'percent' && row.progressPercent.trim()) {
        row.currentAmount = currentAmountFromProgressPercent({
          revisedNet: meta.figures.revisedValue,
          priorCertified: meta.figures.priorCertified,
          progressPercent: row.progressPercent.trim(),
          currency: props.currency,
        });
      } else if (entryMode === 'quantity' && row.cumulativeQuantity.trim()) {
        row.currentAmount = currentAmountFromClaimQuantity({
          revisedNet: meta.figures.revisedValue,
          contractQuantity: meta.contractQuantity,
          priorCertified: meta.figures.priorCertified,
          claimQuantity: row.cumulativeQuantity.trim(),
          currency: props.currency,
        });
      }
      next[index] = row;
      return next;
    });
  };

  const linesJson = JSON.stringify(
    lines
      .filter((row) => row.currentAmount.trim() !== '')
      .map((row) => ({
        workLineId: row.workLineId,
        currentAmount: row.currentAmount.trim() || '0',
        progressPercent: row.progressPercent.trim() || null,
        cumulativeQuantity: row.cumulativeQuantity.trim() || null,
        note: row.note.trim() || null,
      })),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('detail.draftEditorTitle')}</CardTitle>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('detail.draftEditorHint')}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="font-medium">{t('detail.entryMode')}:</span>
          {(['amount', 'percent', 'quantity'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`rounded-md border px-2 py-1 ${entryMode === mode ? 'border-[var(--pf-accent)] bg-[var(--pf-bg-muted)]' : 'border-[var(--pf-border-subtle)]'}`}
              onClick={() => setEntryMode(mode)}
            >
              {t(`detail.entryMode.${mode}`)}
            </button>
          ))}
        </div>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="projectId" value={props.projectId} />
          <input type="hidden" name="claimId" value={props.claimId} />
          {props.mode === 'contractor' && props.organizationId ? (
            <input type="hidden" name="organizationId" value={props.organizationId} />
          ) : null}
          {props.basePath ? <input type="hidden" name="basePath" value={props.basePath} /> : null}
          <input type="hidden" name="linesJson" value={linesJson} />

          <div className="flex flex-col gap-3">
            {lines.map((row, index) => (
              <div key={row.workLineId} className="rounded-lg border border-[var(--pf-border-subtle)] p-3 text-sm">
                <p className="font-medium">{row.meta.code ?? row.meta.description}</p>
                {row.meta.code ? (
                  <p className="text-xs text-[var(--pf-text-muted)]">{row.meta.description}</p>
                ) : null}
                <dl className="mt-2 grid gap-1 text-xs text-[var(--pf-text-secondary)] sm:grid-cols-2">
                  <div>
                    <dt>{t('detail.revised')}</dt>
                    <dd className="tabular-nums">{bidiIsolate(row.meta.figures.revisedValue)}</dd>
                  </div>
                  <div>
                    <dt>{t('detail.approvedChanges')}</dt>
                    <dd className="tabular-nums">{bidiIsolate(row.meta.figures.approvedChanges)}</dd>
                  </div>
                  <div>
                    <dt>{t('detail.priorCertified')}</dt>
                    <dd className="tabular-nums">{bidiIsolate(row.meta.figures.priorCertified)}</dd>
                  </div>
                  <div>
                    <dt>{t('detail.remaining')}</dt>
                    <dd className="tabular-nums">{bidiIsolate(row.meta.figures.remaining)}</dd>
                  </div>
                </dl>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {entryMode === 'amount' ? (
                    <div>
                      <Label htmlFor={`amt-${index}`}>{t('detail.thisClaimAmount')}</Label>
                      <Input
                        id={`amt-${index}`}
                        dir="ltr"
                        className="tabular-nums"
                        value={row.currentAmount}
                        onChange={(event) => applyDerivedAmount(index, { currentAmount: event.target.value })}
                      />
                    </div>
                  ) : null}
                  {entryMode === 'percent' ? (
                    <div>
                      <Label htmlFor={`pct-${index}`}>{t('detail.progressPercent')}</Label>
                      <Input
                        id={`pct-${index}`}
                        dir="ltr"
                        className="tabular-nums"
                        value={row.progressPercent}
                        onChange={(event) => applyDerivedAmount(index, { progressPercent: event.target.value })}
                      />
                    </div>
                  ) : null}
                  {entryMode === 'quantity' && row.meta.lineType !== 'lump_sum' ? (
                    <div>
                      <Label htmlFor={`qty-${index}`}>
                        {t('detail.claimQuantity')} ({row.meta.unit})
                      </Label>
                      <Input
                        id={`qty-${index}`}
                        dir="ltr"
                        className="tabular-nums"
                        value={row.cumulativeQuantity}
                        onChange={(event) => applyDerivedAmount(index, { cumulativeQuantity: event.target.value })}
                      />
                    </div>
                  ) : null}
                  <div className="sm:col-span-2">
                    <Label htmlFor={`note-${index}`}>{t('detail.lineNote')}</Label>
                    <Textarea
                      id={`note-${index}`}
                      rows={2}
                      value={row.note}
                      onChange={(event) => applyDerivedAmount(index, { note: event.target.value })}
                    />
                  </div>
                  <p className="text-xs tabular-nums text-[var(--pf-text-muted)] sm:col-span-2">
                    {t('detail.computedThisPeriod')}: {bidiIsolate(row.currentAmount || '0')} {props.currency}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {props.mode === 'internal' ? (
            <div>
              <Label htmlFor="draft-note">{t('detail.revisionNote')}</Label>
              <Textarea id="draft-note" name="note" rows={2} defaultValue={props.revisionNote ?? ''} />
            </div>
          ) : (
            <input type="hidden" name="note" value={props.revisionNote ?? ''} />
          )}

          <p className="text-sm font-medium tabular-nums">
            {t('detail.totalsDraft')}: {bidiIsolate(totals.current)} {props.currency}
          </p>

          <Button type="submit" variant="secondary" disabled={pending}>
            {t('detail.saveDraft')}
          </Button>
          {state?.error ? <p className="text-sm text-[var(--pf-danger-fg)]">{state.error}</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}
