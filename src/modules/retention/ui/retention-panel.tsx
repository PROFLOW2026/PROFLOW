'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MoneyInput } from '@/components/patterns/money-input';
import { MoneyText } from '@/components/patterns/money-text';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { isPositiveMoney, money, subtractMoney } from '@/shared/money/money';
import type { RetentionSide } from '../domain/retention';
import { RetentionCaptureFields } from './retention-capture-fields';

export interface RetentionReleaseHistoryRow {
  readonly id: string;
  readonly amount: string;
  readonly currency: string;
  readonly releasedOn: string;
  readonly notes: string | null;
}

interface FormState {
  error?: string;
  success?: boolean;
  fieldErrors?: Record<string, string>;
}

export function RetentionPanel({
  side,
  sourceId,
  currency,
  totalAmount,
  retentionAmount,
  retentionHeldRemaining,
  payableOrReceivableNow,
  canManage,
  canEditDraft,
  canRelease,
  defaultReleaseDate,
  releases,
  locale: _locale,
  captureAction,
  releaseAction,
}: {
  side: RetentionSide;
  sourceId: string;
  currency: string;
  totalAmount: string;
  retentionAmount: string;
  retentionHeldRemaining: string;
  payableOrReceivableNow: string;
  canManage: boolean;
  canEditDraft: boolean;
  canRelease: boolean;
  defaultReleaseDate: string;
  releases: readonly RetentionReleaseHistoryRow[];
  locale: string;
  captureAction?: (prev: FormState, formData: FormData) => Promise<FormState>;
  releaseAction: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const ns = side === 'ap' ? 'ap.retention' : 'billing.retention';
  const t = useTranslations(ns);
  const tCommon = useTranslations('common');
  const [releaseAmount, setReleaseAmount] = useState('');
  const [captureState, captureFormAction, capturePending] = useActionState<FormState, FormData>(
    captureAction ?? (async () => ({})),
    {},
  );
  const [releaseState, releaseFormAction, releasePending] = useActionState<FormState, FormData>(
    releaseAction,
    {},
  );

  const recognized = money(totalAmount, currency);
  const held = money(retentionHeldRemaining || '0', currency);
  const original = money(retentionAmount || '0', currency);
  const released = subtractMoney(original, held);
  const now = money(payableOrReceivableNow || '0', currency);

  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] p-4">
      <div>
        <h2 className="text-sm font-semibold">{t('title')}</h2>
        <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('disclosure')}</p>
      </div>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0">
          <p className="text-xs text-[var(--pf-text-muted)]">{t('recognized')}</p>
          <MoneyText value={recognized} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-[var(--pf-text-muted)]">
            {side === 'ap' ? t('payableNow') : t('receivableNow')}
          </p>
          <MoneyText value={now} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-[var(--pf-text-muted)]">{t('held')}</p>
          <MoneyText value={held} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-[var(--pf-text-muted)]">{t('released')}</p>
          <MoneyText value={released} />
        </div>
      </div>

      {!isPositiveMoney(held) && !canEditDraft ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('noneHeld')}</p>
      ) : null}

      {canManage && canEditDraft && captureAction ? (
        <form action={captureFormAction} className="flex min-w-0 flex-col gap-3">
          {captureState.error ? <Alert tone="danger">{captureState.error}</Alert> : null}
          <input type="hidden" name="sourceId" value={sourceId} />
          <RetentionCaptureFields
            namespace={ns}
            currency={currency}
            totalAmount={totalAmount}
            defaultAmount={isPositiveMoney(original) ? original.amount : ''}
            embedded
          />
          <Button type="submit" loading={capturePending}>
            {capturePending ? tCommon('states.saving') : t('saveDraft')}
          </Button>
        </form>
      ) : null}

      {canManage && canRelease && isPositiveMoney(held) ? (
        <form action={releaseFormAction} className="flex min-w-0 flex-col gap-3">
          {releaseState.error ? <Alert tone="danger">{releaseState.error}</Alert> : null}
          <input type="hidden" name="sourceId" value={sourceId} />
          <h3 className="text-sm font-medium">{t('releaseTitle')}</h3>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('releaseHint')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('releaseAmount')} required>
              {(props) => (
                <MoneyInput {...props} value={releaseAmount} onValueChange={setReleaseAmount} />
              )}
            </Field>
            <Field label={t('releaseDate')} required>
              {(props) => (
                <Input
                  {...props}
                  name="releasedOn"
                  type="date"
                  dir="ltr"
                  defaultValue={defaultReleaseDate}
                  max={defaultReleaseDate}
                  required
                />
              )}
            </Field>
          </div>
          <input type="hidden" name="amount" value={releaseAmount} />
          <Field label={t('releaseNotes')} optionalLabel={tCommon('labels.optional')}>
            {(props) => <Textarea {...props} name="notes" rows={2} />}
          </Field>
          <Button type="submit" loading={releasePending} disabled={!releaseAmount}>
            {releasePending ? tCommon('states.saving') : t('releaseSubmit')}
          </Button>
        </form>
      ) : null}

      <div className="min-w-0">
        <h3 className="mb-2 text-sm font-medium">{t('historyTitle')}</h3>
        {releases.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('emptyHistory')}</p>
        ) : (
          <ResponsiveTable
            items={[...releases]}
            getRowKey={(row) => row.id}
            desktop={
              <div className="min-w-0 rounded-lg border border-[var(--pf-border-default)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('releaseDate')}</TableHead>
                      <TableHead numeric>{t('releaseAmount')}</TableHead>
                      <TableHead>{t('releaseNotes')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {releases.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <span dir="ltr">
                            {row.releasedOn}
                          </span>
                        </TableCell>
                        <TableCell numeric>
                          <MoneyText value={money(row.amount, row.currency)} />
                        </TableCell>
                        <TableCell className="max-w-[16rem] truncate text-sm">
                          {row.notes ?? '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            }
            renderMobileCard={(row) => (
              <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
                <span dir="ltr" className="text-sm">
                  {row.releasedOn}
                </span>
                <MoneyText value={money(row.amount, row.currency)} />
                {row.notes ? (
                  <p className="break-words text-sm text-[var(--pf-text-secondary)]">{row.notes}</p>
                ) : null}
              </div>
            )}
          />
        )}
      </div>
    </section>
  );
}
