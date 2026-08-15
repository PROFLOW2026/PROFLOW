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

  const { item, projectName, workPackageName, documentsPanel, employees, formTemplates, formGate, inspectorName, canManage } =
    data;
  const kindKey = item.kind as InspectionKind;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={item.title}
        description={projectName ?? t('detail.unknownProject')}
        actions={<ReportDownloadButtons kind="punch_inspection" id={item.id} compact />}
        breadcrumb={
          <Link
            href="/field-ops/inspections"
            className={textNavLinkMutedClassName}
          >
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

      <div className="flex max-w-lg flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 text-sm">
        <DetailRow
          label={t('list.columns.project')}
          value={
            <Link href={`/projects/${item.projectId}`} className={textNavLinkClassName}>
              {projectName ?? t('detail.unknownProject')}
            </Link>
          }
        />
        {workPackageName ? (
          <DetailRow label={t('createInspection.workPackageLabel')} value={workPackageName} />
        ) : null}
        {inspectorName ? (
          <DetailRow label={t('createInspection.inspectorLabel')} value={inspectorName} />
        ) : null}
        {item.scheduledOn ? (
          <DetailRow
            label={t('createInspection.scheduledOnLabel')}
            value={
              <span className="pf-ltr-island" dir="ltr">
                {item.scheduledOn}
              </span>
            }
          />
        ) : null}
        {item.completedOn ? (
          <DetailRow
            label={t('list.columns.completedOn')}
            value={
              <span className="pf-ltr-island" dir="ltr">
                {item.completedOn}
              </span>
            }
          />
        ) : null}
        {item.result ? (
          <DetailRow label={t('updateStatus.resultLabel')} value={item.result} />
        ) : null}
        {item.notes ? (
          <DetailRow label={t('createInspection.notesLabel')} value={item.notes} />
        ) : null}

        {canManage ? (
          <div className="flex flex-col gap-4 border-t border-[var(--pf-border-default)] pt-4">
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
        ) : null}
      </div>

      <InspectionFormCard inspectionId={item.id} state={formGate} />

      <DocumentAttachments
        ownerType="inspection"
        ownerId={item.id}
        documents={documentsPanel.documents}
        linkCandidates={documentsPanel.linkCandidates}
        canRead={documentsPanel.canRead}
        canManage={documentsPanel.canManage}
        storageConfigured={documentsPanel.storageConfigured}
      />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--pf-text-secondary)]">
        {label}
      </p>
      <div className="mt-1 whitespace-pre-wrap">{value}</div>
    </div>
  );
}
