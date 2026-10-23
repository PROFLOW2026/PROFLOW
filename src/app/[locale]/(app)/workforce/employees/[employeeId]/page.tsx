import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  MainAppPage,
  MainAppSection,
  MainAppSummaryGrid,
  MainAppSummaryItem,
} from '@/components/patterns/main-app';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { listComplianceArtifactsForOrg } from '@/modules/compliance';
import { listCustomFieldValuesForEntity } from '@/modules/custom-fields';
import { getEntityDocumentPanelData } from '@/modules/documents';
import { EntityCustomFieldsPanel } from '@/modules/custom-fields/ui';
import { resolveEmployeeDailyFramework, resolveEmployeeWorkCalendarForCosting } from '@/modules/workforce/application/work-calendar-context';
import { buildEmployeeCompensationSummary } from '@/modules/workforce/application/compensation-summary';
import { loadMonthlyEmployerCostReview } from '@/modules/workforce';
import {
  getEmployee,
  listAssignableProjects,
  listEmployeeAssignmentHistoryLinks,
  listEmployeeProjectLinks,
  listEmployeesForOrg,
  listLinkableOrgMembers,
  listRateHistory,
} from '@/modules/workforce';
import { resolveCurrentCompensationForDisplay } from '@/modules/workforce/domain/rate-lookup';
import { EmployeeCompensationSummaryPanel } from '@/modules/workforce/ui/employee-compensation-summary';
import {
  canLogTime,
  canManageWorkforce,
} from '@/modules/workforce/ui/employees-table';
import { canManageWorkforceCost, canReadWorkforceCost } from '@/modules/workforce/application/workforce-cost-authz';
import { EmployeeProjectsPanel } from '@/modules/workforce/ui/employee-projects-panel';
import { EmployeePeriodSummaryPanel } from '@/modules/workforce/ui/employee-period-summary';
import { DateRangeSelector } from '@/components/patterns/date-range-selector';
import { EmployeeEditPanelSection } from '@/modules/workforce/ui/employee-edit-panel-section';
import { EmployeeDetailUnsavedProvider } from '@/modules/workforce/ui/employee-detail-unsaved-context';
import { EmployeeEmployeeSwitcher } from '@/modules/workforce/ui/employee-employee-switcher';
import { EmployeeSalarySections } from '@/modules/workforce/ui/employee-salary-sections';
import { EmployeeDocumentAttachmentsSection } from '@/modules/workforce/ui/employee-document-attachments-section';
import { MonthlyEmployerCostReview } from '@/modules/workforce/ui/monthly-employer-cost-review';
import { EmployeePayrollMonthPanel } from '@/modules/workforce/ui/employee-payroll-month-panel';
import { EmployeePageAlertFocus } from '@/modules/workforce/ui/employee-page-alert-focus';
import { AddRateVersionForm } from '@/modules/workforce/ui/add-rate-version-form';
import { RateHistoryTable } from '@/modules/workforce/ui/rate-history-table';
import { OrgWorkFrameworkForm } from '@/modules/workforce/ui/org-work-framework-form';
import { withOrgContext } from '@/shared/auth/session';
import { isOrganizationOwner } from '@/shared/business-change/org-owner';
import { localizeCode } from '@/shared/i18n/code-display';
import type { BusinessDate } from '@/shared/dates';
import { businessDate, todayInTimeZone, startOfMonth, endOfMonth } from '@/shared/dates';
import { formatBusinessDate } from '@/shared/dates/format';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import { upsertEntityFieldValueAction } from '../../../settings/custom-fields/actions';
import { getEmployeeAppAdminView } from '@/modules/employee-app';
import { resolveEmployeeAppPublicOrigin } from '@/modules/employee-app/domain/app-origin';
import { EmployeeAppAccessPanel } from '@/modules/employee-app/ui/employee-app-access-panel';
import { getEmployeeAvatarAvailability, getEmployeeAvatarPreviewUrl } from '@/modules/identity-images';
import { EmployeeAvatarPanel } from '@/modules/identity-images/client';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; employeeId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'workforce' });
  return { title: t('employees.detail.title') };
}

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ employeeId }, rawSearchParams] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>),
  ]);
  const [t, tComplianceStatus, tDocuments, locale] = await Promise.all([
    getTranslations('workforce'),
    getTranslations('status.compliance'),
    getTranslations('documents'),
    getLocale(),
  ]);

  const alertYearMonth =
    typeof rawSearchParams.yearMonth === 'string' ? rawSearchParams.yearMonth : undefined;
  const alertPaymentId =
    typeof rawSearchParams.paymentId === 'string' ? rawSearchParams.paymentId : undefined;

  const data = await withOrgContext(async (context) => {
    try {
      const employee = await getEmployee(context, employeeId);
      const [dailyFramework, calendar] = await Promise.all([
        resolveEmployeeDailyFramework(context.db, context.organizationId, employeeId),
        resolveEmployeeWorkCalendarForCosting(context.db, context.organizationId, employeeId),
      ]);
      const allowManage = canManageWorkforce(context);
      const canReadRates = canReadWorkforceCost(context);
      const canManageCosts = canManageWorkforceCost(context);
      const canReadCompliance = hasPermission(context, PERMISSIONS.COMPLIANCE_READ);
      const canReadAttendance =
        hasPermission(context, PERMISSIONS.ATTENDANCE_READ) ||
        hasPermission(context, PERMISSIONS.ATTENDANCE_MANAGE) ||
        hasPermission(context, PERMISSIONS.ATTENDANCE_SELF);
      const canManageAttendance = hasPermission(context, PERMISSIONS.ATTENDANCE_MANAGE);
      const canReadTimesheets =
        hasPermission(context, PERMISSIONS.TIME_MANAGE) ||
        hasPermission(context, PERMISSIONS.TIME_APPROVE);
      const [
        rateHistory,
        customFields,
        projectLinks,
        history,
        candidateProjects,
        linkableUsers,
        complianceArtifacts,
        documentsPanel,
      ] = await Promise.all([
        canReadRates ? listRateHistory(context, employeeId) : Promise.resolve([]),
        listCustomFieldValuesForEntity(context, 'employee', employeeId).catch(() => []),
        listEmployeeProjectLinks(context, employeeId),
        listEmployeeAssignmentHistoryLinks(context, employeeId).catch(() => []),
        allowManage ? listAssignableProjects(context).catch(() => []) : Promise.resolve([]),
        allowManage
          ? listLinkableOrgMembers(context, { exceptEmployeeId: employeeId }).catch(() => [])
          : Promise.resolve([]),
        canReadCompliance
          ? listComplianceArtifactsForOrg(context, {
              subjectType: 'employee',
              subjectId: employeeId,
            }).catch(() => [])
          : Promise.resolve([]),
        getEntityDocumentPanelData(context, 'employee', employeeId).catch(() => null),
      ]);
      const today = todayInTimeZone(context.organization.timezone);
      const reviewYearMonth = alertYearMonth ?? today.slice(0, 7);
      // Read-only page load: never mutate/reconcile costs here (Owner perf rule).
      const currentRate = resolveCurrentCompensationForDisplay(
        employee.rateVersions,
        businessDate(today),
      );
      const compensationSummary = canReadRates
        ? buildEmployeeCompensationSummary({
            asOf: businessDate(today),
            rateVersions: employee.rateVersions,
            dailyFramework,
            calendar,
            employeeStandardHoursPerDay: employee.standardHoursPerDay,
          })
        : null;

      const laborDefaults =
        allowManage || canManageCosts
          ? await import('@/modules/tenancy').then((m) =>
              m.getLaborCostDefaultsForApply(context).catch(() => null),
            )
          : null;

      const monthReview = canReadRates
        ? await loadMonthlyEmployerCostReview(context, {
            employeeId,
            yearMonth: reviewYearMonth,
          }).catch(() => null)
        : null;

      const payrollPayment =
        canReadRates && alertPaymentId
          ? await import('@/modules/workforce/application/payroll-payments').then((m) =>
              m.getPayrollPayment(context, {
                paymentId: alertPaymentId,
                employeeId,
              }),
            )
          : null;

      const appAdminView = allowManage
        ? await getEmployeeAppAdminView(context, employeeId).catch(() => null)
        : null;

      const switchableEmployees = await listEmployeesForOrg(context).catch(() => []);
      const canEditAvatar =
        allowManage || Boolean(employee.userId && employee.userId === context.userId);
      const [avatarAvailability, avatarPreviewUrl] = await Promise.all([
        getEmployeeAvatarAvailability(context),
        getEmployeeAvatarPreviewUrl(context, employeeId),
      ]);

      return {
        employee,
        dailyFramework,
        calendar,
        compensationSummary,
        laborDefaults,
        monthReview,
        payrollPayment,
        rateHistory,
        currentRate,
        today,
        customFields,
        projectLinks,
        history,
        candidateProjects,
        linkableUsers,
        complianceArtifacts,
        documentsPanel,
        canReadRates,
        canManageCosts,
        canReadCompliance,
        canReadAttendance,
        canManageAttendance,
        canReadTimesheets,
        allowLog: canLogTime(context),
        allowManage,
        isOwner: isOrganizationOwner(context),
        currency: context.organization.baseCurrency,
        defaultYearMonth: reviewYearMonth,
        workWeekStartDay: context.organization.workWeekStartDay,
        appAdminView,
        actorPermissions: [...context.permissions],
        organizationId: context.organizationId,
        organizationName: context.organization.name,
        switchableEmployees: switchableEmployees.map((row) => ({
          id: row.id,
          name: row.name,
        })),
        canEditAvatar,
        avatarAvailability,
        avatarPreviewUrl,
      };
    } catch {
      return null;
    }
  });

  if (!data) notFound();

  // Period summary date range: default to current month.
  const summaryFromRaw = typeof rawSearchParams.summaryFrom === 'string' ? rawSearchParams.summaryFrom : undefined;
  const summaryToRaw = typeof rawSearchParams.summaryTo === 'string' ? rawSearchParams.summaryTo : undefined;
  const summaryFrom = summaryFromRaw ? businessDate(summaryFromRaw) : startOfMonth(data.today);
  const summaryTo = summaryToRaw ? businessDate(summaryToRaw) : endOfMonth(data.today);

  const {
    employee,
    compensationSummary,
    laborDefaults,
    monthReview,
    payrollPayment,
    rateHistory,
    currentRate,
    customFields,
    projectLinks,
    history,
    candidateProjects,
    linkableUsers,
    complianceArtifacts,
    documentsPanel,
    canReadRates,
    canManageCosts,
    canReadCompliance,
    canReadAttendance,
    canManageAttendance,
    canReadTimesheets,
    allowLog,
    allowManage,
    currency,
    defaultYearMonth,
    today,
    workWeekStartDay,
    appAdminView,
    actorPermissions,
    organizationName,
    switchableEmployees,
    canEditAvatar,
    avatarAvailability,
    avatarPreviewUrl,
  } = data;

  const appOrigin = resolveEmployeeAppPublicOrigin();

  const orgFrameworkConfigured = Boolean(laborDefaults?.standardHoursPerDay);
  const showMonthReview =
    canReadRates &&
    Boolean(monthReview?.month || (monthReview?.months && monthReview.months.length > 0));

  const rateHistorySummary =
    rateHistory.length > 0
      ? t('employees.detail.salaryHistoryCount', { count: rateHistory.length })
      : t('employees.detail.noSalaryHistory');

  const showCompensationSection =
    canReadRates || (orgFrameworkConfigured && (allowManage || canManageCosts));

  const statusLabel = employee.archivedAt
    ? t('employees.detail.archivedBadge')
    : t(`employeeStatus.${employee.status}`);

  return (
    <EmployeeDetailUnsavedProvider>
      <MainAppPage className="gap-6 overflow-x-hidden">
      <Suspense fallback={null}>
        <EmployeePageAlertFocus />
      </Suspense>
      <PageHeader
        title={
          <EmployeeEmployeeSwitcher
            currentEmployeeId={employee.id}
            currentName={employee.name}
            employees={switchableEmployees}
          />
        }
        meta={
          <StatusBadge
            shape={employee.status === 'active' && !employee.archivedAt ? 'active' : 'archived'}
            label={
              employee.archivedAt
                ? t('employees.detail.archivedBadge')
                : t(`employeeStatus.${employee.status}`)
            }
          />
        }
        description={employee.jobTitle ?? undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            {allowManage ? (
              <Button asChild variant="secondary" size="lg">
                <a href="#employee-edit">{t('employees.detail.actionEdit')}</a>
              </Button>
            ) : null}
            {canManageCosts || canReadRates ? (
              <Button asChild variant="secondary" size="lg">
                <a href="#salary-update">{t('employees.detail.actionUpdateSalary')}</a>
              </Button>
            ) : null}
            {canManageAttendance ? (
              <Button asChild size="lg">
                <Link href={`/workforce/attendance?employeeId=${employee.id}&update=1`}>
                  {t('employees.detail.actionUpdateAttendance')}
                </Link>
              </Button>
            ) : null}
            {allowLog ? (
              <Button asChild variant="secondary" size="lg">
                <Link href={`/workforce/time/new?employeeId=${employee.id}`}>
                  {t('employees.detail.actionLogTime')}
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />

      <MainAppSection>
        <MainAppSummaryGrid>
          <MainAppSummaryItem label={t('employees.columns.status')}>
            <StatusBadge
              shape={employee.status === 'active' && !employee.archivedAt ? 'active' : 'archived'}
              label={statusLabel}
            />
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('employees.form.jobTitle')}>
            {employee.jobTitle?.trim() ? employee.jobTitle : '—'}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('employees.form.hireDate')}>
            <span dir="ltr">
              {employee.hireDate
                ? formatBusinessDate(employee.hireDate as BusinessDate, locale, 'medium')
                : t('employees.detail.hireDateNotSet')}
            </span>
          </MainAppSummaryItem>
          {employee.endDate ? (
            <MainAppSummaryItem label={t('employees.form.endDate')}>
              <span dir="ltr">
                {formatBusinessDate(employee.endDate as BusinessDate, locale, 'medium')}
              </span>
            </MainAppSummaryItem>
          ) : null}
        </MainAppSummaryGrid>
      </MainAppSection>

      <MainAppSection title={t('employees.detail.profile')}>
      <Card className="p-4 sm:p-5">
        <EmployeeAvatarPanel
          employeeId={employee.id}
          employeeName={employee.name}
          previewUrl={avatarPreviewUrl}
          canEdit={canEditAvatar}
          schemaReady={avatarAvailability.schemaReady}
          storageConfigured={avatarAvailability.storageConfigured}
        />
      </Card>

      {allowManage ? (
        <EmployeeAppAccessPanel
          key={appAdminView?.account?.id ?? 'no-account'}
          employeeId={employee.id}
          employeeName={employee.name}
          employeeNumber={employee.employeeNumber}
          employeePhone={employee.phone}
          employeeEmail={employee.email}
          organizationName={organizationName}
          locale={locale}
          appOrigin={appOrigin}
          account={appAdminView?.account ?? null}
          grants={appAdminView?.grants ?? []}
          documentCategories={appAdminView?.categories ?? new Map()}
          shareableCredentials={
            appAdminView?.shareableCredentials
              ? {
                  username: appAdminView.shareableCredentials.username,
                  temporaryPin: appAdminView.shareableCredentials.temporaryPin,
                  temporaryPinExpiresAt:
                    appAdminView.shareableCredentials.temporaryPinExpiresAt.toISOString(),
                }
              : null
          }
          actorPermissions={actorPermissions}
          assignableProjects={appAdminView?.assignableProjects ?? []}
          grantedProjectIds={appAdminView?.grantedProjectIds ?? []}
        />
      ) : null}

      {!orgFrameworkConfigured && (allowManage || canManageCosts) ? (
        <OrgWorkFrameworkForm
          standardHoursPerDay={laborDefaults?.standardHoursPerDay ?? null}
          workingDaysPerMonth={laborDefaults?.workingDaysPerMonth ?? null}
          standardWorkStartTime={laborDefaults?.standardWorkStartTime ?? null}
          standardWorkEndTime={laborDefaults?.standardWorkEndTime ?? null}
          workWeekdays={laborDefaults?.workWeekdays ?? null}
          attendanceProjectTimeApproval={
            laborDefaults?.attendanceProjectTimeApproval ?? 'draft'
          }
          setupRequired
          canBootstrapCosting={false}
          collapseWhenConfigured
        />
      ) : null}

      {allowManage ? (
        <EmployeeEditPanelSection employee={employee} linkableUsers={linkableUsers} />
      ) : (
      <Card className="flex flex-col gap-2 p-4 sm:p-6">
        <h2 className="text-base font-semibold">{t('employees.detail.profile')}</h2>
        {employee.email ? (
          <p className="text-start text-sm" dir="ltr">
            {employee.email}
          </p>
        ) : null}
        {employee.phone ? (
          <p className="text-start text-sm" dir="ltr">
            {employee.phone}
          </p>
        ) : null}
        {employee.notes ? (
          <p className="text-start text-sm text-[var(--pf-text-secondary)]">{employee.notes}</p>
        ) : null}
        {!employee.email && !employee.phone && !employee.notes ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{employee.jobTitle ?? employee.name}</p>
        ) : null}
      </Card>
      )}

      <EmployeeProjectsPanel
        employeeId={employee.id}
        projects={projectLinks}
        history={history}
        candidateProjects={candidateProjects}
        canLogTime={allowLog}
        canManage={allowManage}
        defaultStartDate={today}
      />

      {canReadAttendance && (
        <section className="flex flex-col gap-3" id="period-summary">
          <div>
            <h2 className="text-base font-semibold">
              {t('employees.detail.periodSummarySection')}
            </h2>
          </div>
          <form method="get" className="flex flex-col gap-2">
            <DateRangeSelector
              today={today}
              defaultFrom={summaryFrom}
              defaultTo={summaryTo}
              fromName="summaryFrom"
              toName="summaryTo"
              weekStartDay={workWeekStartDay}
            />
            <button
              type="submit"
              className="self-start h-9 rounded-md border border-[var(--pf-border-strong)] px-4 text-sm font-medium"
            >
              {t('employees.periodSummary.selectRange')}
            </button>
          </form>
          <EmployeePeriodSummaryPanel
            employeeId={employee.id}
            fromDate={summaryFrom}
            toDate={summaryTo}
          />
        </section>
      )}

      {(allowLog || canReadTimesheets || canReadAttendance) && (
        <Card className="flex flex-col gap-3 p-4 sm:p-6">
          <h2 className="text-base font-semibold">{t('employees.detail.timeAttendanceSection')}</h2>
          <div className="flex flex-wrap gap-2">
            {allowLog ? (
              <Button asChild variant="secondary" className="self-start">
                <Link href={`/workforce/time?employeeId=${employee.id}`}>
                  {t('employees.detail.hoursLink')}
                </Link>
              </Button>
            ) : null}
            {canReadTimesheets ? (
              <Button asChild variant="secondary" className="self-start">
                <Link href={`/workforce/timesheets?employeeId=${employee.id}`}>
                  {t('employees.detail.timesheetsLink')}
                </Link>
              </Button>
            ) : null}
            {canReadAttendance ? (
              <Button asChild variant="secondary" className="self-start">
                <Link href={`/workforce/attendance?employeeId=${employee.id}`}>
                  {t('employees.detail.attendanceLink')}
                </Link>
              </Button>
            ) : null}
          </div>
        </Card>
      )}

      <EntityCustomFieldsPanel
        entityId={employee.id}
        fields={customFields}
        revalidatePath={`/workforce/employees/${employee.id}`}
        saveAction={upsertEntityFieldValueAction}
      />

      {canReadCompliance ? (
        <Card className="flex flex-col gap-3 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">{t('employees.detail.complianceSection')}</h2>
            <Link
              href={`/compliance?subjectType=employee&subjectId=${employee.id}`}
              className={cn(textNavLinkClassName, 'text-sm')}
            >
              {t('employees.detail.complianceOpen')}
            </Link>
          </div>
          {complianceArtifacts.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">
              {t('employees.detail.complianceEmpty')}
            </p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {complianceArtifacts.slice(0, 8).map((artifact) => (
                <li key={artifact.id} className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/compliance/${artifact.id}`}
                    className={cn(textNavLinkClassName, 'rounded-sm')}
                  >
                    {artifact.name}
                  </Link>
                  <span className="text-[var(--pf-text-secondary)]">
                    {tComplianceStatus.has(artifact.status)
                      ? tComplianceStatus(artifact.status)
                      : localizeCode(locale, artifact.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
      </MainAppSection>

      {showCompensationSection ? (
      <MainAppSection title={t('employees.detail.compensationSummaryTitle')}>
      {canReadRates && compensationSummary ? (
        <EmployeeCompensationSummaryPanel
          summary={compensationSummary}
          locale={locale}
          employeeId={employee.id}
          employeeName={employee.name}
          status={employee.status}
          archivedAt={employee.archivedAt}
          hireDate={employee.hireDate}
          endDate={employee.endDate}
          canManage={allowManage}
          canManageCosts={canManageCosts}
          canLogTime={allowLog}
          canReadAttendance={canReadAttendance}
          canManageAttendance={canManageAttendance}
        />
      ) : null}

      {canReadRates ? (
        <EmployeeSalarySections
          showSalaryUpdate={canManageCosts}
          rateHistorySummary={rateHistorySummary}
          salaryUpdate={
            canManageCosts ? (
              <AddRateVersionForm
                employeeId={employee.id}
                defaultCurrency={currency}
                defaultValidFrom={
                  currentRate ? businessDate(currentRate.validFrom) : today
                }
                defaultRateUnit={currentRate?.rateUnit ?? 'monthly'}
                defaultBaseRate={currentRate?.baseRate ?? ''}
                defaultBurdenPercent={currentRate?.burdenPercent ?? ''}
                defaultWorkingDaysPerMonth={
                  currentRate?.workingDaysPerMonth ??
                  laborDefaults?.workingDaysPerMonth ??
                  null
                }
              />
            ) : null
          }
          rateHistory={<RateHistoryTable versions={rateHistory} />}
        />
      ) : null}

      {payrollPayment ? (
        <>
          {showMonthReview ? (
            <div id="employee-labor-allocation" className="scroll-mt-24">
              <MonthlyEmployerCostReview
                key={`${employee.id}:${payrollPayment.yearMonth}`}
                employeeId={employee.id}
                employeeName={employee.name}
                currency={currency}
                defaultYearMonth={payrollPayment.yearMonth}
                projects={candidateProjects.map((project) => ({
                  id: project.id,
                  name: project.name,
                }))}
                canReview={canReadRates}
                canManage={canManageCosts}
                isOwner={data.isOwner}
                initialReview={monthReview}
                payrollApprovalMode
              />
            </div>
          ) : null}
          <EmployeePayrollMonthPanel
            employeeId={employee.id}
            employeeName={employee.name}
            yearMonth={payrollPayment.yearMonth}
            paymentId={payrollPayment.id}
            expectedAmount={payrollPayment.expectedAmount}
            paidAmount={payrollPayment.paidAmount}
            currency={payrollPayment.currency}
            dueDate={payrollPayment.dueDate}
            paymentStatus={payrollPayment.paymentStatus}
            paidAt={payrollPayment.paidAt}
            locale={locale}
            canManage={canManageCosts}
            isOwner={data.isOwner}
            defaultPaymentDate={today}
          />
        </>
      ) : null}

      {showMonthReview && !payrollPayment ? (
        <details
          id="employee-labor-allocation"
          className="scroll-mt-24 rounded-lg border border-[var(--pf-border-default)] p-4 sm:p-6"
        >
          <summary className="cursor-pointer text-sm font-medium text-[var(--pf-text-secondary)]">
            {t('monthReview.advancedSummary')}
          </summary>
          <div className="mt-4">
            <MonthlyEmployerCostReview
              key={`${employee.id}:${defaultYearMonth}`}
              employeeId={employee.id}
              employeeName={employee.name}
              currency={currency}
              defaultYearMonth={defaultYearMonth}
              projects={candidateProjects.map((project) => ({
                id: project.id,
                name: project.name,
              }))}
              canReview={canReadRates}
              canManage={canManageCosts}
              isOwner={data.isOwner}
              initialReview={monthReview}
            />
          </div>
        </details>
      ) : !payrollPayment && canReadRates ? (
        <p className="text-sm text-[var(--pf-text-muted)]">{t('monthReview.unusedHint')}</p>
      ) : null}

      {orgFrameworkConfigured && (allowManage || canManageCosts) ? (
        <OrgWorkFrameworkForm
          standardHoursPerDay={laborDefaults?.standardHoursPerDay ?? null}
          workingDaysPerMonth={laborDefaults?.workingDaysPerMonth ?? null}
          standardWorkStartTime={laborDefaults?.standardWorkStartTime ?? null}
          standardWorkEndTime={laborDefaults?.standardWorkEndTime ?? null}
          workWeekdays={laborDefaults?.workWeekdays ?? null}
          attendanceProjectTimeApproval={
            laborDefaults?.attendanceProjectTimeApproval ?? 'draft'
          }
          setupRequired={false}
          canBootstrapCosting={false}
          collapseWhenConfigured
        />
      ) : null}
      </MainAppSection>
      ) : null}

      {documentsPanel ? (
        <MainAppSection title={tDocuments('title')}>
          <EmployeeDocumentAttachmentsSection
            panelTitle={tDocuments('title')}
            ownerType="employee"
            ownerId={employee.id}
            documents={documentsPanel.documents}
            linkCandidates={documentsPanel.linkCandidates}
            canRead={documentsPanel.canRead}
            canManage={documentsPanel.canManage}
            storageConfigured={documentsPanel.storageConfigured}
            canClassifyCompensation={documentsPanel.canClassifyCompensation}
          />
        </MainAppSection>
      ) : null}
      </MainAppPage>
    </EmployeeDetailUnsavedProvider>
  );
}
