'use client';

import { useMemo } from 'react';
import { TakeoffApiProvider } from './api-provider';
import { createProductionTakeoffApi } from './api-binding';
import { createMockTakeoffApi, type TakeoffMockFixture } from './mock-api';
import type { ProjectCloudFileBrowserActions } from '@/modules/external-storage/client/project-cloud-file-picker-types';
import { TakeoffAnalysesList } from './takeoff-analyses-list';
import { TakeoffWorkspace } from './takeoff-workspace';

export type TakeoffSurface = 'main' | 'employee' | 'contractor';

export interface TakeoffShellProps {
  projectId: string;
  analysisId?: string;
  surface: TakeoffSurface;
  /** Demo/dev: use in-memory API. Production pages pass `useProductionApi`. */
  useMockApi?: boolean;
  mockFixture?: TakeoffMockFixture;
  cloudBrowserActions?: ProjectCloudFileBrowserActions;
}

function routeBase(surface: TakeoffSurface, projectId: string): string {
  if (surface === 'employee') return `/employee/projects/${projectId}/takeoff`;
  if (surface === 'contractor') return `/contractor/projects/${projectId}/takeoff`;
  return `/projects/${projectId}/takeoff`;
}

function uploadBase(surface: TakeoffSurface): string {
  if (surface === 'contractor') return '/api/contractor/takeoff/upload';
  return '/api/takeoff/upload';
}

function sourceBase(surface: TakeoffSurface): string {
  if (surface === 'contractor') return '/api/contractor/takeoff/source';
  return '/api/takeoff/source';
}

export function TakeoffShell({
  projectId,
  analysisId,
  surface,
  useMockApi = false,
  mockFixture = 'default',
  cloudBrowserActions,
}: TakeoffShellProps) {
  const api = useMemo(
    () => (useMockApi ? createMockTakeoffApi(mockFixture) : createProductionTakeoffApi()),
    [mockFixture, useMockApi],
  );
  const basePath = routeBase(surface, projectId);
  const uploadApiBase = uploadBase(surface);

  return (
    <TakeoffApiProvider api={api}>
      <div className="flex w-full min-w-0 max-w-full flex-1 flex-col overflow-x-hidden lg:h-full lg:max-h-full lg:min-h-0 lg:overflow-hidden" dir="rtl">
        {analysisId ? (
          <TakeoffWorkspace
            analysisId={analysisId}
            projectId={projectId}
            listPath={basePath}
            sourceApiBase={sourceBase(surface)}
          />
        ) : (
          <TakeoffAnalysesList
            projectId={projectId}
            basePath={basePath}
            uploadApiBase={uploadApiBase}
            cloudBrowserActions={cloudBrowserActions}
          />
        )}
      </div>
    </TakeoffApiProvider>
  );
}