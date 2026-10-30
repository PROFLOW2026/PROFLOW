'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export interface CredentialsOutboundShareLabels {
  readonly shareWhatsApp: string;
  readonly shareEmail: string;
  readonly shareSms: string;
  readonly shareNative: string;
  readonly copyMessage: string;
}

export interface CredentialsOutboundShareActionsProps {
  readonly whatsAppHref: string;
  readonly mailtoHref: string;
  readonly smsHref: string;
  readonly labels: CredentialsOutboundShareLabels;
  readonly onNativeShare: () => void | Promise<void>;
  readonly onCopyMessage: () => void | Promise<void>;
  /** Additional share row buttons (e.g. copy link). */
  readonly trailingActions?: ReactNode;
}

export function CredentialsOutboundShareActions({
  whatsAppHref,
  mailtoHref,
  smsHref,
  labels,
  onNativeShare,
  onCopyMessage,
  trailingActions,
}: CredentialsOutboundShareActionsProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <Button type="button" asChild variant="secondary" className="min-h-11 flex-1">
        <a href={whatsAppHref} target="_blank" rel="noopener noreferrer">
          {labels.shareWhatsApp}
        </a>
      </Button>
      <Button type="button" asChild variant="secondary" className="min-h-11 flex-1">
        <a href={mailtoHref}>{labels.shareEmail}</a>
      </Button>
      <Button type="button" asChild variant="secondary" className="min-h-11 flex-1">
        <a href={smsHref}>{labels.shareSms}</a>
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="min-h-11 flex-1"
        onClick={() => void onNativeShare()}
      >
        {labels.shareNative}
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="min-h-11 flex-1"
        onClick={() => void onCopyMessage()}
      >
        {labels.copyMessage}
      </Button>
      {trailingActions}
    </div>
  );
}
