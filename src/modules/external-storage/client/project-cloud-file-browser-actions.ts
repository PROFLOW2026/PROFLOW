'use client';

import type { ProjectCloudFileBrowserActions } from './project-cloud-file-picker-types';

/** Main app project-files server actions wired for ProjectCloudFilePicker. */
export function createMainAppProjectCloudBrowserActions(handlers: {
  loadInitial: ProjectCloudFileBrowserActions['loadInitial'];
  browseFolder: ProjectCloudFileBrowserActions['browseFolder'];
}): ProjectCloudFileBrowserActions {
  return handlers;
}

/** Employee app project-files server actions wired for ProjectCloudFilePicker. */
export function createEmployeeProjectCloudBrowserActions(handlers: {
  loadInitial: ProjectCloudFileBrowserActions['loadInitial'];
  browseFolder: ProjectCloudFileBrowserActions['browseFolder'];
}): ProjectCloudFileBrowserActions {
  return handlers;
}
