import type { InfraPermissions } from './types';

/**
 * ONE capability model for all three surfaces (owner app, employee app, contractor portal).
 *
 * The surface never decides on its own: every flag below is derived from a real permission that the
 * server already resolved - the project capabilities for internal accounts (owner, office, employee) and
 * the vendor grants for contractors. An employee or a contractor holding the same permission therefore
 * gets exactly the same capability as an owner. There is no "reduced" employee or contractor build.
 *
 * Pure on purpose: no I/O, trivially unit-testable.
 */
export interface InfraPermissionFacts {
  /** The account is a contractor (external grants) rather than an internal account. */
  readonly external: boolean;
  /** May document here: internal accounts through the project capability, contractors through `ext.document.upload`. */
  readonly canDocument: boolean;
  /** Holds `documents.share` / `project.manage` on the project (edit anybody's captures). */
  readonly canManageCaptures: boolean;
  /** Holds `project.manage` (internal accounts only: locations are an organization-side structure). */
  readonly canManageLocations: boolean;
  /** Holds the project `documents.view` capability. */
  readonly hasDocumentsView: boolean;
  /** The employee file-access gate (documents.read + an openable folder). Always true for non-employee accounts. */
  readonly storageGateOpen: boolean;
  /** The account is an employee-app account (it has no personal provider login). */
  readonly employeeApp: boolean;
  /** Project-level defects.manage (internal capability or contractor grant). */
  readonly canManageDefects: boolean;
}

export function resolveInfraPermissions(facts: InfraPermissionFacts): InfraPermissions {
  return {
    canDocument: facts.canDocument,
    canManageCaptures: facts.canManageCaptures,
    canManageLocations: facts.canManageLocations,
    // Browsing the organization storage goes through the system (never a provider token to the user) and is
    // filtered server-side by project scope and semantic folder. Granted by the documents.view capability to
    // owner AND employee alike. A contractor holds no read grant on raw project folders: its organization
    // photos come through the infrastructure gallery, which is scoped by grant, location and visibility.
    canBrowseStorage: !facts.external && facts.hasDocumentsView && facts.storageGateOpen,
    // Video follows the right to document, whoever the account is.
    canCaptureVideo: facts.canDocument,
    // Opening the file in the provider's own web UI needs a provider login. Only owner-side accounts have one;
    // everyone else views the original inside the system.
    canOpenInCloud: !facts.external && !facts.employeeApp && facts.hasDocumentsView,
    canCreateDefect: facts.canManageDefects,
  };
}
