/** Primary cost routing modes (expense form destination selector). */
export type CostDestinationMode =
  | 'project_single'
  | 'project_multi'
  | 'auto_pool'
  | 'company_only';

export function isProjectIdInOptions(
  projectId: string,
  projectIds: readonly string[],
): boolean {
  const trimmed = projectId.trim();
  return trimmed !== '' && projectIds.includes(trimmed);
}

/** BH-02: restore remembered single-project selection when still allowed; never pick first project. */
export function resolveRestoredSingleProjectId(
  remembered: string,
  projectIds: readonly string[],
): string | null {
  if (!isProjectIdInOptions(remembered, projectIds)) return null;
  return remembered.trim();
}

/** BH-01: leaving single-project header association requires explicit user confirmation before mode change. */
export function shouldConfirmLeavingSingleProject(
  from: CostDestinationMode,
  to: CostDestinationMode,
  headerProjectId: string | null | undefined,
): boolean {
  if (from !== 'project_single' || to === 'project_single') return false;
  return Boolean(headerProjectId?.trim());
}
