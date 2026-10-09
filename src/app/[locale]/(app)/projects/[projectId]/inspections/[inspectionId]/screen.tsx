import { getLocale, getTranslations } from 'next-intl/server';

import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui/badge';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { PageHeader } from '@/components/ui/page-header';

import { EntityDiscussion } from '@/modules/collaboration/ui';

import { EvidenceGallery, EvidenceUploader } from '@/modules/evidence/ui';

import { getInspectionDetail } from '@/modules/inspections';

import { InspectionWorkspace } from '@/modules/inspections/ui/inspection-workspace';

import { inspectionOutcomeTone, inspectionStatusTone } from '@/modules/inspections/ui/tones';

import { PROJECT_CAPABILITIES } from '@/modules/project-team/domain/capabilities';

import { requireProjectCapabilityPage } from '@/modules/project-team/server';

import { withOrgContext } from '@/shared/auth/session';

import { formatInstant } from '@/shared/dates';

import { AuthorizationError, NotFoundError } from '@/shared/errors';

import { Link } from '@/shared/i18n/navigation';

import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';



export async function ProjectInspectionDetailScreen({ surfaceRoot,

  params,

}: {
    surfaceRoot?: string;


  params: Promise<{ projectId: string; inspectionId: string }>;

}) {

  const { projectId, inspectionId } = await params;

  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);



  const loaded = await withOrgContext(async (context) => {

    try {

      const detail = await getInspectionDetail(context, projectId, inspectionId);

      return { detail, timeZone: context.organization.timezone };

    } catch (error) {

      if (error instanceof AuthorizationError || error instanceof NotFoundError) return null;

      throw error;

    }

  });

  if (!loaded) notFound();



  const [t, locale] = await Promise.all([getTranslations('inspections'), getLocale()]);

  const data = loaded.detail;

  const { inspection } = data;

  const base = `${surfaceRoot ?? ('/projects/' + projectId)}/inspections`;



  return (

    <WithAppClientMessages extra={['inspections', 'defects']}>

      <div className="flex flex-col gap-6">

        <PageHeader

          title={t('detailTitle', { ref: inspection.referenceNo })}

          description={inspection.title}

          breadcrumb={

            <Link href={base} className="text-sm text-[var(--pf-text-secondary)] hover:text-[var(--pf-text-brand)]">

              {t('actions.back')}

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

          <CardHeader>

            <CardTitle>{t('fields.title')}</CardTitle>

          </CardHeader>

          <CardContent className="grid gap-2 text-sm md:grid-cols-2">

            <p>

              {t('fields.scheduledFor')}: {inspection.scheduledFor ?? t('list.notScheduled')}

            </p>

            <p>

              {t('fields.location')}: {inspection.location?.name ?? t('fields.noLocation')}

            </p>

            <p>

              {t('fields.contractor')}: {inspection.vendor?.name ?? t('fields.noContractor')}

            </p>

            <p>

              {t('fields.inspector')}: {inspection.inspectorName ?? '—'}

            </p>

            {inspection.completedAt ? (

              <p>
                {t('fields.completedAt')}: {formatInstant(inspection.completedAt, locale, loaded.timeZone)}
              </p>

            ) : null}

          </CardContent>

        </Card>



        <InspectionWorkspace projectId={projectId} view={data} />



        {inspection.outcomes.length > 0 ? (

          <section className="flex flex-col gap-2">

            <h3 className="text-sm font-semibold">{t('history.title')}</h3>

            <ul className="flex flex-col gap-2 text-sm">

              {inspection.outcomes.map((outcome) => (

                <li key={outcome.id} className="rounded-md border border-[var(--pf-border-subtle)] p-3">

                  <p className="font-medium">

                    {t(`outcome.${outcome.outcome}`)} · {t('list.attempt', { n: outcome.attemptNo })}

                  </p>

                  {outcome.summary ? <p className="mt-1">{outcome.summary}</p> : null}

                  <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">

                    {t('history.counts', { pass: outcome.passCount, fail: outcome.failCount, na: outcome.naCount })}

                  </p>

                </li>

              ))}

            </ul>

          </section>

        ) : null}



        {inspection.defects.length > 0 ? (

          <section className="flex flex-col gap-2">

            <h3 className="text-sm font-semibold">{t('linkedDefects.title')}</h3>

            <ul className="flex flex-col gap-2 text-sm">

              {inspection.defects.map((defect) => (

                <li key={defect.id}>

                  <Link

                    href={`${surfaceRoot ?? ('/projects/' + projectId)}/defects/${defect.id}`}

                    className="text-[var(--pf-text-brand)] hover:underline"

                  >

                    #{defect.referenceNo} {defect.title}

                  </Link>

                </li>

              ))}

            </ul>

          </section>

        ) : null}



        <section>

          <h3 className="mb-2 text-sm font-semibold">{t('evidence.title')}</h3>

          <EvidenceGallery

            organizationId={inspection.organizationId}

            entityType="inspection"

            entityId={inspection.id}

            viewer="internal"

          />

          {data.permissions.manage ? (

            <EvidenceUploader

              organizationId={inspection.organizationId}

              projectId={projectId}

              entityType="inspection"

              entityId={inspection.id}

              viewer="internal"

              defaultVisibility="contractor"

              locationId={inspection.locationId}

            />

          ) : null}

        </section>



        <EntityDiscussion

          organizationId={inspection.organizationId}

          projectId={projectId}

          entityType="inspection"

          entityId={inspection.id}

          viewer="internal"

        />

      </div>

    </WithAppClientMessages>

  );

}



export default function ProjectInspectionDetailPage(
  props: Omit<Parameters<typeof ProjectInspectionDetailScreen>[0], 'surfaceRoot'>,
) {
  return <ProjectInspectionDetailScreen {...props} />;
}
