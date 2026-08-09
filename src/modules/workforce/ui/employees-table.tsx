import { getTranslations } from 'next-intl/server';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MoneyText } from '@/components/patterns/money-text';
import type { EmployeeListItem } from '@/modules/workforce';
import { fromNumericString } from '@/shared/money';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { Link } from '@/shared/i18n/navigation';

interface EmployeesTableProps {
  readonly employees: readonly EmployeeListItem[];
  readonly canManage: boolean;
}

export async function EmployeesTable({ employees, canManage }: EmployeesTableProps) {
  const t = await getTranslations('workforce');

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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('employees.columns.name')}</TableHead>
              <TableHead>{t('employees.columns.employmentStyle')}</TableHead>
              <TableHead numeric>{t('employees.columns.currentRate')}</TableHead>
              <TableHead>{t('employees.columns.status')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((employee) => (
              <TableRow key={employee.id}>
                <TableCell>
                  <Link
                    href={`/workforce/employees/${employee.id}`}
                    className="rounded-sm font-medium text-[var(--pf-text-brand)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
                  >
                    {employee.name}
                  </Link>
                  {employee.jobTitle ? (
                    <p className="text-xs text-[var(--pf-text-muted)]">{employee.jobTitle}</p>
                  ) : null}
                </TableCell>
                <TableCell>
                  {employee.currentRateUnit
                    ? t(`rateUnits.${employee.currentRateUnit}`)
                    : t('employees.noRate')}
                </TableCell>
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
      }
      renderMobileCard={(employee) => (
        <Link
          href={`/workforce/employees/${employee.id}`}
          className="block min-h-11 rounded-lg border border-[var(--pf-border-default)] p-4 hover:bg-[var(--pf-bg-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{employee.name}</p>
              {employee.jobTitle ? (
                <p className="text-xs text-[var(--pf-text-muted)]">{employee.jobTitle}</p>
              ) : null}
            </div>
            <StatusBadge
              shape={employee.status === 'active' ? 'active' : 'archived'}
              label={t(`employeeStatus.${employee.status}`)}
            />
          </div>
          <p className="mt-2 text-sm text-[var(--pf-text-secondary)]">
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

export function canViewWorkforceCosts(context: OrgContext): boolean {
  return (
    hasPermission(context, PERMISSIONS.WORKFORCE_READ) ||
    hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ)
  );
}
