'use client';

import { useTranslations } from 'next-intl';
import { bidiIsolate } from '@/shared/money';
import type { ClaimAssessmentView } from '../domain/types';

/** Append-only assessment timeline (submitted 80 → certified 60 → reassessed 70 stay visible). */
export function AssessmentHistory({ assessments }: { assessments: readonly ClaimAssessmentView[] }) {
  const t = useTranslations('subcontractClaims');
  if (assessments.length === 0) {
    return <p className="text-sm text-[var(--pf-text-secondary)]">{t('detail.noAssessments')}</p>;
  }
  return (
    <ol className="flex flex-col gap-3">
      {assessments.map((row) => (
        <li key={row.id} className="rounded-md border border-[var(--pf-border-subtle)] px-3 py-2 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">{t(`decision.${row.decision}`)}</span>
            <span className="text-xs text-[var(--pf-text-muted)]">#{row.seq}</span>
          </div>
          <p className="text-xs text-[var(--pf-text-muted)]">
            {t('detail.revision', { no: row.revisionNo })}
            {row.assessorName ? ` · ${row.assessorName}` : null}
          </p>
          {row.certifiedAmount !== null ? (
            <p className="mt-1 tabular-nums">{t('detail.certifiedAmount')}: {bidiIsolate(row.certifiedAmount)}</p>
          ) : null}
          {row.reason ? <p className="mt-1 whitespace-pre-line text-[var(--pf-text-secondary)]">{row.reason}</p> : null}
        </li>
      ))}
    </ol>
  );
}
