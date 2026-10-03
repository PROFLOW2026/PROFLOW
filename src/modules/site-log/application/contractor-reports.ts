import { AUDIT_ACTIONS } from '@/shared/audit';
import { DOMAIN_EVENTS } from '@/shared/domain-events';
import { EXTERNAL_CAPABILITIES, requireExternalScope, type ExternalContext } from '@/shared/external';
import { ValidationError } from '@/shared/errors';
import { insertReport, listReportsForProject, type DailyReportRow } from '../data/site-log.repository';
import { latestReportRevisions } from '../domain/daily-log';
import {
  pickExternalTarget,
  resolveExternalProjectTargets,
  type ExternalProjectTarget,
} from '../shared/external-scope';
import { recordExternalFieldWrite } from '../shared/side-effects';
import { parseOrThrow } from '../shared/validation';
import { submitContractorReportSchema, type SubmitContractorReportInput } from '../validation/schemas';

const X = EXTERNAL_CAPABILITIES;

export interface ContractorDailyReportsView {
  readonly projectId: string;
  /** Parties the principal may report for (empty = no ext.daily_log.submit on this project). */
  readonly targets: readonly ExternalProjectTarget[];
  readonly reports: readonly (DailyReportRow & { readonly isLatest: boolean })[];
}

/** Contractor's own daily reports on a project. RLS keeps other contractors' reports out. */
export async function getContractorDailyReports(
  context: ExternalContext,
  projectId: string,
  options: { readonly limit?: number } = {},
): Promise<ContractorDailyReportsView> {
  const targets = await resolveExternalProjectTargets(context, projectId, X.DAILY_LOG_SUBMIT);
  if (targets.length === 0) return { projectId, targets, reports: [] };
  const organizationIds = [...new Set(targets.map((target) => target.organizationId))];
  const rows = await listReportsForProject(context.db, projectId, organizationIds, Math.min(options.limit ?? 60, 200));
  const visible = rows.filter((row) =>
    targets.some(
      (target) =>
        target.organizationId === row.organizationId &&
        target.vendorId === row.vendorId &&
        (target.subcontractAgreementId === null || target.subcontractAgreementId === row.subcontractAgreementId),
    ),
  );
  const latestIds = new Set(
    Object.values(
      visible.reduce<Record<string, DailyReportRow[]>>((groups, row) => {
        (groups[row.reportDate] ??= []).push(row);
        return groups;
      }, {}),
    ).flatMap((group) => latestReportRevisions(group).map((row) => row.id)),
  );
  return { projectId, targets, reports: visible.map((row) => ({ ...row, isLatest: latestIds.has(row.id) })) };
}

/** Contractor submits its daily report (a resubmission for the same date is a new revision). */
export async function submitContractorDailyReport(
  context: ExternalContext,
  raw: SubmitContractorReportInput,
  today: string,
): Promise<DailyReportRow> {
  const input = parseOrThrow(submitContractorReportSchema.safeParse(raw));
  if (input.reportDate > today) {
    throw new ValidationError([
      { path: 'reportDate', message: 'Future dates cannot be reported', messageKey: 'siteOps.errors.futureDate' },
    ]);
  }
  const targets = await resolveExternalProjectTargets(context, input.projectId, X.DAILY_LOG_SUBMIT);
  const target = pickExternalTarget(targets, {
    vendorId: input.vendorId ?? null,
    subcontractAgreementId: input.subcontractAgreementId ?? null,
  });
  const agreementId = target.subcontractAgreementId ?? input.subcontractAgreementId ?? null;
  requireExternalScope(
    context,
    {
      organizationId: target.organizationId,
      projectId: input.projectId,
      vendorId: target.vendorId,
      subcontractAgreementId: agreementId,
    },
    X.DAILY_LOG_SUBMIT,
  );

  const report = await insertReport(context.db, {
    organizationId: target.organizationId,
    projectId: input.projectId,
    vendorId: target.vendorId,
    subcontractAgreementId: agreementId,
    reportDate: input.reportDate,
    locationId: input.locationId ?? null,
    manpowerCount: input.manpowerCount ?? null,
    workPerformed: input.workPerformed ?? null,
    equipment: input.equipment ?? null,
    deliveries: input.deliveries ?? null,
    delays: input.delays ?? null,
    blockingIssues: input.blockingIssues ?? null,
    safetyNotes: input.safetyNotes ?? null,
    notes: input.notes ?? null,
    submittedActorType: 'external',
    submittedByPrincipalId: context.principalId,
  });

  await recordExternalFieldWrite(context.db, {
    organizationId: target.organizationId,
    projectId: input.projectId,
    principalId: context.principalId,
    audit: {
      action: AUDIT_ACTIONS.SITE_DAILY_REPORT_SUBMITTED,
      entityType: 'site_daily_report',
      entityId: report.id,
      after: { vendorId: report.vendorId, reportDate: report.reportDate, revision: report.revision },
    },
    event: {
      type: DOMAIN_EVENTS.FIELD_DAILY_LOG_SUBMITTED,
      entityType: 'site_daily_report',
      entityId: report.id,
      payload: {
        reportDate: report.reportDate,
        vendorId: report.vendorId,
        subcontractAgreementId: report.subcontractAgreementId,
        revision: report.revision,
      },
    },
  });
  return report;
}
