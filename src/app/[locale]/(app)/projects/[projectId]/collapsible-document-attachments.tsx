'use client';

import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { DocumentAttachments, type DocumentAttachmentsProps } from '@/modules/documents/ui';

export function CollapsibleDocumentAttachments({
  panelTitle,
  panelSummary,
  ...props
}: DocumentAttachmentsProps & {
  panelTitle: string;
  panelSummary?: string;
}) {
  return (
    <CollapsibleSection title={panelTitle} summary={panelSummary} defaultOpen={false}>
      <DocumentAttachments {...props} suppressCardHeader />
    </CollapsibleSection>
  );
}
