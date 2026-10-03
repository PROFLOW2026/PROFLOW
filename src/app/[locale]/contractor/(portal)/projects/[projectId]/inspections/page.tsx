import { ClipboardCheck } from 'lucide-react';

import { getLocale, getTranslations } from 'next-intl/server';

import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui/badge';

import { Card, CardContent } from '@/components/ui/card';

import { EmptyState } from '@/components/ui/empty-state';

import { PageHeader } from '@/components/ui/page-header';

import { requireExternalContext } from '@/modules/contractor-access';

import { resolveContractorProjectOrganization } from '@/modules/defects';

import { listContractorInspections } from '@/modules/inspections';

import { checklistItemLabel, inspectionOutcomeTone, inspectionStatusTone } from '@/modules/inspections/ui/tones';

import { loadOrNotFound } from '@/modules/site-log/shared/page-guard';

import { EXTERNAL_CAPABILITIES } from '@/shared/external';

import { Link } from '@/shared/i18n/navigation';

import { formatInstant } from '@/shared/dates';



export default async function ContractorInspectionsPage({ params }: { params: Promise<{ projectId: string }> }) {

  const { projectId } = await params;

  const context = await requireExternalContext();

  const covered = context.grants.some(

    (grant) =>

      grant.capabilities.has(EXTERNAL_CAPABILITIES.INSPECTION_VIEW) &&

      (!grant.projectId || grant.projectId === projectId),

  );

  if (!covered) notFound();



  const organizationId = await loadOrNotFound(() => resolveContractorProjectOrganization(context, projectId));

  const { items } = await loadOrNotFound(() =>

    listContractorInspections(context, { organizationId, projectId }),

  );

  const [t, tDefects, locale] = await Promise.all([
    getTranslations('inspections'),
    getTranslations('defects'),
    getLocale(),
  ]);

  const defectsBase = `/contractor/projects/${projectId}/defects`;



  return (

    <div className="flex min-w-0 flex-col gap-4 pb-6">

      <PageHeader title={t('portal.title')} description={t('portal.description')} />



      {items.length === 0 ? (

        <EmptyState icon={ClipboardCheck} title={t('portal.empty')} size="sm" />

      ) : (

        <ul className="flex flex-col gap-3">

          {items.map((item) => (

            <li key={item.id}>

              <Card>

                <CardContent className="flex flex-col gap-2 p-4">

                  <div className="flex flex-wrap items-start justify-between gap-2">

                    <p className="min-w-0 font-medium">

                      <span className="pf-numeric text-[var(--pf-text-secondary)]">#{item.referenceNo} </span>

                      {item.title}

                    </p>

                    <Badge tone={inspectionStatusTone(item.status)}>{t(`status.${item.status}`)}</Badge>

                  </div>

                  {item.outcome ? (

                    <Badge tone={inspectionOutcomeTone(item.outcome)}>{t(`outcome.${item.outcome}`)}</Badge>

                  ) : null}

                  {item.completedAt ? (

                    <p className="text-xs text-[var(--pf-text-secondary)]">

                      {formatInstant(item.completedAt, locale, 'UTC', { withTime: false })}

                    </p>

                  ) : null}

                  {item.summary ? (

                    <p className="text-sm">

                      <span className="font-medium">{t('portal.summary')}: </span>

                      {item.summary}

                    </p>

                  ) : null}

                  {item.conditions ? (

                    <p className="text-sm text-[var(--pf-text-secondary)]">

                      {t('portal.conditions')}: {item.conditions}

                    </p>

                  ) : null}

                  {item.failedItems.length > 0 ? (

                    <div className="text-sm">

                      <p className="font-medium">{t('portal.failedItems')}</p>

                      <ul className="mt-1 list-disc ps-5">

                        {item.failedItems.map((failed, index) => (

                          <li key={`${item.id}-${index}`}>

                            {checklistItemLabel(t, item.templateKey, failed)}

                            {failed.note ? ` — ${failed.note}` : ''}

                          </li>

                        ))}

                      </ul>

                    </div>

                  ) : null}

                  {item.outcome === 'fail' || item.outcome === 'conditional_pass' ? (

                    <Link href={defectsBase} className="text-sm font-medium text-[var(--pf-text-brand)]">

                      {tDefects('portal.title')}

                    </Link>

                  ) : null}

                </CardContent>

              </Card>

            </li>

          ))}

        </ul>

      )}

    </div>

  );

}


