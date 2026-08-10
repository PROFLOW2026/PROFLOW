import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { MoneyText } from '@/components/patterns/money-text';
import { listCustomFieldValuesForEntity } from '@/modules/custom-fields';
import { EntityCustomFieldsPanel } from '@/modules/custom-fields/ui';
import { getEntityDocumentPanelData } from '@/modules/documents';
import { DocumentAttachments } from '@/modules/documents/ui';
import {
  getEmployee,
  listAssignableProjects,
  listEmployeeAssignmentHistoryLinks,
  listEmployeeProjectLinks,
  listRateHistory,
  resolveRateVersionForDate,
} from '@/modules/workforce';
import {
  canLogTime,
  canManageWorkforce,
} from '@/modules/workforce/ui/employees-table';
import { canManageWorkforceCost, canReadWorkforceCost } from '@/modules/workforce/application/workforce-cost-authz';
import { EmployeeProjectsPanel } from '@/modules/workforce/ui/employee-projects-panel';
import { MonthlyEmployerCostReview } from '@/modules/workforce/ui/monthly-employer-cost-review';
import { RateHistoryTable } from '@/modules/workforce/ui/rate-history-table';
import { withOrgContext } from '@/shared/auth/session';
import { businessDate, todayInTimeZone } from '@/shared/dates';
import { fromNumericString } from '@/shared/money';
import { Link } from '@/shared/i18n/navigation';
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
      const allowManage = canManageWorkforce(context);
      const canReadRates = canReadWorkforceCost(context);
      const canManageCosts = canManageWorkforceCost(context);
      const [
        rateHistory,
        documentsPanel,
        customFields,
        projectLinks,
        history,
        candidateProjects,
      ] = await Promise.all([
        canReadRates ? listRateHistory(context, employeeId) : Promise.resolve([]),
        getEntityDocumentPanelData(context, 'employee', employeeId),
        listCustomFieldValuesForEntity(context, 'employee', employeeId).catch(() => []),
        listEmployeeProjectLinks(context, employeeId),
        listEmployeeAssignmentHistoryLinks(context, employeeId).catch(() => []),
        allowManage ? listAssignableProjects(context).catch(() => []) : Promise.resolve([]),
      ]);
      const today = todayInTimeZone(context.organization.timezone);
      const currentRate = resolveRateVersionForDate(employee.rateVersions, businessDate(today));
      return {
        employee,
        rateHistory,
        currentRate,
        today,
        documentsPanel,
        customFields,
        projectLinks,
        history,
        candidateProjects,
        canReadRates,
        canManageCosts,
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
    rateHistory,
    currentRate,
    documentsPanel,
    customFields,
    projectLinks,
    history,
    candidateProjects,
    canReadRates,
    canManageCosts,
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
            shape={employee.status === 'active' ? 'active' : 'archived'}
            label={t(`employeeStatus.${employee.status}`)}
          />
        }
        description={employee.jobTitle ?? undefined}
      />

      <EmployeeProjectsPanel
        employeeId={employee.id}
        projects={projectLinks}
        history={history}
        candidateProjects={candidateProjects}
        canLogTime={allowLog}
        canManage={allowManage}
        defaultStartDate={today}
      />

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

      {allowLog ? (
        <Card className="flex flex-col gap-2 p-4 sm:p-6">
          <h2 className="text-base font-semibold">{t('employees.detail.hoursSection')}</h2>
          <Button asChild variant="secondary" className="self-start">
            <Link href={`/workforce/time?employeeId=${employee.id}`}>
              {t('employees.detail.hoursLink')}
            </Link>
          </Button>
        </Card>
      ) : null}

      <EntityCustomFieldsPanel
        entityId={employee.id}
        fields={customFields}
        revalidatePath={`/workforce/employees/${employee.id}`}
        saveAction={upsertEntityFieldValueAction}
      />

      {canReadRates ? (
        <details className="rounded-lg border border-[var(--pf-border-default)] p-4 sm:p-6">
          <summary className="cursor-pointer text-base font-semibold">
            {t('employees.detail.compensationAdvanced')}
          </summary>
          <div className="mt-4 flex flex-col gap-4">
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

      <DocumentAttachments
        ownerType="employee"
        ownerId={employee.id}
        documents={documentsPanel.documents}
        linkCandidates={documentsPanel.linkCandidates}
        canRead={documentsPanel.canRead}
        canManage={documentsPanel.canManage}
        storageConfigured={documentsPanel.storageConfigured}
      />
    </div>
  );
}
