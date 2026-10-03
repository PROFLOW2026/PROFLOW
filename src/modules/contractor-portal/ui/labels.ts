type Translate = (key: string, values?: Record<string, string | number>) => string;

export interface PortalProjectLabelSource {
  readonly projectId: string;
  readonly projectName: string | null;
  readonly projectNumber: string | null;
}

/** Project title; the directory may lack names (fallback to number / short id, never blank). */
export function portalProjectLabel(t: Translate, project: PortalProjectLabelSource): string {
  if (project.projectName) return project.projectName;
  return t('project.unnamed', { reference: project.projectNumber ?? project.projectId.slice(0, 8) });
}

export function portalOrganizationLabel(t: Translate, organizationName: string | null): string {
  return organizationName ?? t('shell.organizationFallback');
}
