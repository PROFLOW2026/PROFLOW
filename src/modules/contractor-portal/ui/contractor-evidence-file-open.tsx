'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AuthorizedFilePreviewDialog } from '@/modules/external-storage/ui/authorized-file-preview-dialog';
import { withExplicitAttachment } from '../download-paths';

export function ContractorEvidenceFileOpen({
  href,
  fileName,
  mimeType,
  label,
}: {
  readonly href: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly label: string;
}) {
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <button
        type="button"
        className="truncate text-sm font-medium text-[var(--pf-text-brand)] hover:underline"
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      <a href={withExplicitAttachment(href)} download className="text-xs text-[var(--pf-text-secondary)] hover:underline">
        {tCommon('actions.download')}
      </a>
      <AuthorizedFilePreviewDialog
        open={open}
        onOpenChange={setOpen}
        file={{
          title: label,
          fileName,
          mimeType,
          contentUrl: href,
          downloadUrl: withExplicitAttachment(href),
        }}
      />
    </div>
  );
}
