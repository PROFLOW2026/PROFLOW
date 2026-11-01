'use client';

import { useMemo } from 'react';
import {
  browseProjectFolderAction,
  loadProjectFileBrowserInitialAction,
} from '@/app/[locale]/(app)/projects/[projectId]/project-files-actions';
import { createMainAppProjectCloudBrowserActions } from '@/modules/external-storage/client/project-cloud-file-browser-actions';
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

/** Employee app: internal viewer, no direct cloud browsing (photos go to the organization's storage). */
export function InfraWorkspaceEmployee(props: Omit<InfraWorkspaceProps, 'viewer' | 'browserActions'>) {
  return <InfraWorkspace {...props} viewer="internal" />;
}

/** Contractor portal: external viewer; every upload is stored in the owning organization's cloud. */
export function InfraWorkspaceContractor(props: Omit<InfraWorkspaceProps, 'viewer' | 'browserActions'>) {
  return <InfraWorkspace {...props} viewer="external" />;
}
