'use client';

import { useMemo, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Link } from '@/shared/i18n/navigation';
import { buildWhatsAppShareUrl } from '@/modules/communications/domain/whatsapp-share';
import { PrepareMessageLink } from '@/modules/communications/ui/prepare-message-link';
import { SaveToStorageButton } from '@/modules/generated-documents/ui/save-to-storage-button';
import { buildCustomerStatementShareUrl, customerStatementPreviewPath } from '../domain/customer-statement-share';

export function CustomerStatementActions({
  clientId,
  clientName,
  clientEmail = null,
  clientPhone = null,
  canCommunicate = true,
  compact = false,
  previewLabel,
}: {
  readonly clientId: string;
  readonly clientName: string;
  readonly clientEmail?: string | null;
  readonly clientPhone?: string | null;
  readonly canCommunicate?: boolean;
  readonly compact?: boolean;
  readonly previewLabel?: string;
}) {
  const t = useTranslations('reports.customerStatement');
  const tReports = useTranslations('reports');
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const previewHref = customerStatementPreviewPath(clientId);
  const previewText = previewLabel ?? t('preview');
  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return buildCustomerStatementShareUrl({
      origin: window.location.origin,
      locale,
      clientId,
    });
  }, [clientId, locale]);

  function whatsAppMessage(url: string): string {
    return t('share.messageTemplate', { clientName, link: url });
  }

  function handleShare() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const url =
        shareUrl ||
        buildCustomerStatementShareUrl({
          origin: window.location.origin,
          locale,
          clientId,
        });
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({
            title: tReports('kinds.customer_statement'),
            url,
          });
          setSuccess(t('shareSuccess'));
          return;
        } catch {
          // fall through to copy
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        setSuccess(t('linkCopied'));
      } catch {
        setError(t('shareFailed'));
      }
    });
  }

  function handleCopyLink() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const url =
        shareUrl ||
        buildCustomerStatementShareUrl({
          origin: window.location.origin,
          locale,
          clientId,
        });
      try {
        await navigator.clipboard.writeText(url);
        setSuccess(t('linkCopied'));
      } catch {
        setError(t('shareFailed'));
      }
    });
  }

  function handleWhatsApp() {
    setError(null);
    setSuccess(null);
    const url =
      shareUrl ||
      buildCustomerStatementShareUrl({
        origin: window.location.origin,
        locale,
        clientId,
      });
    const waUrl = buildWhatsAppShareUrl({ phone: clientPhone, message: whatsAppMessage(url) });
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  }

  const variant = compact ? 'ghost' : 'secondary';

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button asChild variant={variant} size="sm">
          <Link href={previewHref}>{previewText}</Link>
        </Button>
        <Button type="button" variant={variant} size="sm" disabled={pending} onClick={handleShare}>
          {t('shareButton')}
        </Button>
        <Button type="button" variant={variant} size="sm" disabled={pending} onClick={handleCopyLink}>
          {t('copyLink')}
        </Button>
        <Button type="button" variant={variant} size="sm" disabled={pending} onClick={handleWhatsApp}>
          {t('whatsapp')}
        </Button>
        <PrepareMessageLink
          entityType="report"
          entityId={clientId}
          clientId={clientId}
          recipientEmail={clientEmail}
          subject={t('prepareSubject', { clientName })}
          disabled={!canCommunicate}
        />
        <SaveToStorageButton kind="customer_statement" entityId={clientId} compact={compact} />
      </div>
      {error ? <p className="text-xs text-[var(--pf-text-danger)]">{error}</p> : null}
      {success ? <p className="text-xs text-[var(--pf-text-success)]">{success}</p> : null}
    </div>
  );
}
