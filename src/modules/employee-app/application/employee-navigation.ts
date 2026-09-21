import type { EmployeeNavItem } from './get-employee-shell';

/** Fixed mobile primary destinations — order matters; permission filtering is applied separately. */
export const EMPLOYEE_MOBILE_PRIMARY_HREFS = [
  '/employee',
  '/employee/time',
  '/employee/projects',
  '/employee/tasks',
] as const;

/**
 * Mobile bottom bar: up to four primary tabs from the fixed candidate list.
 * Only items the employee can access are included; missing slots are not back-filled
 * from secondary modules.
 */
export function selectEmployeeMobilePrimaryItems(
  items: readonly EmployeeNavItem[],
): EmployeeNavItem[] {
  const visible = items.filter((item) => item.visible);
  const visibleByHref = new Map(visible.map((item) => [item.href, item]));

  return EMPLOYEE_MOBILE_PRIMARY_HREFS.flatMap((href) => {
    const item = visibleByHref.get(href);
    return item ? [item] : [];
  }).slice(0, 4);
}

export function selectEmployeeMobileOverflowItems(
  items: readonly EmployeeNavItem[],
): EmployeeNavItem[] {
  const primary = selectEmployeeMobilePrimaryItems(items);
  const primaryHrefs = new Set(primary.map((item) => item.href));
  return items.filter((item) => item.visible && !primaryHrefs.has(item.href));
}

/** Mobile-only short label for attendance tab. */
export function employeeMobileNavLabelKey(item: EmployeeNavItem): string {
  if (item.href === '/employee/time') {
    return 'employeeApp.nav.attendance';
  }
  return item.labelKey;
}
