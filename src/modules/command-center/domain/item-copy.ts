/** Locale-aware WHAT / WHY / WHERE fallbacks. Entity names stay as stored. */

import { formatMoneyString } from '@/shared/money/format';
import type { NamespaceTranslator } from '@/shared/i18n/namespace-translator';

/** @deprecated Use NamespaceTranslator directly */
export type CommandCenterCopyTranslator = NamespaceTranslator;

export interface CommandCenterCopyScope {
  readonly t: NamespaceTranslator;
  readonly locale: string;
}

export function commandCenterCopyScope(
  t: NamespaceTranslator,
  locale: string,
): CommandCenterCopyScope {
  return { t, locale };
}

function label(
  t: NamespaceTranslator,
  group: string,
  value: string,
  fallbackValues?: Record<string, string>,
): string {
  const key = `itemCopy.labels.${group}.${value}`;
  if (t.has(key)) return t(key);
  return t(`itemCopy.labels.${group}.fallback`, fallbackValues);
}

function formatReportMonthLabel(t: NamespaceTranslator, yearMonth: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) return yearMonth;
  const year = match[1]!;
  const monthIndex = Number(match[2]);
  const monthKey = `itemCopy.reportMonths.${monthIndex}`;
  if (t.has(monthKey)) {
    return t('itemCopy.reportMonthLabel', { month: t(monthKey), year });
  }
  return yearMonth;
}

export function fallbackWhere(
  scope: CommandCenterCopyScope,
  key:
    | 'billing'
    | 'vendorBills'
    | 'workforce'
    | 'approvals'
    | 'project'
    | 'assets'
    | 'monthClose'
    | 'boq'
    | 'ocr'
    | 'fieldOps'
    | 'safety'
    | 'recurring'
    | 'timesheets'
    | 'closeout'
    | 'warranty'
    | 'cashFlow'
    | 'automations'
    | 'communications',
): string {
  return scope.t(`itemCopy.where.${key}`);
}

export function overdueArCopy(
  scope: CommandCenterCopyScope,
  input: { reference: string | null; dueDate: string | null; outstanding: string; currency: string },
): { what: string; why: string } {
  const outstanding = formatMoneyString(input.outstanding, input.currency, scope.locale);
  return {
    what: input.reference
      ? scope.t('itemCopy.overdueAr.whatWithReference', { reference: input.reference })
      : scope.t('itemCopy.overdueAr.whatDefault'),
    why: input.dueDate
      ? scope.t('itemCopy.overdueAr.whyWithDueDate', { dueDate: input.dueDate, outstanding })
      : scope.t('itemCopy.overdueAr.whyDefault', { outstanding }),
  };
}

export function vendorBillDueCopy(
  scope: CommandCenterCopyScope,
  input: { reference: string | null; dueDate: string; outstanding: string; currency: string },
): { what: string; why: string } {
  const outstanding = formatMoneyString(input.outstanding, input.currency, scope.locale);
  return {
    what: input.reference
      ? scope.t('itemCopy.vendorBillDue.whatWithReference', { reference: input.reference })
      : scope.t('itemCopy.vendorBillDue.whatDefault'),
    why: scope.t('itemCopy.vendorBillDue.why', { dueDate: input.dueDate, outstanding }),
  };
}

export function openAttendanceCopy(
  scope: CommandCenterCopyScope,
  workDate: string,
): { what: string; why: string } {
  return {
    what: scope.t('itemCopy.openAttendance.what'),
    why: scope.t('itemCopy.openAttendance.why', { workDate }),
  };
}

export function unattributedProjectLaborCopy(
  scope: CommandCenterCopyScope,
  input: {
    readonly employeeName: string;
    readonly workDate: string;
    readonly hours: string;
  },
): { what: string; why: string } {
  return {
    what: scope.t('itemCopy.unattributedProjectLabor.what'),
    why: scope.t('itemCopy.unattributedProjectLabor.why', input),
  };
}

export function unallocatedEmployeeCostCopy(
  scope: CommandCenterCopyScope,
  input: {
    readonly employeeName: string;
    readonly yearMonth: string;
    readonly knownAmount: string;
    readonly allocatedAmount: string;
    readonly unallocatedAmount: string;
    readonly currency: string;
    readonly status: string;
  },
): { what: string; why: string } {
  const status = allocationStatusLabel(scope.t, input.status);
  const recognized = formatMoneyString(input.knownAmount, input.currency, scope.locale);
  const allocated = formatMoneyString(input.allocatedAmount, input.currency, scope.locale);
  const remaining = formatMoneyString(input.unallocatedAmount, input.currency, scope.locale);
  return {
    what: scope.t('itemCopy.unallocatedEmployeeCost.what', {
      employeeName: input.employeeName,
      yearMonth: input.yearMonth,
    }),
    why: scope.t('itemCopy.unallocatedEmployeeCost.why', {
      recognized,
      allocated,
      remaining,
      status,
    }),
  };
}

