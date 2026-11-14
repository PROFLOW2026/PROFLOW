'use client';

import { createEmployeeProjectCloudBrowserActions } from '@/modules/external-storage/client/project-cloud-file-browser-actions';
import { TakeoffShell } from '@/modules/electrical-takeoff/ui/takeoff-shell';
import {
  browseEmployeeProjectFolderAction,
  loadEmployeeProjectFileBrowserInitialAction,
} from '../../project-files-actions';

const cloudBrowserActions = createEmployeeProjectCloudBrowserActions({
  loadInitial: loadEmployeeProjectFileBrowserInitialAction,
  browseFolder: browseEmployeeProjectFolderAction,
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