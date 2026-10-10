import 'server-only';

import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { getSupabaseUser } from '@/shared/supabase/server';
import { getShellContextForProject } from '@/shared/auth/session';
import type { ExternalContext, ExternalGrantView } from '@/shared/external';
import {
  holdsRequirement,
  type PortalCapabilityRequirement,
} from '@/modules/contractor-portal/domain/capability-requirement';
import { resolveConnectedContext, type ConnectedProjectContext } from './resolve-connected-context';

export interface ConnectedDeveloperSession extends ConnectedProjectContext {
  readonly externalContext: ExternalContext;
  readonly coveringGrant: ExternalGrantView;
}

/**
 * Contractor org project page that proxies developer tenant APIs.
 * Requires mapping + portal principal grant — never org membership on the developer org.
 */
export async function requireConnectedDeveloperSession(
  contractorProjectId: string,
  capability: PortalCapabilityRequirement,
): Promise<ConnectedDeveloperSession> {
  const shell = await getShellContextForProject(contractorProjectId);
  if (!shell) notFound();

  const user = await getSupabaseUser();
  if (!user) notFound();

  const connected = await resolveConnectedContext({
    contractorOrganizationId: shell.organizationId,
    contractorProjectId,
    authUserId: user.id,
    fallbackLocale: await getLocale(),
    sessionAuthenticatedAt: null,
  });
  if (!connected) notFound();
  if (!connected.externalContext || !connected.coveringGrant) notFound();
  if (!holdsRequirement(connected.capabilities, capability)) notFound();

  return {
    ...connected,
    externalContext: connected.externalContext,
    coveringGrant: connected.coveringGrant,
  };
}