export function unallocatedVendorBillCopy(
  scope: CommandCenterCopyScope,
  input: { outstanding: string; currency: string },
): { what: string; why: string } {
  const outstanding = formatMoneyString(input.outstanding, input.currency, scope.locale);
  return {
    what: scope.t('itemCopy.unallocatedVendorBill.what'),
    why: scope.t('itemCopy.unallocatedVendorBill.why', { outstanding }),
  };
}

export function overBudgetCopy(
  scope: CommandCenterCopyScope,
  input: { actual: string; budget: string; currency: string; overBy: string },
): { what: string; why: string } {
  const actual = formatMoneyString(input.actual, input.currency, scope.locale);
  const budget = formatMoneyString(input.budget, input.currency, scope.locale);
  const overBy = formatMoneyString(input.overBy, input.currency, scope.locale);
  return {
    what: scope.t('itemCopy.overBudget.what'),
    why: scope.t('itemCopy.overBudget.why', { actual, budget, overBy }),
  };
}

export function openApprovalCopy(
  scope: CommandCenterCopyScope,
  input: { entityType: string; amount: string | null; currency: string | null },
): { what: string; why: string } {
  const entity = approvalEntityTypeLabel(scope.t, input.entityType);
  const money =
    input.amount && input.currency
      ? ` · ${formatMoneyString(input.amount, input.currency, scope.locale)}`
      : '';
  return {
    what: scope.t('itemCopy.openApproval.what'),
    why: scope.t('itemCopy.openApproval.why', { entity, money }),
  };
}

export function overduePlanningCopy(
  scope: CommandCenterCopyScope,
  input: { kind: string; targetEndDate: string; progressPercent: string },
): { what: string; why: string } {
  return {
    what:
      input.kind === 'milestone'
        ? scope.t('itemCopy.overduePlanning.whatMilestone')
        : scope.t('itemCopy.overduePlanning.whatPlanItem'),
    why: scope.t('itemCopy.overduePlanning.why', {
      targetEndDate: input.targetEndDate,
      progressPercent: input.progressPercent,
    }),
  };
}

export function expiringComplianceCopy(
  scope: CommandCenterCopyScope,
  input: { status: string; expiresOn: string | null },
): { what: string; why: string } {
  const expired = input.status === 'expired';
  const status = complianceStatusLabel(scope.t, input.status);
  return {
    what: expired
      ? scope.t('itemCopy.expiringCompliance.whatExpired')
      : scope.t('itemCopy.expiringCompliance.whatExpiring'),
    why: input.expiresOn
      ? scope.t('itemCopy.expiringCompliance.whyWithDate', { expiresOn: input.expiresOn, status })
      : scope.t('itemCopy.expiringCompliance.whyStatusOnly', { status }),
  };
}

export function overdueMaintenanceCopy(
  scope: CommandCenterCopyScope,
  input: { performedOn: string | null; status: string },
): { what: string; why: string } {
  return {
    what: scope.t('itemCopy.overdueMaintenance.what'),
    why: scope.t('itemCopy.overdueMaintenance.why', {
      performedOn: input.performedOn ?? scope.t('itemCopy.overdueMaintenance.noDate'),
      status: input.status,
    }),
  };
}

export function creditVoidIssueCopy(
  scope: CommandCenterCopyScope,
  collectionStatus: string,
): { what: string; why: string } {
  const status = collectionStatusLabel(scope.t, collectionStatus);
  return {
    what: scope.t('itemCopy.creditVoidIssue.what'),
    why: scope.t('itemCopy.creditVoidIssue.why', { status }),
  };
}

export function monthCloseIncompleteCopy(
  scope: CommandCenterCopyScope,
  input: { yearMonth: string; status: string; completenessPercent: string },
): { what: string; why: string } {
  const status = monthCloseStatusLabel(scope.t, input.status);
  return {
    what: scope.t('itemCopy.monthCloseIncomplete.what', { yearMonth: input.yearMonth }),
    why: scope.t('itemCopy.monthCloseIncomplete.why', {
      status,
      completenessPercent: input.completenessPercent,
    }),
  };
}

export function boqMeasurementAwaitingCopy(
  scope: CommandCenterCopyScope,
  input: { periodLabel: string; certificateNumber: number },
): { what: string; why: string } {
  return {
    what: scope.t('itemCopy.boqMeasurementAwaiting.what'),
    why: scope.t('itemCopy.boqMeasurementAwaiting.why', input),
  };
}

export function boqProgressReadyToBillCopy(
  scope: CommandCenterCopyScope,
  input: { periodLabel: string; certificateNumber: number },
): { what: string; why: string } {
  return {
    what: scope.t('itemCopy.boqProgressReadyToBill.what'),
    why: scope.t('itemCopy.boqProgressReadyToBill.why', input),
  };
}

