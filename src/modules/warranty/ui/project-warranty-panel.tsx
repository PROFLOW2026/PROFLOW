import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { getEntityDocumentPanelData } from '@/modules/documents';
import { DocumentAttachments } from '@/modules/documents/ui';
import { getProjectDetail } from '@/modules/projects';
import { listVendorsForOrg } from '@/modules/vendors';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { withOrgContext } from '@/shared/auth/session';
import { listProjectWarrantyCoverages } from '../application/coverages';
import type { WarrantyCoverageStatus, WarrantyIssueRecord, WarrantyIssueStatus } from '../domain/types';
import {
  CreateCoverageForm,
  CreateIssueForm,
  CreateWorkOrderForm,
  IssueStatusButtons,
  VoidCoverageButton,
} from './warranty-forms';
import { PrepareMessageLink } from '@/modules/communications/ui/prepare-message-link';

function coverageShape(status: WarrantyCoverageStatus): StatusShape {
  switch (status) {
    case 'active':
      return 'active';
    case 'expired':
      return 'overdue';
    case 'void':
      return 'void';
    default:
      return 'pending';
  }
}

function issueShape(status: WarrantyIssueStatus): StatusShape {
  switch (status) {
    case 'in_progress':
      return 'pending';
    case 'resolved':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'active';
  }
}

export async function ProjectWarrantyPanel({ projectId }: { readonly projectId: string }) {
  const t = await getTranslations('warranty');
  const data = await withOrgContext(async (context) => {
    const [{ coverages, issuesByCoverageId }, detail] = await Promise.all([
      listProjectWarrantyCoverages(context, projectId),
      getProjectDetail(context, projectId),
    ]);
    const vendors = hasPermission(context, PERMISSIONS.VENDORS_READ)
      ? await listVendorsForOrg(context, {}).catch(() => [])
      : [];
    const canUpdate = hasPermission(context, PERMISSIONS.PROJECTS_UPDATE);
    const documentPanels: Record<string, Awaited<ReturnType<typeof getEntityDocumentPanelData>>> = {};
    for (const coverage of coverages) {
      documentPanels[coverage.id] = await getEntityDocumentPanelData(
        context,
        'warranty_coverage',
        coverage.id,
      );
    }
    return {
      coverages,
      issuesByCoverageId,
      workPackages: detail.workPackages.map((row) => ({ id: row.id, name: row.name })),
      vendors: vendors.map((row) => ({ id: row.id, name: row.name })),
      canUpdate,
      documentPanels,
    };
  });

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold">{t('title')}</h2>
        <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('description')}</p>
        <div className="mt-2">
          <PrepareMessageLink entityType="warranty" projectId={projectId} />
        </div>
      </div>

      {data.canUpdate ? (
        <CreateCoverageForm
          projectId={projectId}
          workPackages={data.workPackages}
          vendors={data.vendors}
        />
      ) : null}

      {data.coverages.length === 0 ? (
        <EmptyState title={t('list.empty')} />
      ) : (
        data.coverages.map((coverage) => {
          const issues = data.issuesByCoverageId[coverage.id] ?? [];
          const docs = data.documentPanels[coverage.id];
          return (
            <section
              key={coverage.id}
              className="flex min-w-0 flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] p-4"
            >
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold">{coverage.title}</h3>
                  <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                    {t(`coverage.types.${coverage.coverageType}`)}
                    {coverage.startDate ? ` · ${coverage.startDate}` : ''}
                    {coverage.endDate ? ` – ${coverage.endDate}` : ''}
                  </p>
                </div>
                <StatusBadge
                  shape={coverageShape(coverage.status)}
                  label={t(`coverage.status.${coverage.status}`)}
                />
              </div>

              {coverage.notes ? (
                <p className="text-sm text-[var(--pf-text-secondary)]">{coverage.notes}</p>
              ) : null}

              {data.canUpdate && coverage.status !== 'void' ? (
                <VoidCoverageButton coverageId={coverage.id} projectId={projectId} />
              ) : null}

              <div className="flex min-w-0 flex-col gap-3">
                <h4 className="text-sm font-medium">{t('issue.title')}</h4>
                {issues.length === 0 ? (
                  <p className="text-sm text-[var(--pf-text-secondary)]">{t('issue.empty')}</p>
                ) : (
                  <ul className="flex min-w-0 flex-col gap-3">
                    {issues.map((issue) => (
                      <IssueRow
                        key={issue.id}
                        issue={issue}
                        projectId={projectId}
                        canUpdate={data.canUpdate}
                      />
                    ))}
                  </ul>
                )}
                {data.canUpdate && coverage.status !== 'void' ? (
                  <CreateIssueForm coverageId={coverage.id} projectId={projectId} />
                ) : null}
              </div>

              {docs ? (
                <DocumentAttachments
                  ownerType="warranty_coverage"
                  ownerId={coverage.id}
                  documents={docs.documents}
                  linkCandidates={docs.linkCandidates}
                  canRead={docs.canRead}
                  canManage={docs.canManage}
                  storageConfigured={docs.storageConfigured}
                />
              ) : null}
            </section>
          );
        })
      )}
    </div>
  );
}

function IssueRow({
  issue,
  projectId,
  canUpdate,
}: {
  readonly issue: WarrantyIssueRecord;
  readonly projectId: string;
  readonly canUpdate: boolean;
}) {
  return (
    <IssueCard issue={issue} projectId={projectId} canUpdate={canUpdate} />
  );
}

async function IssueCard({
  issue,
  projectId,
  canUpdate,
}: {
  readonly issue: WarrantyIssueRecord;
  readonly projectId: string;
  readonly canUpdate: boolean;
}) {
  const t = await getTranslations('warranty');
  return (
    <li className="rounded-md border border-[var(--pf-border-default)] p-3">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <p className="font-medium">{issue.title}</p>
        <StatusBadge shape={issueShape(issue.status)} label={t(`issue.status.${issue.status}`)} />
      </div>
      {issue.notes ? <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{issue.notes}</p> : null}
      {issue.workOrderId ? (
        <p className="mt-2 text-sm">
          <Link href={`/work-orders/${issue.workOrderId}`} prefetch={false} className="hover:underline">
            {t('issue.linkedWorkOrder')}
          </Link>
        </p>
      ) : null}
      {canUpdate ? (
        <div className="mt-3 flex min-w-0 flex-col gap-2">
          <IssueStatusButtons issueId={issue.id} projectId={projectId} status={issue.status} />
          {!issue.workOrderId && issue.status !== 'cancelled' && issue.status !== 'resolved' ? (
            <CreateWorkOrderForm issueId={issue.id} projectId={projectId} title={issue.title} />
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
