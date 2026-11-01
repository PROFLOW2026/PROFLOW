'use client';

import { Cloud } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ProjectCloudFilePicker } from '@/modules/external-storage/client';
import type { ProjectCloudFileBrowserActions } from '@/modules/external-storage/client/project-cloud-file-picker-types';
import { storageFileUrl } from './infra-client';
import { INFRA_TEXT } from './texts';

/**
 * Picks a photo from the organization's connected storage (the project file browser) and hands it
 * over as a `File`. Used by the capture panel; the locate panel has its own compact variant.
 */
export function ProjectStoragePickButton({
  projectId,
  browserActions,
  onFile,
}: {
  readonly projectId: string;
  readonly browserActions: ProjectCloudFileBrowserActions;
  readonly onFile: (file: File) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)} data-testid="infra-capture-from-storage">
        <Cloud aria-hidden />
        {INFRA_TEXT.capture.fromProject}
      </Button>
      {error ? (
        <span className="w-full text-xs text-[var(--pf-status-danger-fg)]" role="alert">
          {error}
        </span>
      ) : null}
      <ProjectCloudFilePicker
        projectId={projectId}
        open={open}
        onOpenChange={setOpen}
        browserActions={browserActions}
        title={INFRA_TEXT.capture.pickTitle}
        description={INFRA_TEXT.capture.pickDescription}
        onSelect={async (ref) => {
          setError(null);
          try {
            const response = await fetch(storageFileUrl(projectId, ref.providerFileId), { credentials: 'same-origin' });
            if (!response.ok) throw new Error('download');
            const blob = await response.blob();
            onFile(new File([blob], ref.fileName, { type: ref.mimeType || blob.type }));
          } catch {
            setError(INFRA_TEXT.gallery.selectFailed);
          }
        }}
      />
    </>
  );
}