export function boqVsContractMismatchCopy(
  scope: CommandCenterCopyScope,
  input: { status: string },
): { what: string; why: string } {
  return {
    what: scope.t('itemCopy.boqVsContractMismatch.what'),
    why: scope.t('itemCopy.boqVsContractMismatch.why', {
      statusLabel: boqReconStatusLabel(scope.t, input.status),
    }),
  };
}

export function vendorBillApproachingCopy(
  scope: CommandCenterCopyScope,
  input: { reference: string | null; dueDate: string; outstanding: string; currency: string },
): { what: string; why: string } {
  const outstanding = formatMoneyString(input.outstanding, input.currency, scope.locale);
  return {
    what: input.reference
      ? scope.t('itemCopy.vendorBillApproaching.whatWithReference', { reference: input.reference })
      : scope.t('itemCopy.vendorBillApproaching.whatDefault'),
    why: scope.t('itemCopy.vendorBillApproaching.why', { dueDate: input.dueDate, outstanding }),
  };
}

export function ocrNeedsReviewCopy(
  scope: CommandCenterCopyScope,
  filename: string | null,
): { what: string; why: string } {
  return {
    what: scope.t('itemCopy.ocrNeedsReview.what'),
    why: filename
      ? scope.t('itemCopy.ocrNeedsReview.whyWithFilename', { filename })
      : scope.t('itemCopy.ocrNeedsReview.whyDefault'),
  };
}

export function ocrFailedCopy(
  scope: CommandCenterCopyScope,
  filename: string | null,
): { what: string; why: string } {
  return {
    what: scope.t('itemCopy.ocrFailed.what'),
    why: filename
      ? scope.t('itemCopy.ocrFailed.whyWithFilename', { filename })
      : scope.t('itemCopy.ocrFailed.whyDefault'),
  };
}

export function forecastWarningCopy(
  scope: CommandCenterCopyScope,
  kind: string,
): { what: string; why: string } {
  const whatKey = `itemCopy.forecastWarning.kinds.${kind}.what`;
  const whyKey = `itemCopy.forecastWarning.kinds.${kind}.why`;
  return {
    what: scope.t.has(whatKey) ? scope.t(whatKey) : scope.t('itemCopy.forecastWarning.default.what'),
    why: scope.t.has(whyKey) ? scope.t(whyKey) : scope.t('itemCopy.forecastWarning.default.why'),
  };
}

export function punchOpenCopy(scope: CommandCenterCopyScope, title: string): { what: string; why: string } {
  return {
    what: scope.t('itemCopy.punchOpen.what', { title }),
    why: scope.t('itemCopy.punchOpen.why'),
  };
}

export function safetyOpenCopy(scope: CommandCenterCopyScope, title: string): { what: string; why: string } {
  return {
    what: scope.t('itemCopy.safetyOpen.what', { title }),
    why: scope.t('itemCopy.safetyOpen.why'),
  };
}

export function inspectionOpenCopy(
  scope: CommandCenterCopyScope,
  title: string,
  scheduledOn: string | null,
): { what: string; why: string } {
  return {
    what: scope.t('itemCopy.inspectionOpen.what', { title }),
    why: scheduledOn
      ? scope.t('itemCopy.inspectionOpen.whyScheduled', { scheduledOn })
      : scope.t('itemCopy.inspectionOpen.whyOpen'),
  };
}

export function recurringDraftIssueCopy(
  scope: CommandCenterCopyScope,
  title: string,
  nextRunDate: string,
): { what: string; why: string } {
  return {
    what: scope.t('itemCopy.recurringDraftIssue.what', { title }),
    why: scope.t('itemCopy.recurringDraftIssue.why', { nextRunDate }),
  };
}

export function timesheetMissingCopy(
  scope: CommandCenterCopyScope,
  periodEnd: string,
): { what: string; why: string } {
  return {
    what: scope.t('itemCopy.timesheetMissing.what'),
    why: scope.t('itemCopy.timesheetMissing.why', { periodEnd }),
  };
}

function boqReconStatusLabel(t: NamespaceTranslator, status: string): string {
  return label(t, 'boqReconStatus', status, {
    status: status.replaceAll('_', ' '),
  });
}

function allocationStatusLabel(t: NamespaceTranslator, status: string): string {
  return label(t, 'allocationStatus', status);
}

/** Human label for approval / notification entity types — never expose raw codes in UI. */
export function approvalEntityTypeLabel(t: NamespaceTranslator, entityType: string): string {
  return label(t, 'approvalEntityType', entityType);
}

function complianceStatusLabel(t: NamespaceTranslator, status: string): string {
  return label(t, 'complianceStatus', status, { status });
}

