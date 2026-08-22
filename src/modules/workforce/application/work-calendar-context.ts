import {
  getOrganizationSettingValue,
  LABOR_COST_DEFAULTS_SETTING_KEY,
  parseLaborCostDefaults,
} from '@/modules/tenancy';
import type { DbExecutor } from '@/shared/db/types';
import { findEmployeeById } from '../data/employees.repository';
import {
  parseExplicitWorkCalendarFromLaborDefaults,
  resolveDailyFrameworkHours,
  resolveWorkCalendarRatesForCosting,
  type DailyFrameworkResult,
  type ExplicitWorkCalendarSettings,
  type WorkCalendarCostingResult,
} from '../domain/work-calendar';

export async function loadOrgExplicitWorkCalendar(
  db: DbExecutor,
  organizationId: string,
): Promise<ExplicitWorkCalendarSettings> {
  const raw = await getOrganizationSettingValue<unknown>(
    db,
    organizationId,
    LABOR_COST_DEFAULTS_SETTING_KEY,
  );
  return parseExplicitWorkCalendarFromLaborDefaults(parseLaborCostDefaults(raw));
}

export async function resolveEmployeeWorkCalendarForCosting(
  db: DbExecutor,
  organizationId: string,
  employeeId: string,
): Promise<WorkCalendarCostingResult> {
  const [org, employee] = await Promise.all([
    loadOrgExplicitWorkCalendar(db, organizationId),
    findEmployeeById(db, organizationId, employeeId),
  ]);
  return resolveWorkCalendarRatesForCosting({
    employeeStandardHoursPerDay: employee?.standardHoursPerDay ?? null,
    org,
  });
}

export async function resolveEmployeeDailyFramework(
  db: DbExecutor,
  organizationId: string,
  employeeId: string,
): Promise<DailyFrameworkResult> {
  const [org, employee] = await Promise.all([
    loadOrgExplicitWorkCalendar(db, organizationId),
    findEmployeeById(db, organizationId, employeeId),
  ]);
  return resolveDailyFrameworkHours({
    employeeStandardHoursPerDay: employee?.standardHoursPerDay ?? null,
    orgStandardHoursPerDay: org.standardHoursPerDay,
  });
}
