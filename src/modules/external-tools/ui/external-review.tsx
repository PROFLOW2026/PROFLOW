'use client';

import { useMemo } from 'react';
import { TakeoffApiProvider } from '@/modules/electrical-takeoff/ui/api-provider';
import { TakeoffWorkspace } from '@/modules/electrical-takeoff/ui/takeoff-workspace';
import type { CadIndexedFile } from '@/modules/external-storage/ui/cad/pf-cad-v3/xref-resolver';
import { externalReviewApi } from './review-api';

export function ExternalReview({
  sessionId,
  hostBytes,
  hostLogicalId,
  indexedFiles,
  xrefChoices,
}: {
  sessionId: string;
  hostBytes: Uint8Array | null;
  hostLogicalId?: string;
  indexedFiles?: readonly CadIndexedFile[];
  xrefChoices?: readonly { parentLogicalId: string; blockName: string; savedPath: string; logicalId: string }[];
}) {
  const api = useMemo(() => externalReviewApi(sessionId), [sessionId]);
  const externalPlan = useMemo(
    () =>
      hostBytes
        ? {
            wasmBaseUrl: '/pf-cad/external/wasm',
            hostBytes,
            hostLogicalId,
            indexedFiles,
            xrefChoices,
          }
        : undefined,
    [hostBytes, hostLogicalId, indexedFiles, xrefChoices],
  );
  return (
    <TakeoffApiProvider api={api}>
      <TakeoffWorkspace
        analysisId={sessionId}
        projectId="external"
        listPath="/tools"
        sourceApiBase={`/api/tools/external/sessions/${sessionId}/files`}
        externalPlan={externalPlan}
      />
    </TakeoffApiProvider>
  );
}
