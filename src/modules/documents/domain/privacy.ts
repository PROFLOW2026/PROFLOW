/**
 * Document privacy and project-scoped visibility (Wave E).
 *
 * Compensation files are employer-cost artifacts. Fail closed: hide them unless
 * `workforce.cost.read` is explicitly granted. RLS also ANDs that permission;
 * the application layer must not rely on RLS alone.
 */

export const DOCUMENT_PRIVACY_CLASSES = ['standard', 'compensation'] as const;
export type DocumentPrivacyClass = (typeof DOCUMENT_PRIVACY_CLASSES)[number];

/** Owner types whose `owner_id` is a `projects.id` (jobs share `project`). */
export const PROJECT_SCOPED_DOCUMENT_OWNER_TYPES = ['project', 'work_order'] as const;
export type ProjectScopedDocumentOwnerType = (typeof PROJECT_SCOPED_DOCUMENT_OWNER_TYPES)[number];

export function isDocumentPrivacyClass(value: string): value is DocumentPrivacyClass {
  return (DOCUMENT_PRIVACY_CLASSES as readonly string[]).includes(value);
}

export function isProjectScopedDocumentOwnerType(
  value: string,
): value is ProjectScopedDocumentOwnerType {
  return (PROJECT_SCOPED_DOCUMENT_OWNER_TYPES as readonly string[]).includes(value);
}

export function resolveDocumentPrivacyClass(
  value: string | null | undefined,
): DocumentPrivacyClass {
  return value === 'compensation' ? 'compensation' : 'standard';
}

/**
 * Compensation is hidden unless cost.read is true. Unknown/missing permission
 * must not reveal compensation files.
 */
export function canSeeDocumentPrivacyClass(
  privacyClass: string | null | undefined,
  canReadWorkforceCost: boolean,
): boolean {
  if (privacyClass !== 'compensation') return true;
  return canReadWorkforceCost === true;
}

/**
 * Project-linked documents follow `assertCanAccessProject`.
 * `accessibleProjectIds === null` means unrestricted (mode=all or access_all).
 * Documents with no project/work-order links stay visible.
 */
export function canSeeProjectLinkedDocument(
  projectOwnerIds: readonly string[],
  accessibleProjectIds: string[] | null,
): boolean {
  if (accessibleProjectIds === null) return true;
  if (projectOwnerIds.length === 0) return true;
  return projectOwnerIds.every((id) => accessibleProjectIds.includes(id));
}

/** Compensation may be set only when the immediate owner is an employee. */
export function resolveUploadPrivacyClass(input: {
  ownerType: string;
  requested?: string | null;
  canReadWorkforceCost: boolean;
}): DocumentPrivacyClass {
  if (input.ownerType !== 'employee') return 'standard';
  if (input.requested !== 'compensation') return 'standard';
  if (input.canReadWorkforceCost !== true) return 'standard';
  return 'compensation';
}
