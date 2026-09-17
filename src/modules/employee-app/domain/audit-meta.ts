export type EmployeeAppAuditSource = 'owner_ui' | 'script';

export interface EmployeeAppAuditMeta {
  readonly source: EmployeeAppAuditSource;
  readonly scriptName?: string;
}

export function withEmployeeAppAuditMeta(
  detailJson: Record<string, unknown> | null | undefined,
  meta?: EmployeeAppAuditMeta,
): Record<string, unknown> | null {
  if (!meta) return detailJson ?? null;
  return {
    ...(detailJson ?? {}),
    source: meta.source,
    ...(meta.scriptName ? { scriptName: meta.scriptName } : {}),
  };
}
