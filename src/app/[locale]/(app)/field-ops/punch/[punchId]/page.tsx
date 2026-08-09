import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { getEntityDocumentPanelData } from '@/modules/documents';
import { DocumentAttachments } from '@/modules/documents/ui';
import {
  getPunchListItemForOrg,
  listFieldOpsWorkPackages,
  type PunchStatus,
} from '@/modules/field-ops';
import { listProjectsForOrg } from '@/modules/projects';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { PunchPriorityForm } from '../punch-priority-form';
import { PunchStatusForm } from '../punch-status-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'fieldOps' });
  return { title: t('detail.punchTitle') };
}

function punchShape(status: PunchStatus): StatusShape {
  switch (status) {
    case 'open':
      return 'pending';
    case 'in_progress':
      return 'active';
    case 'done':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'archived';
  }
}

export default async function PunchDetailPage({
  params,
}: {
  params: Promise<{ punchId: string }>;
}) {
  const { punchId } = await params;
  const t = await getTranslations('fieldOps');
  const tStatus = await getTranslations('status.punch');
  const tCommon = await getTranslations('common');

  const data = await withOrgContext(async (context) => {
    try {
      const item = await getPunchListItemForOrg(context, punchId);
      const [projects, packages, documentsPanel] = await Promise.all([
        listProjectsForOrg(context, {}),
        listFieldOpsWorkPackages(context, [item.projectId]),
        getEntityDocumentPanelData(context, 'punch_list_item', punchId),
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={item.title}
        description={projectName ?? t('detail.unknownProject')}
        breadcrumb={
          <Link
            href="/field-ops/punch"
            className="text-sm text-[var(--pf-text-secondary)] hover:underline"
          >
            {tCommon('actions.back')}
          </Link>
        }
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge shape={punchShape(item.status)} label={tStatus(item.status)} />
            <span className="text-sm text-[var(--pf-text-secondary)]">
              {t(`priorities.${item.priority}`)}
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
          <DetailRow label={t('createPunch.workPackageLabel')} value={workPackageName} />
        ) : null}
        {item.location ? (
          <DetailRow label={t('createPunch.locationLabel')} value={item.location} />
        ) : null}
        {item.dueDate ? (
          <DetailRow label={t('createPunch.dueDateLabel')} value={item.dueDate} />
        ) : null}
        {item.description ? (
          <DetailRow label={t('createPunch.descriptionLabel')} value={item.description} />
        ) : null}

        {canManage ? (
          <div className="flex flex-col gap-3 border-t border-[var(--pf-border-default)] pt-4">
            <PunchPriorityForm punchListItemId={item.id} currentPriority={item.priority} />
            <PunchStatusForm punchListItemId={item.id} currentStatus={item.status} />
          </div>
        ) : null}
      </div>

      <DocumentAttachments
        ownerType="punch_list_item"
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
