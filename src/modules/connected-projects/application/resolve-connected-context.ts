import 'server-only';

import { loadExternalContext } from '@/modules/contractor-access';
import { getDb, isDatabaseConfigured } from '@/shared/db/client';
import type { ExternalContext, ExternalGrantView } from '@/shared/external';
import { findConnectedProjectMappingForContractorProject } from '../data/mapping.repository';
import {
  connectedDeveloperCapabilities,
  isConnectedMappingVisible,
  pickPrimaryCoveringGrant,
} from '../domain/grant-bridge';
import type { ConnectedDeveloperScope, ConnectedProjectMappingView } from '../domain/types';

/**
 * Resolved connection for a contractor org project opened in `(app)`.
 *
 * Developer data access flows ONLY through `external_access_grants` / `ExternalContext`.
 * Org RBAC on the contractor project never substitutes for `ext.*` capabilities.
 */
export interface ConnectedProjectContext {
  readonly contractorProjectId: string;
  readonly contractorOrganizationId: string;
  readonly mapping: ConnectedProjectMappingView;
  readonly developer: ConnectedDeveloperScope;
  /** Union of ext.* scopes from covering grants — identical semantics to guest portal. */
  readonly capabilities: ReadonlySet<string>;
  /** When the signed-in user also has an active contractor portal principal. */
  readonly externalContext: ExternalContext | null;
  readonly coveringGrant: ExternalGrantView | null;
}

export interface ResolveConnectedContextInput {
  readonly contractorOrganizationId: string;
  readonly contractorProjectId: string;
  readonly authUserId: string;
  readonly fallbackLocale: string;
  readonly sessionAuthenticatedAt?: Date | null;
}

export async function resolveConnectedContext(
  input: ResolveConnectedContextInput,
): Promise<ConnectedProjectContext | null> {
  if (!isDatabaseConfigured()) return null;
  const db = getDb();
  const mapping = await findConnectedProjectMappingForContractorProject(db, {
    contractorOrganizationId: input.contractorOrganizationId,
    contractorProjectId: input.contractorProjectId,
  });
  if (!mapping || !isConnectedMappingVisible(mapping.status)) return null;

  const externalLoad = await loadExternalContext(db, {
    authUserId: input.authUserId,
    sessionAuthenticatedAt: input.sessionAuthenticatedAt ?? null,
    fallbackLocale: input.fallbackLocale,
  });
  const externalContext = externalLoad.ok ? externalLoad.context : null;
  const grants = externalContext?.grants ?? [];
  const capabilities = connectedDeveloperCapabilities(grants, mapping);
  const coveringGrant = pickPrimaryCoveringGrant(grants, mapping);

  const developer: ConnectedDeveloperScope = {
    organizationId: mapping.developerOrganizationId,
    projectId: mapping.developerProjectId,
    subcontractAgreementId: mapping.subcontractAgreementId,
    vendorId: mapping.vendorId,
    organizationName: mapping.developerOrganizationName,
    projectName: mapping.developerProjectName,
  };

  return {
    contractorProjectId: input.contractorProjectId,
    contractorOrganizationId: input.contractorOrganizationId,
    mapping,
    developer,
    capabilities,
    externalContext,
    coveringGrant,
  };
}
