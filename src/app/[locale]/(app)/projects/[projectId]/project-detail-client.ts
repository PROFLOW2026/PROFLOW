import type { CustomFieldValueView } from '@/modules/custom-fields/domain/types';
import type { ProjectDetail } from '@/modules/projects/application/get-project-detail';

function containsDateInstance(value: unknown): boolean {
  if (value instanceof Date) return true;
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsDateInstance);
  return Object.values(value).some(containsDateInstance);
}

/** Deep JSON clone — strips `Date` and other non-RSC props for client boundaries. */
function plainForClient<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * RSC-safe clone for client tab panels. Raw `Date` instances on project / contract /
 * WP rows break the flight boundary and surface as the generic workspace error page.
 */
export function projectDetailForClient(detail: ProjectDetail): ProjectDetail {
  return plainForClient(detail);
}

/** Custom field definitions/values load `Date` metadata — must not cross into client panels raw. */
export function customFieldValuesForClient(
  fields: readonly CustomFieldValueView[],
): CustomFieldValueView[] {
  return plainForClient([...fields]);
}

export function assertPlainForClientBoundary(value: unknown): void {
  if (containsDateInstance(value)) {
    throw new Error('Value contains Date instances and is not RSC-client safe');
  }
}
