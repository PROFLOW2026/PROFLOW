import 'server-only';

import { getLocale } from 'next-intl/server';
import { cache } from 'react';
import { requireExternalContext } from '@/modules/contractor-access';
import { AuthenticationRequiredError, AuthorizationError } from '@/shared/errors';
import type { ExternalContext } from '@/shared/external';
import { redirect } from '@/shared/i18n/navigation';
import { loadPortalDirectoryRows } from '../data/directory.repository';
import { buildPortalPrimaryNav, buildPortalProjectNav, type PortalNavItem } from '../domain/nav';
import { findPortalProject, resolvePortalProjects, type PortalProjectAccess } from '../domain/project-access';
import { PORTAL_SIGN_IN_PATH, projectHomeHref } from '../domain/routes';
import { PORTAL_NOTIFICATION_SOURCE } from './registry';

export interface PortalSession {
  readonly context: ExternalContext;
  readonly projects: readonly PortalProjectAccess[];
}

/**
 * Per-request contractor session: ExternalContext + the projects its grants reach. Unauthenticated
 * (or disabled) principals are sent to the contractor sign-in - never to the org app sign-in, and
 * an OrgContext is never resolved here.
 */
export const loadPortalSession = cache(async (): Promise<PortalSession> => {
  let context: ExternalContext;
  try {
    context = await requireExternalContext();
  } catch (error) {
    if (error instanceof AuthenticationRequiredError || error instanceof AuthorizationError) {
      redirect({ href: PORTAL_SIGN_IN_PATH, locale: await getLocale() });
    }
    throw error;
  }
  const directory = await loadPortalDirectoryRows(context);
  return { context, projects: resolvePortalProjects(context.grants, directory) };
});

/** Project the principal may open, or null (callers map to notFound - no existence oracle). */
export async function loadPortalProject(projectId: string): Promise<{
  readonly session: PortalSession;
  readonly project: PortalProjectAccess | null;
}> {
  const session = await loadPortalSession();
  return { session, project: findPortalProject(session.projects, projectId) };
}

export interface PortalShellProject {
  readonly projectId: string;
  readonly organizationId: string;
  readonly organizationName: string | null;
  readonly projectName: string | null;
  readonly projectNumber: string | null;
  readonly vendorNames: readonly string[];
  readonly homeHref: string;
  readonly nav: readonly PortalNavItem[];
}

export interface PortalShellData {
  readonly principalName: string | null;
  readonly primaryNav: readonly PortalNavItem[];
  readonly projects: readonly PortalShellProject[];
  /** null when no external notification source is registered. */
  readonly unreadNotifications: number | null;
}

export async function loadPortalShellData(session: PortalSession): Promise<PortalShellData> {
  let unreadNotifications: number | null = null;
  if (PORTAL_NOTIFICATION_SOURCE) {
    try {
      unreadNotifications = await PORTAL_NOTIFICATION_SOURCE.unreadCount(session.context);
    } catch (error) {
      console.error('[contractor-portal] unread notification count failed', error);
    }
  }

  return {
    principalName: session.context.displayName,
    primaryNav: buildPortalPrimaryNav(),
    projects: session.projects.map((project) => ({
      projectId: project.projectId,
      organizationId: project.organizationId,
      organizationName: project.organizationName,
      projectName: project.projectName,
      projectNumber: project.projectNumber,
      vendorNames: project.vendors
        .map((vendor) => vendor.vendorName)
        .filter((name): name is string => Boolean(name)),
      homeHref: projectHomeHref(project.projectId),
      nav: buildPortalProjectNav(project.projectId, project.capabilities),
    })),
    unreadNotifications,
  };
}
