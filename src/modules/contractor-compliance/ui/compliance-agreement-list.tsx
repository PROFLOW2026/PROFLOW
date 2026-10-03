import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import type { ProjectComplianceOverview } from '../application/internal';
import { complianceStatusShape } from '../ui/status-shape';

export async function ComplianceAgreementList({ overview }: { overview: ProjectComplianceOverview }) {
  const t = await getTranslations('contractorCompliance');

  if (overview.agreements.length === 0) {
    return <p className="text-sm text-[var(--pf-text-muted)]">{t('empty.noAgreements')}</p>;
  }

  return (
    <ul className="flex flex-col gap-4">
      {overview.agreements.map((agreement) => (
        <li key={agreement.agreementId} className="rounded-lg border border-[var(--pf-border)] p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-[var(--pf-text-primary)]">
              {agreement.vendorName}
              {agreement.agreementTitle ? ` · ${agreement.agreementTitle}` : ''}
            </h2>
            {agreement.blockingCount > 0 ? (
              <Badge tone="warning">{t('counts.blocking', { count: agreement.blockingCount })}</Badge>
            ) : null}
          </div>
          <ul className="flex flex-col gap-2">
            {agreement.requirements.map((requirement) => (
              <li
                key={requirement.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-[var(--pf-bg-muted)] px-3 py-2 text-sm"
              >
                <span>{requirement.title}</span>
                <StatusBadge
                  label={t(`status.${requirement.evaluation.status}`)}
                  shape={complianceStatusShape(requirement.evaluation.status)}
                />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
