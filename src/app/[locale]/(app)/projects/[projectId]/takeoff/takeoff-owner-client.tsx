'use client';

import { createMainAppProjectCloudBrowserActions } from '@/modules/external-storage/client/project-cloud-file-browser-actions';
import { TakeoffShell } from '@/modules/electrical-takeoff/ui/takeoff-shell';
import {
  browseProjectFolderAction,
  loadProjectFileBrowserInitialAction,
} from '../project-files-actions';

const cloudBrowserActions = createMainAppProjectCloudBrowserActions({
  loadInitial: loadProjectFileBrowserInitialAction,
  browseFolder: browseProjectFolderAction,
});

export function TakeoffOwnerClient({
  projectId,
  analysisId,
}: {
  projectId: string;
  analysisId?: string;
}) {
  return (
    <TakeoffShell
      projectId={projectId}
      analysisId={analysisId}
      surface="main"
      cloudBrowserActions={cloudBrowserActions}
    />
  );
}