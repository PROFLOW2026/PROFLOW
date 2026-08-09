import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { getEntityDocumentPanelData } from '@/modules/documents';
import { DocumentAttachments } from '@/modules/documents/ui';
import { getDailyLogForOrg, listFieldOpsWorkPackages } from '@/modules/field-ops';
import { listProjectsForOrg } from '@/modules/projects';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { DailyLogEditForm } from '../daily-log-edit-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'fieldOps' });
  return { title: t('detail.logTitle') };
}

export default async function DailyLogDetailPage({
  params,
}: {
  params: Promise<{ logId: string }>;
}) {
  const { logId } = await params;
  const t = await getTranslations('fieldOps');
  const tCommon = await getTranslations('common');
  const locale = await getLocale();

  const data = await withOrgContext(async (context) => {
    try {
      const log = await getDailyLogForOrg(context, logId);
      const [projects, packages, documentsPanel] = await Promise.all([
        listProjectsForOrg(context, {}),
        listFieldOpsWorkPackages(context, [log.projectId]),
        getEntityDocumentPanelData(context, 'daily_log', logId),
      ]);
      return {
        log,
        projectName: projects.find((p) => p.id === log.projectId)?.name ?? null,
        workPackageName: packages.find((p) => p.id === log.workPackageId)?.name ?? null,
        documentsPanel,
        canManage: hasPermission(context, PERMISSIONS.FIELD_OPS_MANAGE),
      };
    } catch {
      return null;
    }
  });

  if (!data) notFound();

  const { log, projectName, workPackageName, documentsPanel, canManage } = data;
  const dateLabel = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
    new Date(log.logDate),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={
          <span className="pf-ltr-island" dir="ltr">
            {dateLabel}
          </span>
        }
        description={projectName ?? t('detail.unknownProject')}
        breadcrumb={
          <Link
            href="/field-ops/logs"
            className="text-sm text-[var(--pf-text-secondary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
          >
            {tCommon('actions.back')}
          </Link>
        }
        meta={
          <div className="flex flex-wrap gap-2 text-sm text-[var(--pf-text-secondary)]">
            <Link
              href={`/projects/${log.projectId}`}
              className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
            >
              {projectName ?? t('detail.unknownProject')}
            </Link>
            {workPackageName ? <span>· {workPackageName}</span> : null}
            {log.weather ? <span>· {log.weather}</span> : null}
          </div>
        }
      />

      {canManage ? (
        <DailyLogEditForm log={log} />
      ) : (
        <div className="flex max-w-lg flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 text-sm">
          <DetailBlock label={t('createLog.summaryLabel')} value={log.summary} />
          <DetailBlock label={t('createLog.workforceNotesLabel')} value={log.workforceNotes} />
          <DetailBlock label={t('createLog.blockersLabel')} value={log.blockers} />
        </div>
      )}

      <DocumentAttachments
        ownerType="daily_log"
        ownerId={log.id}
        documents={documentsPanel.documents}
        linkCandidates={documentsPanel.linkCandidates}
        canRead={documentsPanel.canRead}
        canManage={documentsPanel.canManage}
        storageConfigured={documentsPanel.storageConfigured}
      />
    </div>
  );
}

function DetailBlock({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--pf-text-secondary)]">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap">{value}</p>
    </div>
  );
}
