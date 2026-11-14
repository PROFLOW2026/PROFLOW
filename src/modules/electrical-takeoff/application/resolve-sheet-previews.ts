import { listArtifactsForJob } from '../data/takeoff.repository';
import type { SheetDto } from '../domain/contracts';
import type { DbExecutor } from '@/shared/db/types';

/** Map worker `previewArtifact` names to same-origin download URLs for the plan viewer. */
export async function attachSheetPreviewUrls(
  db: DbExecutor,
  organizationId: string,
  jobId: string,
  sheets: readonly SheetDto[],
): Promise<SheetDto[]> {
  if (!sheets.length) return [...sheets];
  const artifacts = await listArtifactsForJob(db, organizationId, jobId);
  const byName = new Map(artifacts.map((a) => [a.name, a.id]));
  return sheets.map((s) => {
    const artifactName = s.previewUrl;
    if (!artifactName || artifactName.startsWith('/')) return s;
    const artifactId = byName.get(artifactName);
    if (!artifactId) return { ...s, previewUrl: null };
    return { ...s, previewUrl: `/api/takeoff/artifact/${artifactId}` };
  });
}