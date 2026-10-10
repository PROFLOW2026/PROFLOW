'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createContractorClaimAction } from './actions';

export function PortalCreateClaimForm(props: {
  readonly organizationId: string;
  readonly projectId: string;
  readonly agreements: readonly { readonly id: string; readonly title: string; readonly hasOpenClaim: boolean }[];
}) {
  const t = useTranslations('subcontractClaims');
  const [state, formAction, pending] = useActionState(createContractorClaimAction, null);
  const available = props.agreements.filter((row) => !row.hasOpenClaim);
  if (available.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('portal.newClaim')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="organizationId" value={props.organizationId} />
          <input type="hidden" name="projectId" value={props.projectId} />
          <div>
            <Label htmlFor="agreementId">{t('deductions.agreement')}</Label>
            <select id="agreementId" name="agreementId" required className="mt-1 w-full rounded-md border px-3 py-2 text-sm">
              {available.map((agreement) => (
                <option key={agreement.id} value={agreement.id}>
                  {agreement.title}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="periodStart">{t('detail.periodStart')}</Label>
              <Input id="periodStart" name="periodStart" type="date" required dir="ltr" />
            </div>
            <div>
              <Label htmlFor="periodEnd">{t('detail.periodEnd')}</Label>
              <Input id="periodEnd" name="periodEnd" type="date" required dir="ltr" />
            </div>
          </div>
          <div>
            <Label htmlFor="title">{t('detail.claimTitle')}</Label>
            <Input id="title" name="title" maxLength={200} />
          </div>
          <Button type="submit" variant="primary" disabled={pending}>
            {t('portal.createDraft')}
          </Button>
          {state?.error ? <p className="text-sm text-[var(--pf-danger-fg)]">{state.error}</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}
