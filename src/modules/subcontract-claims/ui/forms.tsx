'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { InternalClaimDetail } from '@/modules/subcontract-claims';
import type { ClaimDetailView } from '../domain/types';
import {
  certifyClaimAction,
  reassessClaimAction,
  returnClaimAction,
  startReviewAction,
  submitInternalClaimAction,
} from './actions';

function ReasonField({ name = 'reason' }: { name?: string }) {
  const t = useTranslations('subcontractClaims');
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={name}>{t('common.reason')}</Label>
      <Textarea id={name} name={name} required rows={3} className="min-h-20" />
    </div>
  );
}

export function ClaimReviewActions({
  projectId,
  claimId,
  detail,
  can,
  basePath,
}: {
  projectId: string;
  claimId: string;
  detail: ClaimDetailView;
  can: InternalClaimDetail['can'];
  basePath: string;
}) {
  const t = useTranslations('subcontractClaims');
  const [returnState, returnFormAction, returnPending] = useActionState(returnClaimAction, null);
  const [certifyState, certifyFormAction, certifyPending] = useActionState(certifyClaimAction, null);
  const [reassessState, reassessFormAction, reassessPending] = useActionState(reassessClaimAction, null);

  return (
    <div className="flex flex-col gap-4">
      {can.review && (detail.header.status === 'submitted' || detail.header.status === 'under_review') ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('actions.review')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {detail.header.status === 'submitted' ? (
              <form action={startReviewAction}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="claimId" value={claimId} />
                <input type="hidden" name="basePath" value={basePath} />
                <Button type="submit" variant="secondary">
                  {t('actions.startReview')}
                </Button>
              </form>
            ) : null}
            <form action={returnFormAction} className="flex flex-col gap-2">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="claimId" value={claimId} />
              <input type="hidden" name="basePath" value={basePath} />
              <ReasonField />
              <Button type="submit" variant="secondary" disabled={returnPending}>
                {t('actions.return')}
              </Button>
              {returnState?.error ? <p className="text-sm text-[var(--pf-danger-fg)]">{returnState.error}</p> : null}
            </form>
          </CardContent>
        </Card>
      ) : null}

      {can.certify && detail.header.status !== 'certified' && detail.activeRevisionSubmitted ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('actions.certify')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={certifyFormAction} className="flex flex-col gap-3">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="claimId" value={claimId} />
              <input type="hidden" name="basePath" value={basePath} />
              {detail.lines.map((line, index) => (
                <div key={line.claimLineId} className="grid gap-2 rounded-md border border-[var(--pf-border-subtle)] p-3 sm:grid-cols-2">
                  <input type="hidden" name={`lines.${index}.claimLineId`} value={line.claimLineId} />
                  <p className="text-sm font-medium sm:col-span-2">{line.code ?? line.description}</p>
                  <div>
                    <Label htmlFor={`cert-${index}`}>{t('detail.certifiedAmount')}</Label>
                    <Input
                      id={`cert-${index}`}
                      name={`lines.${index}.certifiedAmount`}
                      defaultValue={line.figures.currentSubmitted}
                      required
                      className="tabular-nums"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`reason-${index}`}>{t('common.reason')}</Label>
                    <Input id={`reason-${index}`} name={`lines.${index}.reason`} />
                  </div>
                </div>
              ))}
              <Button type="submit" variant="primary" disabled={certifyPending}>
                {t('actions.certifySubmit')}
              </Button>
              {certifyState?.error ? <p className="text-sm text-[var(--pf-danger-fg)]">{certifyState.error}</p> : null}
            </form>
          </CardContent>
        </Card>
      ) : null}

      {can.certify && detail.header.status === 'certified' ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('actions.reassess')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={reassessFormAction} className="flex flex-col gap-3">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="claimId" value={claimId} />
              <input type="hidden" name="basePath" value={basePath} />
              <ReasonField />
              {detail.lines.map((line, index) => (
                <div key={line.claimLineId} className="grid gap-2 rounded-md border border-[var(--pf-border-subtle)] p-3 sm:grid-cols-2">
                  <input type="hidden" name={`lines.${index}.claimLineId`} value={line.claimLineId} />
                  <p className="text-sm font-medium sm:col-span-2">{line.code ?? line.description}</p>
                  <div className="sm:col-span-2">
                    <Label htmlFor={`re-${index}`}>{t('detail.certifiedAmount')}</Label>
                    <Input
                      id={`re-${index}`}
                      name={`lines.${index}.certifiedAmount`}
                      defaultValue={line.figures.currentCertified ?? line.figures.currentSubmitted}
                      required
                      className="tabular-nums"
                    />
                  </div>
                </div>
              ))}
              <Button type="submit" variant="secondary" disabled={reassessPending}>
                {t('actions.reassessSubmit')}
              </Button>
              {reassessState?.error ? <p className="text-sm text-[var(--pf-danger-fg)]">{reassessState.error}</p> : null}
            </form>
          </CardContent>
        </Card>
      ) : null}

      {can.review && detail.header.status === 'draft' ? (
        <form action={submitInternalClaimAction}>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="claimId" value={claimId} />
          <input type="hidden" name="basePath" value={basePath} />
          <Button type="submit" variant="primary">
            {t('actions.submitOnBehalf')}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
