'use client';

import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { DocumentAttachments, type DocumentAttachmentsProps } from '@/modules/documents/ui';

export function EmployeeDocumentAttachmentsSection({
  panelTitle,
  panelSummary,
  ...props
}: DocumentAttachmentsProps & {
  readonly panelTitle: string;
  readonly panelSummary?: string;
}) {
  return (
    <CollapsibleSection title={panelTitle} summary={panelSummary}>
      <DocumentAttachments {...props} suppressCardHeader className="min-w-0 max-w-full" />
    </CollapsibleSection>
  );
}
