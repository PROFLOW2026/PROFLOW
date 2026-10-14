import { isDeveloperGcMode } from '@/modules/project-profile/domain/management-mode';
import type { DeliveryProfile } from '@/modules/project-profile/domain/profile';
export type DailyLogTargetKind = 'site_log' | 'field_ops';

export interface DailyLogTargetInput {
  readonly deliveryProfile: Pick<DeliveryProfile, 'operatingRoles'> | null | undefined;
  readonly modules: { readonly field_ops?: boolean };
  readonly projectId: string;
}

export function resolveDailyLogTargetKind(
  input: DailyLogTargetInput,
): DailyLogTargetKind | null {
  if (isDeveloperGcMode(input.deliveryProfile)) {
    return 'site_log';
  }
  if (input.modules.field_ops) {
    return 'field_ops';
  }
  return null;
}

export function resolveDailyLogHref(input: DailyLogTargetInput): string | null {
  const kind = resolveDailyLogTargetKind(input);
  if (kind === 'site_log') {
    return `/projects/${input.projectId}/site-log`;
  }
  if (kind === 'field_ops') {
    return `/field-ops/logs/new?projectId=${input.projectId}`;
  }
  return null;
}