function collectionStatusLabel(t: NamespaceTranslator, status: string): string {
  return label(t, 'collectionStatus', status, { status });
}

function monthCloseStatusLabel(t: NamespaceTranslator, status: string): string {
  return label(t, 'monthCloseStatus', status, { status });
}

export function closeoutBlockersCopy(
  scope: CommandCenterCopyScope,
  input: { projectName: string; status: string },
): { what: string; why: string } {
  return {
    what: scope.t('itemCopy.closeoutBlockers.what', { projectName: input.projectName }),
    why:
      input.status === 'reopened'
        ? scope.t('itemCopy.closeoutBlockers.whyReopened')
        : scope.t('itemCopy.closeoutBlockers.whyDefault'),
  };
}

export function warrantyExpiringCopy(
  scope: CommandCenterCopyScope,
  input: { title: string; endDate: string },
): { what: string; why: string } {
  return {
    what: scope.t('itemCopy.warrantyExpiring.what', { title: input.title }),
    why: scope.t('itemCopy.warrantyExpiring.why', { endDate: input.endDate }),
  };
}

export function cashFlowRiskCopy(
  scope: CommandCenterCopyScope,
  input: { overdueIn: string; overdueOut: string; currency: string },
): { what: string; why: string } {
  const overdueIn = formatMoneyString(input.overdueIn, input.currency, scope.locale);
  const overdueOut = formatMoneyString(input.overdueOut, input.currency, scope.locale);
  return {
    what: scope.t('itemCopy.cashFlowRisk.what'),
    why: scope.t('itemCopy.cashFlowRisk.why', { overdueIn, overdueOut }),
  };
}

/** Human label for automation preset keys — never expose raw keys in UI. */
export function automationPresetLabel(t: NamespaceTranslator, presetKey: string): string {
  return label(t, 'automationPreset', presetKey);
}

export function automationFollowupCopy(
  scope: CommandCenterCopyScope,
  input: { presetKey: string; ranAt: string },
): { what: string; why: string } {
  const preset = automationPresetLabel(scope.t, input.presetKey);
  return {
    what: scope.t('itemCopy.automationFollowup.what'),
    why: scope.t('itemCopy.automationFollowup.why', { preset, ranAt: input.ranAt }),
  };
}

export function communicationFailedCopy(
  scope: CommandCenterCopyScope,
  input: { subject: string },
): { what: string; why: string } {
  return {
    what: scope.t('itemCopy.communicationFailed.what', { subject: input.subject }),
    why: scope.t('itemCopy.communicationFailed.why'),
  };
}

export function billingPlanCycleDraftCopy(
  scope: CommandCenterCopyScope,
  input: { title: string; cycleNumber: number },
): { what: string; why: string } {
  return {
    what: scope.t('itemCopy.billingPlanCycleDraft.what', { title: input.title }),
    why: scope.t('itemCopy.billingPlanCycleDraft.why', { cycleNumber: input.cycleNumber }),
  };
}

export function billingPlanMilestoneDueCopy(
  scope: CommandCenterCopyScope,
  input: { label: string; targetDate: string },
): { what: string; why: string } {
  return {
    what: scope.t('itemCopy.billingPlanMilestoneDue.what', { label: input.label }),
    why: scope.t('itemCopy.billingPlanMilestoneDue.why', { targetDate: input.targetDate }),
  };
}

export function billingPlanRetentionReleaseDueCopy(
  scope: CommandCenterCopyScope,
  input: { heldRemaining: string; currency: string },
): { what: string; why: string } {
  const heldRemaining = formatMoneyString(input.heldRemaining, input.currency, scope.locale);
  return {
    what: scope.t('itemCopy.billingPlanRetentionReleaseDue.what'),
    why: scope.t('itemCopy.billingPlanRetentionReleaseDue.why', { heldRemaining }),
  };
}

export function monthlyWorkforceReportReadyCopy(
  scope: CommandCenterCopyScope,
  yearMonth: string,
): { what: string; why: string; where: string } {
  const monthLabel = formatReportMonthLabel(scope.t, yearMonth);
  return {
    what: scope.t('itemCopy.monthlyWorkforceReportReady.what'),
    why: scope.t('itemCopy.monthlyWorkforceReportReady.why', { monthLabel }),
    where: scope.t('itemCopy.monthlyWorkforceReportReady.where'),
  };
}

export function missingAttendanceTodayCopy(
  scope: CommandCenterCopyScope,
  input: { count: number; date: string },
): { what: string; why: string } {
  return {
    what:
      input.count === 1
        ? scope.t('itemCopy.missingAttendanceToday.whatOne', { count: input.count })
        : scope.t('itemCopy.missingAttendanceToday.whatOther', { count: input.count }),
    why: scope.t('itemCopy.missingAttendanceToday.why', { date: input.date }),
  };
}
