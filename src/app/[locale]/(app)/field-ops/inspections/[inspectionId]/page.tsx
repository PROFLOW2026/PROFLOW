import {
  MainAppPage,
  MainAppSection,
  MainAppSummaryGrid,
  MainAppSummaryItem,
} from '@/components/patterns/main-app';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { getEntityDocumentPanelData } from '@/modules/documents';
import { DocumentAttachments } from '@/modules/documents/ui';
import {
  getInspectionForOrg,
  getInspectionFormGateState,
  listFieldOpsWorkPackages,
  listInspectionFormTemplateOptions,
  type InspectionKind,
  type InspectionStatus,
} from '@/modules/field-ops';
import { InspectionFormCard } from '@/modules/field-ops/ui/inspection-form-panel';
import { listProjectsForOrg } from '@/modules/projects';
import { listEmployeesForOrg } from '@/modules/workforce';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { InspectionStatusForm } from '../inspection-status-form';
import { InspectionDetailsForm } from '../inspection-details-form';
import { textNavLinkClassName, textNavLinkMutedClassName } from '@/components/ui/pressable';
import { ReportDownloadButtons } from '@/modules/reports/ui';

const EMPTY = '—';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'fieldOps' });
  return { title: t('detail.inspectionTitle') };
}

function inspectionShape(status: InspectionStatus): StatusShape {
  switch (status) {
    case 'scheduled':
      return 'pending';
    case 'in_progress':
      return 'active';
    case 'passed':
      return 'completed';
    case 'failed':
      return 'rejected';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'archived';
  }
}

export default async function InspectionDetailPage({
  params,
}: {
  params: Promise<{ inspectionId: string }>;
}) {
  const { inspectionId } = await params;
  const t = await getTranslations('fieldOps');
  const tStatus = await getTranslations('status.inspection');
  const tCommon = await getTranslations('common');

  const data = await withOrgContext(async (context) => {
    try {
      const item = await getInspectionForOrg(context, inspectionId);
      const [projects, packages, documentsPanel, employees, formTemplates, formGate] =
        await Promise.all([
          listProjectsForOrg(context, {}),
          listFieldOpsWorkPackages(context, [item.projectId]),
          getEntityDocumentPanelData(context, 'inspection', inspectionId),
          listEmployeesForOrg(context, { status: 'active' }).catch(() => []),
          listInspectionFormTemplateOptions(context).catch(() => []),
          getInspectionFormGateState(context, {
            inspectionId: item.id,
            formTemplateId: item.formTemplateId,
          }),
        ]);
      const inspectorName =
        employees.find((row) => row.id === item.inspectorEmployeeId)?.name ?? null;
      return {
        item,
        projectName: projects.find((p) => p.id === item.projectId)?.name ?? null,
        workPackageName: packages.find((p) => p.id === item.workPackageId)?.name ?? null,
        documentsPanel,
        employees: employees.map((row) => ({ id: row.id, name: row.name })),
        formTemplates,
        formGate,
        inspectorName,
        canManage: hasPermission(context, PERMISSIONS.FIELD_OPS_MANAGE),
      };
    } catch {
      return null;
    }
  });

  if (!data) notFound();

  const {
    item,
    projectName,
    workPackageName,
    documentsPanel,
    employees,
    formTemplates,
    formGate,
    inspectorName,
    canManage,
  } = data;
  const kindKey = item.kind as InspectionKind;

  return (
    <MainAppPage>
      <PageHeader
        title={item.title}
        description={projectName ?? t('detail.unknownProject')}
        actions={<ReportDownloadButtons kind="punch_inspection" id={item.id} compact />}
        breadcrumb={
          <Link href="/field-ops/inspections" className={textNavLinkMutedClassName}>
            {tCommon('actions.back')}
          </Link>
        }
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge shape={inspectionShape(item.status)} label={tStatus(item.status)} />
            <span className="text-sm text-[var(--pf-text-secondary)]">
              {t(`kinds.${kindKey}` as 'kinds.general')}
            </span>
          </div>
        }
      />

      <MainAppSection>
        <MainAppSummaryGrid>
          <MainAppSummaryItem label={t('list.columns.project')}>
            <Link href={`/projects/${item.projectId}`} className={textNavLinkClassName}>
              {projectName ?? t('detail.unknownProject')}
            </Link>
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('createInspection.workPackageLabel')}>
            {workPackageName ?? EMPTY}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('createInspection.inspectorLabel')}>
            {inspectorName ?? EMPTY}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('createInspection.scheduledOnLabel')}>
            {item.scheduledOn ? (
              <span className="pf-ltr-island" dir="ltr">
                {item.scheduledOn}
              </span>
            ) : (
              EMPTY
            )}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('list.columns.completedOn')}>
            {item.completedOn ? (
              <span className="pf-ltr-island" dir="ltr">
                {item.completedOn}
              </span>
            ) : (
              EMPTY
            )}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('updateStatus.resultLabel')}>
            {item.result?.trim() ? item.result : EMPTY}
          </MainAppSummaryItem>
        </MainAppSummaryGrid>
        {item.notes?.trim() ? (
          <p className="mt-3 whitespace-pre-wrap text-start text-sm text-[var(--pf-text-secondary)]">
            {item.notes}
          </p>
        ) : null}
      </MainAppSection>

      {canManage ? (
        <MainAppSection title={t('updateStatus.label')}>
          <div className="flex max-w-lg flex-col gap-4">
            <InspectionDetailsForm
              inspectionId={item.id}
              inspectorEmployeeId={item.inspectorEmployeeId}
              formTemplateId={item.formTemplateId}
              employees={employees}
              formTemplates={formTemplates}
            />
            <InspectionStatusForm
              inspectionId={item.id}
              currentStatus={item.status}
              currentResult={item.result}
              formBlocked={formGate.required && !formGate.satisfied}
            />
          </div>
        </MainAppSection>
      ) : null}

      <MainAppSection>
        <InspectionFormCard inspectionId={item.id} state={formGate} />
      </MainAppSection>

      <MainAppSection title={t('cockpit.actions.documents')}>
        <DocumentAttachments
          ownerType="inspection"
          ownerId={item.id}
          documents={documentsPanel.documents}
          linkCandidates={documentsPanel.linkCandidates}
          canRead={documentsPanel.canRead}
          canManage={documentsPanel.canManage}
          storageConfigured={documentsPanel.storageConfigured}
        />
      </MainAppSection>
    </MainAppPage>
  );
}
