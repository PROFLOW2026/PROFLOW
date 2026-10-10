'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { bidiIsolate } from '@/shared/money';
import type { DeductionView } from '../domain/types';
import { disputeContractorDeductionAction } from './actions';
import { DeductionsList } from './deductions-panel';

export function PortalDeductionsSection(props: {
  readonly organizationId: string;
  readonly projectId: string;
  readonly deductions: readonly DeductionView[];
}) {
  const t = useTranslations('subcontractClaims');
  const [state, formAction, pending] = useActionState(disputeContractorDeductionAction, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('deductions.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <DeductionsList items={props.deductions} />
        {props.deductions.map((item) => (
          <form key={item.id} action={formAction} className="flex flex-col gap-2 rounded-md border border-[var(--pf-border-subtle)] p-3">
            <input type="hidden" name="organizationId" value={props.organizationId} />
            <input type="hidden" name="projectId" value={props.projectId} />
            <input type="hidden" name="deductionId" value={item.id} />
            <p className="text-sm font-medium">
              {t('deductions.dispute')} · {bidiIsolate(item.amount)} {item.currency}
            </p>
            <Textarea name="comment" required rows={2} placeholder={t('deductions.disputePlaceholder')} />
            <Button type="submit" size="sm" variant="secondary" disabled={pending}>
              {t('deductions.submitDispute')}
            </Button>
          </form>
        ))}
        {state?.error ? <p className="text-sm text-[var(--pf-danger-fg)]">{state.error}</p> : null}
      </CardContent>
    </Card>
  );
}
