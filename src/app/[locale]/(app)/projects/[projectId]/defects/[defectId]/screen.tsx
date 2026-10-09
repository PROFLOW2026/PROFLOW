import { getTranslations } from 'next-intl/server';

import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui/badge';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { PageHeader } from '@/components/ui/page-header';

import { EntityDiscussion } from '@/modules/collaboration/ui';

import { getDefectDetail, loadQualityFormData } from '@/modules/defects';

import { DefectCycleHistory } from '@/modules/defects/ui/cycle-history';

import { DefectManagePanel } from '@/modules/defects/ui/defect-manage-panel';

import { defectSeverityTone, defectStatusTone } from '@/modules/defects/ui/tones';

import { EvidenceGallery, EvidenceUploader } from '@/modules/evidence/ui';

import { PROJECT_CAPABILITIES } from '@/modules/project-team/domain/capabilities';

import { requireProjectCapabilityPage } from '@/modules/project-team/server';

import { withOrgContext } from '@/shared/auth/session';

import { AuthorizationError, NotFoundError } from '@/shared/errors';

import { Link } from '@/shared/i18n/navigation';

import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';



export async function ProjectDefectDetailScreen({ surfaceRoot,

  params,

}: {
    surfaceRoot?: string;


  params: Promise<{ projectId: string; defectId: string }>;

}) {

  const { projectId, defectId } = await params;

  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);



  const loaded = await withOrgContext(async (context) => {

    try {

      const view = await getDefectDetail(context, projectId, defectId);

      const formData =

        view.permissions.manage || view.permissions.verify ? await loadQualityFormData(context, projectId) : null;

      return { view, formData };

    } catch (error) {

      if (error instanceof AuthorizationError || error instanceof NotFoundError) return null;

      throw error;

    }

  });

  if (!loaded) notFound();



  const t = await getTranslations('defects');

  const { defect, permissions, allowedActions } = loaded.view;

  const base = `${surfaceRoot ?? ('/projects/' + projectId)}/defects`;



  return (

    <WithAppClientMessages extra={['defects', 'inspections']}>

      <div className="flex flex-col gap-6">

        <PageHeader

          title={t('detailTitle', { ref: defect.referenceNo })}

          description={defect.title}

          breadcrumb={

            <Link href={base} className="text-sm text-[var(--pf-text-secondary)] hover:text-[var(--pf-text-brand)]">

              {t('title')}

            </Link>

          }

          meta={

            <div className="flex flex-wrap gap-2">

              <Badge tone={defectStatusTone(defect.status)}>{t(`status.${defect.status}`)}</Badge>

              <Badge tone={defectSeverityTone(defect.severity)}>{t(`severity.${defect.severity}`)}</Badge>

              {defect.overdue ? <Badge tone="danger">{t('fields.overdue')}</Badge> : null}

            </div>

          }

        />



        <Card>

          <CardHeader>

            <CardTitle>{t('fields.description')}</CardTitle>

          </CardHeader>

          <CardContent className="grid gap-2 text-sm md:grid-cols-2">

            <p>{defect.description ?? '—'}</p>

            <p>

              {t('fields.location')}: {defect.location?.name ?? t('fields.noLocation')}

            </p>

            <p>

              {t('fields.contractor')}: {defect.vendor?.name ?? t('fields.noContractor')}

            </p>

            <p>

              {t('fields.dueDate')}: {defect.dueDate ?? t('list.noDueDate')}

            </p>

            <p>{t('fields.cycle')}: {defect.cycleNo}</p>

            {defect.sourceInspection ? (

              <p>

                {t('fields.sourceInspection')}:{' '}

                <Link

                  href={`${surfaceRoot ?? ('/projects/' + projectId)}/inspections/${defect.sourceInspection.id}`}

                  className="text-[var(--pf-text-brand)] hover:underline"

                >

                  #{defect.sourceInspection.referenceNo} {defect.sourceInspection.title}

                </Link>

              </p>

            ) : null}

          </CardContent>

        </Card>



        {loaded.formData ? (

          <DefectManagePanel

            projectId={projectId}

            defectId={defectId}

            allowedActions={allowedActions}

            permissions={permissions}

            formData={loaded.formData}

            defect={{

              title: defect.title,

              description: defect.description,

              severity: defect.severity,

              dueDate: defect.dueDate,

              locationId: defect.locationId,

              subcontractAgreementId: defect.subcontractAgreementId,

              workLineId: defect.workLine?.id ?? null,

              inspectorUserId: defect.inspectorUserId,

              contractorVisible: defect.contractorVisible,

            }}

          />

        ) : null}



        <section>

          <h3 className="mb-2 text-sm font-semibold">{t('history.title')}</h3>

          <DefectCycleHistory records={defect.records} />

        </section>



        <section>

          <h3 className="mb-2 text-sm font-semibold">{t('evidence.title')}</h3>

          <EvidenceGallery

            organizationId={defect.organizationId}

            entityType="defect"

            entityId={defect.id}

            viewer="internal"

          />

          {permissions.manage ? (

            <EvidenceUploader

              organizationId={defect.organizationId}

              projectId={projectId}

              entityType="defect"

              entityId={defect.id}

              viewer="internal"

              defaultVisibility="contractor"

              locationId={defect.locationId}

            />

          ) : null}

        </section>



        <EntityDiscussion

          organizationId={defect.organizationId}

          projectId={projectId}

          entityType="defect"

          entityId={defect.id}

          viewer="internal"

        />

      </div>

    </WithAppClientMessages>

  );

}



export default function ProjectDefectDetailPage(
  props: Omit<Parameters<typeof ProjectDefectDetailScreen>[0], 'surfaceRoot'>,
) {
  return <ProjectDefectDetailScreen {...props} />;
}
