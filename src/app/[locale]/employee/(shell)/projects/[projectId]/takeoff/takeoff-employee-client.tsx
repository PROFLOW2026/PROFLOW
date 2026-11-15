'use client';

import { createEmployeeProjectCloudBrowserActions } from '@/modules/external-storage/client/project-cloud-file-browser-actions';
import { TakeoffShell } from '@/modules/electrical-takeoff/ui/takeoff-shell';
import {
  browseTakeoffCloudFolderAction,
  loadTakeoffCloudBrowserInitialAction,
} from '@/modules/electrical-takeoff/actions/cloud-browser-actions';

const cloudBrowserActions = createEmployeeProjectCloudBrowserActions({
  loadInitial: loadTakeoffCloudBrowserInitialAction,
  browseFolder: browseTakeoffCloudFolderAction,
});

export function TakeoffEmployeeClient({
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
      surface="employee"
      cloudBrowserActions={cloudBrowserActions}
    />
  );
}