/**
 * Shared permission domain types.
 *
 * `AuthorizeResource` and `DocumentAccessInput` were originally defined inside
 * @/modules/employee-app/ but are referenced by the shared `authorize` gate,
 * which must never depend on a feature module. Placing them here breaks the
 * illegal shared → feature-module import cycle while keeping the types in one
 * canonical location.
 *
 * The employee-app module re-exports these for its own internal use so that
 * callers within that module don't need to change their import paths.
 */

/** Describes the resource being authorized inside an `AuthorizeRequest`. */
export interface AuthorizeResource {
  readonly type: 'project' | 'employee' | 'document';
  readonly id: string;
  readonly documentCategory?: string | null;
}

/**
 * Input shape for document-access guards.
 * Kept here so the shared `authorize` function can reference it without
 * importing from the employee-app feature module.
 */
export interface DocumentAccessInput {
  readonly documentId: string;
  readonly category: string | null;
  readonly privacyClass?: 'standard' | 'compensation';
  readonly projectIds?: readonly string[];
}
