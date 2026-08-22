import { getTranslations } from 'next-intl/server';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { pressableCardLinkClassName, textNavLinkClassName } from '@/components/ui/pressable';
import { StatusBadge } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MoneyText } from '@/components/patterns/money-text';
import type { EmployeeListItem } from '@/modules/workforce';
import { fromNumericString } from '@/shared/money';
import { formatBusinessDate } from '@/shared/dates/format';
import { getLocale } from 'next-intl/server';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { canReadWorkforceCost } from '@/modules/workforce/application/workforce-cost-authz';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

interface EmployeesTableProps {
  readonly employees: readonly EmployeeListItem[];
  readonly canManage: boolean;
  readonly showCosts?: boolean;
}

export async function EmployeesTable({
  employees,
  canManage,
  showCosts = true,
}: EmployeesTableProps) {
  const [t, locale] = await Promise.all([
    getTranslations('workforce'),
    getLocale(),
  ]);

  if (employees.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title={t('employees.empty.title')}
        description={t('employees.empty.description')}
        action={
          canManage ? (
            <Button asChild>
              <Link href="/workforce/employees/new">{t('employees.empty.action')}</Link>
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <ResponsiveTable
      items={employees}
      getRowKey={(employee) => employee.id}
      desktop={
        <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('employees.columns.name')}</TableHead>
                <TableHead>{t('employees.columns.hireDate')}</TableHead>
                <TableHead>{t('employees.columns.employmentStyle')}</TableHead>
                {showCosts ? <TableHead numeric>{t('employees.columns.currentRate')}</TableHead> : null}
                <TableHead>{t('employees.columns.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell>
                    <Link
                      href={`/workforce/employees/${employee.id}`}
                      className={cn(textNavLinkClassName, 'rounded-sm font-medium')}
                    >
                      {employee.name}
                    </Link>
                    {employee.jobTitle ? (
                      <p className="text-xs text-[var(--pf-text-muted)]">{employee.jobTitle}</p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {employee.hireDate ? (
                      <span dir="ltr">
                        {formatBusinessDate(employee.hireDate as never, locale, 'medium')}
                      </span>
                    ) : (
                      <span className="text-[var(--pf-text-muted)]">
                        {t('employees.detail.hireDateNotSet')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {employee.currentRateUnit
                      ? t(`rateUnits.${employee.currentRateUnit}`)
                      : '—'}
                  </TableCell>
                  {showCosts ? (
                    <TableCell numeric>
                      {employee.currentRate && employee.currentRateCurrency ? (
                        <MoneyText
                          value={
                            fromNumericString(employee.currentRate, employee.currentRateCurrency) ?? {
                              amount: employee.currentRate,
                              currency: employee.currentRateCurrency,
                            }
                          }
                        />
                      ) : (
                        <span className="text-[var(--pf-text-muted)]">{t('employees.noRate')}</span>
                      )}
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <StatusBadge
                      shape={employee.status === 'active' ? 'active' : 'archived'}
                      label={t(`employeeStatus.${employee.status}`)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      }
      renderMobileCard={(employee) => (
        <Link
          href={`/workforce/employees/${employee.id}`}
          className={cn(pressableCardLinkClassName, 'hover:bg-[var(--pf-bg-subtle)]')}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 text-start">
              <p className="truncate font-medium">{employee.name}</p>
              {employee.jobTitle ? (
                <p className="truncate text-xs text-[var(--pf-text-muted)]">{employee.jobTitle}</p>
              ) : null}
              {employee.hireDate ? (
                <p className="mt-1 text-xs text-[var(--pf-text-muted)]" dir="ltr">
                  {formatBusinessDate(employee.hireDate as never, locale, 'medium')}
                </p>
              ) : null}
            </div>
            <StatusBadge
              className="shrink-0"
              shape={employee.status === 'active' ? 'active' : 'archived'}
              label={t(`employeeStatus.${employee.status}`)}
            />
          </div>
          {showCosts ? (
            <p className="mt-2 text-start text-sm text-[var(--pf-text-secondary)]">
              {employee.currentRate && employee.currentRateCurrency ? (
                <>
                  <MoneyText
                    value={
                      fromNumericString(employee.currentRate, employee.currentRateCurrency) ?? {
                        amount: employee.currentRate,
                        currency: employee.currentRateCurrency,
                      }
                    }
                  />
                  {' · '}
                  {employee.currentRateUnit ? t(`rateUnits.${employee.currentRateUnit}`) : null}
                </>
              ) : (
                t('employees.noRate')
              )}
            </p>
          ) : employee.jobTitle ? null : (
            <p className="mt-2 text-start text-sm text-[var(--pf-text-secondary)]">
              {employee.currentRateUnit ? t(`rateUnits.${employee.currentRateUnit}`) : null}
            </p>
          )}
        </Link>
      )}
    />
  );
}

export function canManageWorkforce(context: OrgContext): boolean {
  return hasPermission(context, PERMISSIONS.WORKFORCE_MANAGE);
}

export function canLogTime(context: OrgContext): boolean {
  return hasPermission(context, PERMISSIONS.TIME_MANAGE);
}

export function canApproveTime(context: OrgContext): boolean {
  return hasPermission(context, PERMISSIONS.TIME_APPROVE);
}

export function canViewWorkforceCosts(context: OrgContext): boolean {
  // List rate columns must match list redaction - never show empty "no rate" cells
  // when the user cannot read workforce cost (rates stay redacted).
  return canReadWorkforceCost(context);
}
