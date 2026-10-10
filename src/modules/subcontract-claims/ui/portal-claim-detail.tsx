'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { bidiIsolate } from '@/shared/money';
import type { ContractorClaimDetail } from '@/modules/subcontract-claims';
import type { DeductionView } from '../domain/types';
import { AssessmentHistory } from './assessment-history';
import { cancelContractorClaimAction, startContractorCorrectionAction, submitContractorClaimAction } from './actions';
import { ClaimDraftEditor } from './claim-draft-editor';
import { ClaimStatusBadge } from './status';
import { PortalDeductionsSection } from './portal-deductions-section';

export function PortalClaimDetail({
  organizationId,
  projectId,
  view,
  deductions,
}: {
  organizationId: string;
  projectId: string;
  view: ContractorClaimDetail;
  deductions?: readonly DeductionView[];
}) {
  const t = useTranslations('subcontractClaims');
  const { detail, can } = view;
  const { header } = detail;
  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">{t('list.claimReference', { number: header.claimNumber })}</h1>
          <p className="text-sm text-[var(--pf-text-muted)]">{header.agreementTitle}</p>
        </div>
        <ClaimStatusBadge status={header.status} label={t(`status.${header.status}`)} />
      </div>

      {can.edit && header.status === 'draft' && view.draftWorkLines.length > 0 ? (
        <ClaimDraftEditor
          mode="contractor"
          organizationId={organizationId}
          projectId={projectId}
          claimId={header.id}
          currency={header.currency}
          workLines={view.draftWorkLines}
          revisionNote={detail.revisions.find((row) => row.id === detail.activeRevisionId)?.note ?? null}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('detail.lines')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {detail.lines.map((line) => (
            <div key={line.claimLineId} className="rounded-md border border-[var(--pf-border-subtle)] p-3 text-sm">
              <p className="font-medium">{line.code ?? line.description}</p>
              <p className="tabular-nums">
                {t('list.submitted')}: {bidiIsolate(line.figures.currentSubmitted)}
                {line.figures.currentCertified ? ` · ${t('list.certified')}: ${bidiIsolate(line.figures.currentCertified)}` : null}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      {deductions && deductions.length > 0 ? (
        <PortalDeductionsSection
          organizationId={organizationId}
          projectId={projectId}
          deductions={deductions}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('detail.assessments')}</CardTitle>
        </CardHeader>
        <CardContent>
          <AssessmentHistory assessments={detail.assessments} />
        </CardContent>
      </Card>

      {can.edit && header.status === 'draft' ? (
        <form action={submitContractorClaimAction}>
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="claimId" value={header.id} />
          <Button type="submit" variant="primary" className="w-full min-h-11">
            {t('portal.submit')}
          </Button>
        </form>
      ) : null}

      {header.status === 'returned' ? (
        <form action={startContractorCorrectionAction}>
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="claimId" value={header.id} />
          <Button type="submit" variant="primary" className="w-full min-h-11">
            {t('portal.startCorrection')}
          </Button>
        </form>
      ) : null}

      {can.edit && header.status === 'draft' ? (
        <form action={cancelContractorClaimAction}>
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="claimId" value={header.id} />
          <Button type="submit" variant="secondary" className="w-full min-h-11">
            {t('portal.cancel')}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
