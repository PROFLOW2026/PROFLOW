/** Owner app project root (`/projects/{id}`). */
export function ownerProjectRoot(projectId: string): string {
  return `/projects/${projectId}`;
}

/** Employee app project root (`/employee/projects/{id}`). */
export function employeeProjectRoot(projectId: string): string {
  return `/employee/projects/${projectId}`;
}

/**
 * Accept only the two internal project shells. Any other value falls back to the
 * Owner root so a form field cannot redirect off-site.
 */
export function resolveProjectSurfaceRoot(projectId: string, surfaceRoot?: string | null): string {
  const employee = employeeProjectRoot(projectId);
  if (surfaceRoot === employee) return employee;
  return ownerProjectRoot(projectId);
}

/** List-route base (`/projects/{id}/claims` or the employee equivalent). */
export function resolveProjectRouteBase(
  projectId: string,
  segment: string,
  returnBase?: string | null,
): string {
  const employee = `${employeeProjectRoot(projectId)}/${segment}`;
  if (returnBase === employee) return employee;
  return `${ownerProjectRoot(projectId)}/${segment}`;
}
