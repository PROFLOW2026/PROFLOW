import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { listAssetsForOrg } from '@/modules/assets';
import { getEntityDocumentPanelData } from '@/modules/documents';
import { DocumentAttachments } from '@/modules/documents/ui';
import { getDailyLogForOrg, listFieldOpsWorkPackages } from '@/modules/field-ops';
import { DailyLogCorrectionNotes } from '@/modules/field-ops/ui/daily-log-correction-notes';
import { listProjectsForOrg } from '@/modules/projects';
import { listVendorsForOrg } from '@/modules/vendors';
import { listEmployeesForOrg } from '@/modules/workforce';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { StatusBadge } from '@/components/ui/status-badge';
import { DailyLogEditForm } from '../daily-log-edit-form';
import { DailyLogStatusActions } from '../daily-log-status-actions';
import { isDailyLogLocked } from '@/modules/field-ops/domain/daily-log-status';
import { textNavLinkClassName, textNavLinkMutedClassName } from '@/components/ui/pressable';
import { ReportDownloadButtons } from '@/modules/reports/ui';

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
      const [projects, packages, documentsPanel, vendorRows, employeeRows, assetRows] =
        await Promise.all([
          listProjectsForOrg(context, {}),
          listFieldOpsWorkPackages(context, [log.projectId]),
          getEntityDocumentPanelData(context, 'daily_log', logId),
          hasPermission(context, PERMISSIONS.VENDORS_READ)
            ? listVendorsForOrg(context, { status: 'active' }).catch(() => [])
            : Promise.resolve([]),
          hasPermission(context, PERMISSIONS.WORKFORCE_READ)
            ? listEmployeesForOrg(context, { status: 'active' }).catch(() => [])
            : Promise.resolve([]),
          hasPermission(context, PERMISSIONS.ASSETS_READ)
            ? listAssetsForOrg(context).catch(() => [])
            : Promise.resolve([]),
        ]);
      const preferredVendors = vendorRows.filter(
        (v) => v.type === 'subcontractor' || v.type === 'both',
      );
      const vendors = (preferredVendors.length > 0 ? preferredVendors : vendorRows).map((v) => ({
        id: v.id,
        name: v.name,
        hint: v.type,
      }));
      return {
        log,
        projectName: projects.find((p) => p.id === log.projectId)?.name ?? null,
        workPackageName: packages.find((p) => p.id === log.workPackageId)?.name ?? null,
        documentsPanel,
        canManage: hasPermission(context, PERMISSIONS.FIELD_OPS_MANAGE),
        canCreateSafety: hasPermission(context, PERMISSIONS.SAFETY_MANAGE),
        vendors,
        employees: employeeRows.map((e) => ({
          id: e.id,
          name: e.name,
        })),
        assets: assetRows.map((a) => ({ id: a.id, name: a.name })),
        vendorNames: vendors
          .filter((v) => log.vendorIds.includes(v.id))
          .map((v) => v.name),
        employeeNames: employeeRows
          .filter((e) => log.employeeIds.includes(e.id))
          .map((e) => e.name),
        assetNames: assetRows.filter((a) => log.assetIds.includes(a.id)).map((a) => a.name),
      };
    } catch {
      return null;
    }
  });

  if (!data) notFound();

  const {
    log,
    projectName,
    workPackageName,
    documentsPanel,
    canManage,
    canCreateSafety,
    vendors,
    employees,
    assets,
    vendorNames,
    employeeNames,
    assetNames,
  } = data;
  const dateLabel = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
    new Date(log.logDate),
  );
  const incidentNotes = [log.incidents, log.safetyNotes].filter(Boolean).join('\n\n');
  const safetyHref = (() => {
    const params = new URLSearchParams();
    params.set('fromDailyLogId', log.id);
    params.set('projectId', log.projectId);
    params.set('title', (log.incidents ?? log.safetyNotes ?? log.summary).slice(0, 200));
    if (incidentNotes) params.set('description', incidentNotes.slice(0, 4000));
    return `/safety/new?${params.toString()}`;
  })();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={
          <span className="pf-ltr-island" dir="ltr">
            {dateLabel}
          </span>
        }
        description={projectName ?? t('detail.unknownProject')}
        actions={<ReportDownloadButtons kind="field_daily" id={log.id} compact />}
        breadcrumb={
          <Link
            href="/field-ops/logs"
            className={textNavLinkMutedClassName}
          >
            {tCommon('actions.back')}
          </Link>
        }
        meta={
          <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--pf-text-secondary)]">
            <StatusBadge
              shape={
                log.status === 'finalized'
                  ? 'completed'
                  : log.status === 'submitted'
                    ? 'pending'
                    : 'draft'
              }
              label={t(`logStatus.${log.status}`)}
            />
            <Link
              href={`/projects/${log.projectId}`}
              className={textNavLinkClassName}
            >
              {projectName ?? t('detail.unknownProject')}
            </Link>
            {workPackageName ? <span>· {workPackageName}</span> : null}
            {log.weather ? <span>· {log.weather}</span> : null}
          </div>
        }
      />

      {canManage ? (
        <>
          <DailyLogStatusActions log={log} />
          {isDailyLogLocked(log.status) ? (
            <div className="flex max-w-lg flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 text-sm">
              <DetailBlock label={t('createLog.summaryLabel')} value={log.summary} />
              <DetailBlock label={t('createLog.workforceNotesLabel')} value={log.workforceNotes} />
              <DetailBlock label={t('createLog.blockersLabel')} value={log.blockers} />
              <DetailBlock
                label={t('createLog.vendorsOnSite')}
                value={vendorNames.length > 0 ? vendorNames.join(', ') : null}
              />
              <DetailBlock
                label={t('createLog.employeesOnSite')}
                value={employeeNames.length > 0 ? employeeNames.join(', ') : null}
              />
              <DetailBlock
                label={t('createLog.assetsOnSite')}
                value={assetNames.length > 0 ? assetNames.join(', ') : null}
              />
              <DetailBlock label={t('extraFields.workersOnSite')} value={log.workersOnSite} />
              <DetailBlock label={t('extraFields.subcontractorsOnSite')} value={log.subcontractorsOnSite} />
              <DetailBlock label={t('extraFields.equipmentOnSite')} value={log.equipmentOnSite} />
              <DetailBlock label={t('extraFields.deliveries')} value={log.deliveries} />
              <DetailBlock label={t('extraFields.delays')} value={log.delays} />
              <DetailBlock label={t('extraFields.incidents')} value={log.incidents} />
              <DetailBlock label={t('extraFields.safetyNotes')} value={log.safetyNotes} />
              <DetailBlock label={t('extraFields.visitorNotes')} value={log.visitorNotes} />
              <DetailBlock label={t('extraFields.managerNotes')} value={log.managerNotes} />
              <DailyLogCorrectionNotes notes={log.correctionNotes} label={t('lifecycle.correctionHistory')} />
            </div>
          ) : (
            <DailyLogEditForm
              log={log}
              vendors={vendors}
              employees={employees}
              assets={assets}
            />
          )}
        </>
      ) : (
        <div className="flex max-w-lg flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 text-sm">
          <DetailBlock label={t('createLog.summaryLabel')} value={log.summary} />
          <DetailBlock label={t('createLog.workforceNotesLabel')} value={log.workforceNotes} />
          <DetailBlock label={t('createLog.blockersLabel')} value={log.blockers} />
          <DetailBlock
            label={t('createLog.vendorsOnSite')}
            value={vendorNames.length > 0 ? vendorNames.join(', ') : null}
          />
          <DetailBlock
            label={t('createLog.employeesOnSite')}
            value={employeeNames.length > 0 ? employeeNames.join(', ') : null}
          />
          <DetailBlock
            label={t('createLog.assetsOnSite')}
            value={assetNames.length > 0 ? assetNames.join(', ') : null}
          />
          <DetailBlock label={t('extraFields.subcontractorsOnSite')} value={log.subcontractorsOnSite} />
          <DetailBlock label={t('extraFields.managerNotes')} value={log.managerNotes} />
          <DailyLogCorrectionNotes notes={log.correctionNotes} label={t('lifecycle.correctionHistory')} />
        </div>
      )}

      {!isDailyLogLocked(log.status) && canManage ? (
        <div className="max-w-lg">
          <DailyLogCorrectionNotes notes={log.correctionNotes} label={t('lifecycle.correctionHistory')} />
        </div>
      ) : null}

      {log.linkedSafetyRecordId ? (
        <p className="text-sm">
          <Link href={`/safety/${log.linkedSafetyRecordId}`} className={textNavLinkClassName}>
            {t('lifecycle.linkedSafety')}
          </Link>
        </p>
      ) : canCreateSafety && incidentNotes ? (
        <p className="text-sm">
          <Link href={safetyHref} className={textNavLinkClassName}>
            {t('lifecycle.createSafety')}
          </Link>
        </p>
      ) : null}

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
