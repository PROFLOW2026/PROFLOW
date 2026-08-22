import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { MoneyText } from '@/components/patterns/money-text';
import type { EmployeeCompensationSummary } from '@/modules/workforce/application/compensation-summary';
import { formatWorkHoursValue } from '@/modules/workforce/domain/format-work-hours';
import { formatBusinessDate } from '@/shared/dates/format';
import type { BusinessDate } from '@/shared/dates';
import { fromNumericString } from '@/shared/money';
import { Link } from '@/shared/i18n/navigation';

export interface EmployeeCompensationSummaryPanelProps {
  readonly summary: EmployeeCompensationSummary;
  readonly locale: string;
  readonly employeeId: string;
  readonly employeeName: string;
  readonly status: 'active' | 'inactive';
  readonly archivedAt: Date | null;
  readonly hireDate: string | null;
  readonly endDate: string | null;
  readonly canManage: boolean;
  readonly canManageCosts: boolean;
  readonly canLogTime: boolean;
  readonly canReadAttendance: boolean;
  readonly canManageAttendance?: boolean;
}

export async function EmployeeCompensationSummaryPanel({
  summary,
  locale,
  employeeId,
  employeeName,
  status,
  archivedAt,
  hireDate,
  endDate,
  canManage,
  canManageCosts,
  canLogTime,
  canReadAttendance,
  canManageAttendance = false,
}: EmployeeCompensationSummaryPanelProps) {
  const t = await getTranslations('workforce');

  const moneyValue =
    summary.baseRate && summary.currency
      ? fromNumericString(summary.baseRate, summary.currency) ?? {
          amount: summary.baseRate,
          currency: summary.currency,
        }
      : null;

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-6" data-pf-employee-compensation-summary>
      <div className="text-start">
        <h2 className="text-base font-semibold">{t('employees.detail.compensationSummaryTitle')}</h2>
        <p className="text-sm text-[var(--pf-text-secondary)]">
          {t('employees.detail.compensationSummaryHint')}
        </p>
      </div>

      {!hireDate ? (
        <p className="rounded-md border border-[var(--pf-status-warning-border)] bg-[var(--pf-status-warning-bg)] px-3 py-2 text-sm text-[var(--pf-status-warning-fg)]">
          {t('employees.detail.hireDateMissing')}
        </p>
      ) : null}

      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-[var(--pf-text-muted)]">{t('employees.columns.name')}</dt>
          <dd className="text-sm font-medium">{employeeName}</dd>
        </div>

        <div>
          <dt className="text-xs text-[var(--pf-text-muted)]">{t('employees.columns.status')}</dt>
          <dd>
            <StatusBadge
              shape={status === 'active' && !archivedAt ? 'active' : 'archived'}
              label={
                archivedAt
                  ? t('employees.detail.archivedBadge')
                  : t(`employeeStatus.${status}`)
              }
            />
          </dd>
        </div>

        <div>
          <dt className="text-xs text-[var(--pf-text-muted)]">{t('employees.form.hireDate')}</dt>
          <dd className="text-sm font-medium" dir="ltr">
            {hireDate
              ? formatBusinessDate(hireDate as BusinessDate, locale, 'medium')
              : t('employees.detail.hireDateNotSet')}
          </dd>
        </div>

        {endDate ? (
          <div>
            <dt className="text-xs text-[var(--pf-text-muted)]">{t('employees.form.endDate')}</dt>
            <dd className="text-sm font-medium" dir="ltr">
              {formatBusinessDate(endDate as BusinessDate, locale, 'medium')}
            </dd>
          </div>
        ) : null}

        <div>
          <dt className="text-xs text-[var(--pf-text-muted)]">
            {summary.rateUnit === 'monthly'
              ? t('employees.detail.monthlyBaseSalaryLabel')
              : summary.rateUnit === 'daily'
                ? t('employees.detail.dailyRateLabel')
                : t('employees.detail.currentSalaryLabel')}
          </dt>
          <dd className="text-lg font-semibold">
            {moneyValue ? (
              <>
                <MoneyText value={moneyValue} />
                {summary.rateUnit ? (
                  <span className="ms-2 text-sm font-normal text-[var(--pf-text-secondary)]">
                    {t(`rateUnits.${summary.rateUnit}`)}
                  </span>
                ) : null}
              </>
            ) : (
              <span className="text-sm font-normal text-[var(--pf-text-secondary)]">
                {t('employees.noRate')}
              </span>
            )}
          </dd>
        </div>

        {summary.employerCostPool && summary.currency ? (
          <div>
            <dt className="text-xs text-[var(--pf-text-muted)]">
              {summary.rateUnit === 'monthly'
                ? t('employees.detail.monthlyEmployerCostLabel')
                : summary.rateUnit === 'daily'
                  ? t('employees.detail.dailyEmployerCostLabel')
                  : t('employees.detail.hourlyEmployerCostLabel')}
            </dt>
            <dd className="text-sm font-medium">
              <MoneyText
                value={
                  fromNumericString(summary.employerCostPool, summary.currency) ?? {
                    amount: summary.employerCostPool,
                    currency: summary.currency,
                  }
                }
              />
              {summary.burdenPercent && Number(summary.burdenPercent) > 0 ? (
                <span className="ms-2 text-xs text-[var(--pf-text-secondary)]">
                  {t('employees.detail.burdenPercentLabel', { percent: summary.burdenPercent })}
                </span>
              ) : null}
            </dd>
          </div>
        ) : null}

        {summary.validFrom ? (
          <div>
            <dt className="text-xs text-[var(--pf-text-muted)]">
              {t('employees.detail.salaryEffectiveLabel')}
            </dt>
            <dd className="text-sm font-medium" dir="ltr">
              {formatBusinessDate(summary.validFrom, locale, 'medium')}
              {summary.validTo ? (
                <>
                  {' — '}
                  {formatBusinessDate(summary.validTo, locale, 'medium')}
                </>
              ) : (
                <span className="text-[var(--pf-text-secondary)]">
                  {' '}
                  ({t('employees.detail.openEnded')})
                </span>
              )}
            </dd>
          </div>
        ) : null}

        <div>
          <dt className="text-xs text-[var(--pf-text-muted)]">{t('employees.detail.dailyCapacity')}</dt>
          <dd className="text-sm font-medium">
            {summary.standardHoursPerDay
              ? summary.dailyHoursSource === 'employee'
                ? t('employees.detail.dailyCapacityEmployeeOverride', {
                    hours: formatWorkHoursValue(summary.standardHoursPerDay),
                  })
                : t('employees.detail.dailyCapacityInherited', {
                    hours: formatWorkHoursValue(summary.standardHoursPerDay),
                  })
              : t('employees.detail.dailyCapacityMissing')}
          </dd>
        </div>

        {summary.standardHoursPerMonth ? (
          <div>
            <dt className="text-xs text-[var(--pf-text-muted)]">
              {t('employees.detail.monthlyStandardHoursLabel')}
            </dt>
            <dd className="text-sm font-medium" dir="ltr">
              {formatWorkHoursValue(summary.standardHoursPerMonth)}
            </dd>
          </div>
        ) : null}

        {summary.rateUnit === 'hourly' ? (
          <div className="sm:col-span-2">
            <dt className="text-xs text-[var(--pf-text-muted)]">
              {t('employees.detail.derivedHourlyCostLabel')}
            </dt>
            <dd className="text-sm font-medium">
              {summary.derivedHourlyCost && summary.currency ? (
                <MoneyText
                  value={
                    fromNumericString(summary.derivedHourlyCost, summary.currency) ?? {
                      amount: summary.derivedHourlyCost,
                      currency: summary.currency,
                    }
                  }
                />
              ) : (
                <span className="text-[var(--pf-text-secondary)]">
                  {t('employees.detail.derivedHourlyCostMissing')}
                </span>
              )}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="flex flex-wrap gap-2 border-t border-[var(--pf-border-default)] pt-3">
        {canManage ? (
          <Button asChild variant="secondary" size="sm">
            <a href="#employee-edit">{t('employees.detail.actionEdit')}</a>
          </Button>
        ) : null}
        {canManageCosts ? (
          <Button asChild variant="secondary" size="sm">
            <a href="#salary-update">{t('employees.detail.actionUpdateSalary')}</a>
          </Button>
        ) : null}
        {canManageAttendance ? (
          <Button asChild size="sm">
            <Link href={`/workforce/attendance?employeeId=${employeeId}&update=1`}>
              {t('employees.detail.actionUpdateAttendance')}
            </Link>
          </Button>
        ) : canReadAttendance ? (
          <Button asChild variant="secondary" size="sm">
            <Link href={`/workforce/attendance?employeeId=${employeeId}`}>
              {t('employees.detail.actionViewAttendance')}
            </Link>
          </Button>
        ) : null}
        {canLogTime ? (
          <Button asChild variant="secondary" size="sm">
            <Link href={`/workforce/time/new?employeeId=${employeeId}`}>
              {t('employees.detail.actionLogTime')}
            </Link>
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
