import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { MoneyText } from '@/components/patterns/money-text';
import { listComplianceArtifactsForOrg } from '@/modules/compliance';
import { listCustomFieldValuesForEntity } from '@/modules/custom-fields';
import { EntityCustomFieldsPanel } from '@/modules/custom-fields/ui';
import { getEntityDocumentPanelData } from '@/modules/documents';
import { DocumentAttachments } from '@/modules/documents/ui';
import { resolveEmployeeDailyFramework } from '@/modules/workforce/application/work-calendar-context';
import {
  getEmployee,
  listAssignableProjects,
  listEmployeeAssignmentHistoryLinks,
  listEmployeeProjectLinks,
  listLinkableOrgMembers,
  listRateHistory,
  resolveRateVersionForDate,
} from '@/modules/workforce';
import {
  canLogTime,
  canManageWorkforce,
} from '@/modules/workforce/ui/employees-table';
import { canManageWorkforceCost, canReadWorkforceCost } from '@/modules/workforce/application/workforce-cost-authz';
import { EmployeeProjectsPanel } from '@/modules/workforce/ui/employee-projects-panel';
import { EmployeeEditPanel } from '@/modules/workforce/ui/employee-edit-panel';
import { MonthlyEmployerCostReview } from '@/modules/workforce/ui/monthly-employer-cost-review';
import { AddRateVersionForm } from '@/modules/workforce/ui/add-rate-version-form';
import { RateHistoryTable } from '@/modules/workforce/ui/rate-history-table';
import { withOrgContext } from '@/shared/auth/session';
import { businessDate, todayInTimeZone } from '@/shared/dates';
import { fromNumericString } from '@/shared/money';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import { upsertEntityFieldValueAction } from '../../../settings/custom-fields/actions';

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
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const { employeeId } = await params;
  const t = await getTranslations('workforce');

  const data = await withOrgContext(async (context) => {
    try {
      const employee = await getEmployee(context, employeeId);
      const dailyFramework = await resolveEmployeeDailyFramework(
        context.db,
        context.organizationId,
        employeeId,
      );
      const allowManage = canManageWorkforce(context);
      const canReadRates = canReadWorkforceCost(context);
      const canManageCosts = canManageWorkforceCost(context);
      const canReadCompliance = hasPermission(context, PERMISSIONS.COMPLIANCE_READ);
      const canReadAttendance =
        hasPermission(context, PERMISSIONS.ATTENDANCE_READ) ||
        hasPermission(context, PERMISSIONS.ATTENDANCE_MANAGE) ||
        hasPermission(context, PERMISSIONS.ATTENDANCE_SELF);
      const canReadTimesheets =
        hasPermission(context, PERMISSIONS.TIME_MANAGE) ||
        hasPermission(context, PERMISSIONS.TIME_APPROVE);
      const [
        rateHistory,
        documentsPanel,
        customFields,
        projectLinks,
        history,
        candidateProjects,
        linkableUsers,
        complianceArtifacts,
      ] = await Promise.all([
        canReadRates ? listRateHistory(context, employeeId) : Promise.resolve([]),
        getEntityDocumentPanelData(context, 'employee', employeeId),
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
      ]);
      const today = todayInTimeZone(context.organization.timezone);
      const currentRate = resolveRateVersionForDate(employee.rateVersions, businessDate(today));
      return {
        employee,
        dailyFramework,
        rateHistory,
        currentRate,
        today,
        documentsPanel,
        customFields,
        projectLinks,
        history,
        candidateProjects,
        linkableUsers,
        complianceArtifacts,
        canReadRates,
        canManageCosts,
        canReadCompliance,
        canReadAttendance,
        canReadTimesheets,
        allowLog: canLogTime(context),
        allowManage,
        currency: context.organization.baseCurrency,
        defaultYearMonth: today.slice(0, 7),
      };
    } catch {
      return null;
    }
  });

  if (!data) notFound();

  const {
    employee,
    dailyFramework,
    rateHistory,
    currentRate,
    documentsPanel,
    customFields,
    projectLinks,
    history,
    candidateProjects,
    linkableUsers,
    complianceArtifacts,
    canReadRates,
    canManageCosts,
    canReadCompliance,
    canReadAttendance,
    canReadTimesheets,
    allowLog,
    allowManage,
    currency,
    defaultYearMonth,
    today,
  } = data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={employee.name}
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
      />

      {allowManage ? <EmployeeEditPanel employee={employee} linkableUsers={linkableUsers} /> : (
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

      {canReadRates ? (
        <details className="rounded-lg border border-[var(--pf-border-default)] p-4 sm:p-6">
          <summary className="cursor-pointer text-base font-semibold">
            {t('employees.detail.compensationSection')}
          </summary>
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1 text-sm">
              <h3 className="font-medium">{t('employees.detail.dailyCapacity')}</h3>
              <p>
                {employee.standardHoursPerDay
                  ? t('employees.detail.dailyCapacityOverride', {
                      hours: employee.standardHoursPerDay,
                    })
                  : dailyFramework.configured
                    ? t('employees.detail.dailyCapacityInherited', {
                        hours: dailyFramework.standardHoursPerDay,
                      })
                    : t('employees.detail.dailyCapacityMissing')}
              </p>
              <p className="text-[var(--pf-text-secondary)]">
                {t('employees.detail.dailyCapacityHint')}
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-medium">{t('employees.detail.currentRate')}</h3>
              {currentRate ? (
                <div className="flex flex-col gap-1 text-sm">
                  <p>
                    <MoneyText
                      value={fromNumericString(currentRate.baseRate, currentRate.currency) ?? {
                        amount: currentRate.baseRate,
                        currency: currentRate.currency,
                      }}
                    />
                    {' · '}
                    {t(`rateUnits.${currentRate.rateUnit}`)}
                  </p>
                  {currentRate.burdenPercent ? (
                    <p className="text-[var(--pf-text-secondary)]">
                      {t('employees.detail.burden', { percent: currentRate.burdenPercent })}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-[var(--pf-text-secondary)]">{t('employees.noRate')}</p>
              )}
            </div>
            {canManageCosts ? (
              <AddRateVersionForm
                employeeId={employee.id}
                defaultCurrency={currency}
                defaultValidFrom={today}
                defaultRateUnit={currentRate?.rateUnit ?? 'hourly'}
              />
            ) : null}
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-medium">{t('employees.detail.rateHistory')}</h3>
              <RateHistoryTable versions={rateHistory} />
            </div>
          </div>
        </details>
      ) : null}

      {canReadRates ? (
        <MonthlyEmployerCostReview
          employeeId={employee.id}
          employeeName={employee.name}
          currency={currency}
          defaultYearMonth={defaultYearMonth}
          canReview={canReadRates}
          canManage={canManageCosts}
        />
      ) : null}

      <EmployeeProjectsPanel
        employeeId={employee.id}
        projects={projectLinks}
        history={history}
        candidateProjects={candidateProjects}
        canLogTime={allowLog}
        canManage={allowManage}
        defaultStartDate={today}
      />

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

      <DocumentAttachments
        ownerType="employee"
        ownerId={employee.id}
        documents={documentsPanel.documents}
        linkCandidates={documentsPanel.linkCandidates}
        canRead={documentsPanel.canRead}
        canManage={documentsPanel.canManage}
        storageConfigured={documentsPanel.storageConfigured}
        canClassifyCompensation={documentsPanel.canClassifyCompensation}
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
                  <span className="text-[var(--pf-text-secondary)]">{artifact.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </div>
  );
}
