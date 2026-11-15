'use client';

import { createMainAppProjectCloudBrowserActions } from '@/modules/external-storage/client/project-cloud-file-browser-actions';
import { TakeoffShell } from '@/modules/electrical-takeoff/ui/takeoff-shell';
import {
  browseTakeoffCloudFolderAction,
  loadTakeoffCloudBrowserInitialAction,
} from '@/modules/electrical-takeoff/actions/cloud-browser-actions';

const cloudBrowserActions = createMainAppProjectCloudBrowserActions({
  loadInitial: loadTakeoffCloudBrowserInitialAction,
  browseFolder: browseTakeoffCloudFolderAction,
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