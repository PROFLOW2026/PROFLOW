'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { bidiIsolate } from '@/shared/money';
import { DEDUCTION_TYPES, type DeductionView } from '../domain/types';
import { issueDeductionAction } from './actions';

export function DeductionsList({ items }: { items: readonly DeductionView[] }) {
  const t = useTranslations('subcontractClaims');
  if (items.length === 0) {
    return <p className="text-sm text-[var(--pf-text-secondary)]">{t('deductions.empty')}</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.id} className="rounded-lg border border-[var(--pf-border-subtle)] p-4 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <span className="font-semibold">{t(`deductionType.${item.deductionType}`)}</span>
            <span className="tabular-nums">{bidiIsolate(item.amount)} {item.currency}</span>
          </div>
          <p className="text-xs text-[var(--pf-text-muted)]">
            {[item.vendorName, item.claimNumber ? `CLM-${item.claimNumber}` : null].filter(Boolean).join(' · ')}
          </p>
          <p className="mt-2 whitespace-pre-line">{item.reason}</p>
          {item.disputes.length > 0 ? (
            <ul className="mt-2 border-t border-[var(--pf-border-subtle)] pt-2 text-xs">
              {item.disputes.map((dispute) => (
                <li key={dispute.id} className="mt-1">
                  <span className="text-[var(--pf-text-muted)]">{dispute.actorType}: </span>
                  {dispute.comment}
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function IssueDeductionForm({
  projectId,
  agreements,
}: {
  projectId: string;
  agreements: readonly { id: string; title: string }[];
}) {
  const t = useTranslations('subcontractClaims');
  const [state, formAction, pending] = useActionState(issueDeductionAction, null);
  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <div>
        <Label htmlFor="agreementId">{t('deductions.agreement')}</Label>
        <select id="agreementId" name="agreementId" required className="mt-1 w-full rounded-md border px-3 py-2 text-sm">
          {agreements.map((agreement) => (
            <option key={agreement.id} value={agreement.id}>
              {agreement.title}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="deductionType">{t('deductions.type')}</Label>
        <select id="deductionType" name="deductionType" required className="mt-1 w-full rounded-md border px-3 py-2 text-sm">
          {DEDUCTION_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`deductionType.${type}`)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="amount">{t('deductions.amount')}</Label>
        <Input id="amount" name="amount" required className="tabular-nums" />
      </div>
      <div>
        <Label htmlFor="reason">{t('common.reason')}</Label>
        <Textarea id="reason" name="reason" required rows={3} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="contractorVisible" defaultChecked />
        {t('deductions.visibleToContractor')}
      </label>
      <Button type="submit" variant="primary" disabled={pending}>
        {t('deductions.issue')}
      </Button>
      {state?.error ? <p className="text-sm text-[var(--pf-danger-fg)]">{state.error}</p> : null}
    </form>
  );
}
