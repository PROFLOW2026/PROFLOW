import { ClipboardCheck } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { requireExternalContext } from '@/modules/contractor-access';
import { resolveContractorProjectOrganization } from '@/modules/defects';
import { getContractorInspection } from '@/modules/inspections';
import { checklistItemLabel, inspectionOutcomeTone, inspectionStatusTone } from '@/modules/inspections/ui/tones';
import { loadOrNotFound } from '@/modules/site-log/shared/page-guard';
import { formatInstant } from '@/shared/dates';
import { Link } from '@/shared/i18n/navigation';
import { WithPortalClientMessages } from '@/shared/i18n/with-client-messages';

export default async function ContractorInspectionDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; inspectionId: string }>;
}) {
  const { projectId, inspectionId } = await params;
  const context = await requireExternalContext();
  const organizationId = await loadOrNotFound(() => resolveContractorProjectOrganization(context, projectId));
  const inspection = await loadOrNotFound(() =>
    getContractorInspection(context, { organizationId, projectId, inspectionId }),
  );
  const [t, tDefects, locale] = await Promise.all([
    getTranslations('inspections'),
    getTranslations('defects'),
    getLocale(),
  ]);
  const listHref = `/contractor/projects/${projectId}/inspections`;
  const defectsBase = `/contractor/projects/${projectId}/defects`;

  return (
    <WithPortalClientMessages extra={['inspections', 'defects']}>
      <div className="flex min-w-0 flex-col gap-4 pb-6">
        <PageHeader
          title={t('detailTitle', { ref: inspection.referenceNo })}
          description={inspection.title}
          breadcrumb={
            <Link href={listHref} className="text-sm text-[var(--pf-text-brand)] hover:underline">
              {t('portal.back')}
            </Link>
          }
          meta={
            <div className="flex flex-wrap gap-2">
              <Badge tone={inspectionStatusTone(inspection.status)}>{t(`status.${inspection.status}`)}</Badge>
              {inspection.outcome ? (
                <Badge tone={inspectionOutcomeTone(inspection.outcome)}>{t(`outcome.${inspection.outcome}`)}</Badge>
              ) : null}
            </div>
          }
        />

        <Card>
          <CardContent className="flex flex-col gap-2 p-4 text-sm">
            {inspection.locationName ? (
              <p className="text-[var(--pf-text-secondary)]">
                {t('fields.location')}: {inspection.locationName}
              </p>
            ) : null}
            {inspection.scheduledFor ? (
              <p className="text-[var(--pf-text-secondary)]">
                {t('fields.scheduledFor')}: {inspection.scheduledFor}
              </p>
            ) : null}
            {inspection.completedAt ? (
              <p className="text-[var(--pf-text-secondary)]">
                {formatInstant(inspection.completedAt, locale, 'UTC', { withTime: false })}
              </p>
            ) : null}
            {inspection.summary ? (
              <p>
                <span className="font-medium">{t('portal.summary')}: </span>
                {inspection.summary}
              </p>
            ) : null}
            {inspection.conditions ? (
              <p className="text-[var(--pf-text-secondary)]">
                {t('portal.conditions')}: {inspection.conditions}
              </p>
            ) : null}
          </CardContent>
        </Card>

        {inspection.items.length > 0 ? (
          <Card>
            <CardContent className="flex flex-col gap-2 p-4">
              <p className="font-medium">{t('checklist.title')}</p>
              <ul className="flex flex-col gap-2 text-sm">
                {inspection.items.map((item) => (
                  <li key={item.id} className="flex flex-wrap justify-between gap-2 border-b border-[var(--pf-border-subtle)] pb-2 last:border-0">
                    <span>{checklistItemLabel(t, inspection.templateKey, { itemKey: item.itemKey, label: item.label })}</span>
                    <Badge tone={item.result === 'fail' ? 'danger' : item.result === 'pass' ? 'success' : 'neutral'}>
                      {t(`result.${item.result}`)}
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex items-center gap-2 p-4 text-sm text-[var(--pf-text-secondary)]">
              <ClipboardCheck className="size-4 shrink-0" aria-hidden />
              {t('checklist.empty')}
            </CardContent>
          </Card>
        )}

        {inspection.outcome === 'fail' || inspection.outcome === 'conditional_pass' ? (
          <Link href={defectsBase} className="text-sm font-medium text-[var(--pf-text-brand)]">
            {tDefects('portal.title')}
          </Link>
        ) : null}
      </div>
    </WithPortalClientMessages>
  );
}
