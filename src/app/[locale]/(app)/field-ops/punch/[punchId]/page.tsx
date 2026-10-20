import {
  MainAppPage,
  MainAppSection,
  MainAppSummaryGrid,
  MainAppSummaryItem,
} from '@/components/patterns/main-app';
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
  listPunchAssigneeOptions,
  type PunchStatus,
} from '@/modules/field-ops';
import { listProjectsForOrg } from '@/modules/projects';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { PunchPriorityForm } from '../punch-priority-form';
import { PunchStatusForm } from '../punch-status-form';
import { PunchEditDetailsForm } from '../punch-edit-details-form';
import { textNavLinkClassName, textNavLinkMutedClassName } from '@/components/ui/pressable';
import { ReportDownloadButtons } from '@/modules/reports/ui';
import { EntityLinkedTasksSection } from '@/modules/collaboration/ui';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

const EMPTY = '—';

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
      const [projects, packages, documentsPanel, employees] = await Promise.all([
        listProjectsForOrg(context, {}),
        listFieldOpsWorkPackages(context, [item.projectId]),
        getEntityDocumentPanelData(context, 'punch_list_item', punchId),
        hasPermission(context, PERMISSIONS.FIELD_OPS_MANAGE)
          ? listPunchAssigneeOptions(context)
          : Promise.resolve([]),
      ]);
      return {
        item,
        projectName: projects.find((p) => p.id === item.projectId)?.name ?? null,
        workPackageName: packages.find((p) => p.id === item.workPackageId)?.name ?? null,
        assigneeName: employees.find((row) => row.id === item.assigneeEmployeeId)?.name ?? null,
        employees,
        documentsPanel,
        canManage: hasPermission(context, PERMISSIONS.FIELD_OPS_MANAGE),
      };
    } catch {
      return null;
    }
  });

  if (!data) notFound();

  const { item, projectName, workPackageName, assigneeName, employees, documentsPanel, canManage } =
    data;

  return (
    <MainAppPage>
      <PageHeader
        title={item.title}
        description={projectName ?? t('detail.unknownProject')}
        actions={<ReportDownloadButtons kind="punch_inspection" id={item.id} compact />}
        breadcrumb={
          <Link href="/field-ops/punch" className={textNavLinkMutedClassName}>
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

      <MainAppSection>
        <MainAppSummaryGrid>
          <MainAppSummaryItem label={t('list.columns.project')}>
            <Link href={`/projects/${item.projectId}`} className={textNavLinkClassName}>
              {projectName ?? t('detail.unknownProject')}
            </Link>
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('createPunch.workPackageLabel')}>
            {workPackageName ?? EMPTY}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('createPunch.locationLabel')}>
            {item.location?.trim() ? item.location : EMPTY}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('createPunch.dueDateLabel')}>
            {item.dueDate ? (
              <span className="pf-ltr-island" dir="ltr">
                {item.dueDate}
              </span>
            ) : (
              EMPTY
            )}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('createPunch.assigneeLabel')}>
            {assigneeName ?? EMPTY}
          </MainAppSummaryItem>
        </MainAppSummaryGrid>
        {item.description?.trim() ? (
          <p className="mt-3 whitespace-pre-wrap text-start text-sm text-[var(--pf-text-secondary)]">
            {item.description}
          </p>
        ) : null}
      </MainAppSection>

      {canManage ? (
        <MainAppSection title={t('updateStatus.label')}>
          <div className="flex max-w-lg flex-col gap-3">
            <PunchEditDetailsForm
              punchListItemId={item.id}
              location={item.location}
              dueDate={item.dueDate}
              assigneeEmployeeId={item.assigneeEmployeeId}
              employees={employees}
            />
            <PunchPriorityForm punchListItemId={item.id} currentPriority={item.priority} />
            <PunchStatusForm punchListItemId={item.id} currentStatus={item.status} />
          </div>
        </MainAppSection>
      ) : null}

      <MainAppSection title={t('cockpit.actions.documents')}>
        <DocumentAttachments
          ownerType="punch_list_item"
          ownerId={item.id}
          documents={documentsPanel.documents}
          linkCandidates={documentsPanel.linkCandidates}
          canRead={documentsPanel.canRead}
          canManage={documentsPanel.canManage}
          storageConfigured={documentsPanel.storageConfigured}
        />
      </MainAppSection>

      <WithAppClientMessages extra={['collaboration']}>
        <EntityLinkedTasksSection
          projectId={item.projectId}
          entityType="punch_list_item"
          entityId={item.id}
          defaultTaskTitle={item.title}
        />
      </WithAppClientMessages>
    </MainAppPage>
  );
}
