'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { bidiIsolate } from '@/shared/money';
import type { InternalClaimDetail } from '@/modules/subcontract-claims';
import { AssessmentHistory } from './assessment-history';
import { ClaimReviewActions } from './forms';
import { ClaimStatusBadge } from './status';

export function ClaimDetailPanel({
  projectId,
  view,
  basePath,
}: {
  projectId: string;
  view: InternalClaimDetail;
  basePath: string;
}) {
  const t = useTranslations('subcontractClaims');
  const { detail, can } = view;
  const { header } = detail;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">
            CLM-{header.claimNumber}
            {header.title ? ` · ${header.title}` : null}
          </h2>
          <p className="text-sm text-[var(--pf-text-muted)]">
            {[header.vendorName, header.agreementTitle].filter(Boolean).join(' · ')}
          </p>
          <p className="text-sm">
            {t('list.period')}: {bidiIsolate(header.periodStart)} – {bidiIsolate(header.periodEnd)}
          </p>
        </div>
        <ClaimStatusBadge status={header.status} label={t(`status.${header.status}`)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('detail.lines')}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-start text-[var(--pf-text-muted)]">
                <th className="pb-2 font-medium">{t('detail.line')}</th>
                <th className="pb-2 font-medium text-end">{t('detail.revised')}</th>
                <th className="pb-2 font-medium text-end">{t('list.submitted')}</th>
                <th className="pb-2 font-medium text-end">{t('list.certified')}</th>
              </tr>
            </thead>
            <tbody>
              {detail.lines.map((line) => (
                <tr key={line.claimLineId} className="border-t border-[var(--pf-border-subtle)]">
                  <td className="py-2 pe-2">
                    <span className="font-medium">{line.code ?? line.description}</span>
                    {line.code ? <span className="block text-xs text-[var(--pf-text-muted)]">{line.description}</span> : null}
                  </td>
                  <td className="py-2 text-end tabular-nums">{bidiIsolate(line.figures.revisedValue)}</td>
                  <td className="py-2 text-end tabular-nums">{bidiIsolate(line.figures.currentSubmitted)}</td>
                  <td className="py-2 text-end tabular-nums">
                    {line.figures.currentCertified ? bidiIsolate(line.figures.currentCertified) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-sm font-medium tabular-nums">
            {t('detail.totalsSubmitted')}: {bidiIsolate(detail.totals.currentSubmitted)}
            {detail.totals.currentCertified ? ` · ${t('detail.totalsCertified')}: ${bidiIsolate(detail.totals.currentCertified)}` : null}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('detail.assessments')}</CardTitle>
        </CardHeader>
        <CardContent>
          <AssessmentHistory assessments={detail.assessments} />
        </CardContent>
      </Card>

      {can.review || can.certify ? (
        <ClaimReviewActions projectId={projectId} claimId={header.id} detail={detail} can={can} basePath={basePath} />
      ) : null}
    </div>
  );
}
