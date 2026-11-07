'use client';

import { useMemo } from 'react';
import {
  browseProjectFolderAction,
  loadProjectFileBrowserInitialAction,
} from '@/app/[locale]/(app)/projects/[projectId]/project-files-actions';
import {
  browseEmployeeProjectFolderAction,
  loadEmployeeProjectFileBrowserInitialAction,
} from '@/app/[locale]/employee/(shell)/projects/project-files-actions';
import {
  createEmployeeProjectCloudBrowserActions,
  createMainAppProjectCloudBrowserActions,
} from '@/modules/external-storage/client/project-cloud-file-browser-actions';
import { InfraWorkspace, type InfraWorkspaceProps } from './infra-workspace';

/** Main (owner / manager) app: internal viewer with the connected-storage browser wired in. */
export function InfraWorkspaceMain(props: Omit<InfraWorkspaceProps, 'viewer' | 'browserActions'>) {
  const browserActions = useMemo(
    () =>
      createMainAppProjectCloudBrowserActions({
        loadInitial: loadProjectFileBrowserInitialAction,
        browseFolder: browseProjectFolderAction,
      }),
    [],
  );
  return <InfraWorkspace {...props} viewer="internal" browserActions={browserActions} />;
}

/**
 * Employee app: the same internal workspace as the main app. The organization-storage picker is wired to
 * the employee browse actions (same server logic, filtered by the employee's project scope); whether it
 * is offered still comes from the project permission the server resolves, never from the app type.
 */
export function InfraWorkspaceEmployee(props: Omit<InfraWorkspaceProps, 'viewer' | 'browserActions'>) {
  const browserActions = useMemo(
    () =>
      createEmployeeProjectCloudBrowserActions({
        loadInitial: loadEmployeeProjectFileBrowserInitialAction,
        browseFolder: browseEmployeeProjectFolderAction,
      }),
    [],
  );
  return <InfraWorkspace {...props} viewer="internal" browserActions={browserActions} />;
}

/** Contractor portal: external viewer; every upload is stored in the owning organization's cloud. */
export function InfraWorkspaceContractor(props: Omit<InfraWorkspaceProps, 'viewer' | 'browserActions'>) {
  return <InfraWorkspace {...props} viewer="external" />;
}
