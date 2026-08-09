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
  listFieldOpsWorkPackages,
  type InspectionKind,
  type InspectionStatus,
} from '@/modules/field-ops';
import { listProjectsForOrg } from '@/modules/projects';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { InspectionStatusForm } from '../inspection-status-form';

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
      const [projects, packages, documentsPanel] = await Promise.all([
        listProjectsForOrg(context, {}),
        listFieldOpsWorkPackages(context, [item.projectId]),
        getEntityDocumentPanelData(context, 'inspection', inspectionId),
      ]);
      return {
        item,
        projectName: projects.find((p) => p.id === item.projectId)?.name ?? null,
        workPackageName: packages.find((p) => p.id === item.workPackageId)?.name ?? null,
        documentsPanel,
        canManage: hasPermission(context, PERMISSIONS.FIELD_OPS_MANAGE),
      };
    } catch {
      return null;
    }
  });

  if (!data) notFound();

  const { item, projectName, workPackageName, documentsPanel, canManage } = data;
  const kindKey = item.kind as InspectionKind;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={item.title}
        description={projectName ?? t('detail.unknownProject')}
        breadcrumb={
          <Link
            href="/field-ops/inspections"
            className="text-sm text-[var(--pf-text-secondary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
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
            <Link href={`/projects/${item.projectId}`} className="hover:underline">
              {projectName ?? t('detail.unknownProject')}
            </Link>
          }
        />
        {workPackageName ? (
          <DetailRow label={t('createInspection.workPackageLabel')} value={workPackageName} />
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
        {item.result ? <DetailRow label={t('list.columns.result')} value={item.result} /> : null}
        {item.notes ? (
          <DetailRow label={t('createInspection.notesLabel')} value={item.notes} />
        ) : null}

        {canManage ? (
          <div className="border-t border-[var(--pf-border-default)] pt-4">
            <InspectionStatusForm
              inspectionId={item.id}
              currentStatus={item.status}
              currentResult={item.result}
            />
          </div>
        ) : null}
      </div>

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
