'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useOptionalToast } from '@/components/ui/toast';
import {
  buildMailtoUrl,
  buildWhatsAppShareUrl,
  normalizeWhatsAppPhone,
} from '@/modules/employee-app/domain/credentials-share';
import {
  buildContractorCredentialsShareMessage,
  buildContractorLinkUrl,
  buildContractorShareEmailSubject,
  contractorLinkPathForLocale,
  isContractorShareLocale,
  type ContractorShareKind,
} from '@/modules/contractor-access/domain/credentials-share';
import { contractorAccessCopyTranslator } from '@/shared/i18n/sync-namespace-translator';
import { LOCALES, LOCALE_METADATA, type Locale } from '@/shared/i18n/config';
import {
  buildSmsShareUrl,
  copyTextToClipboard,
  shareViaNativeSheet,
} from '@/shared/credentials/outbound-share';
import { AccessInfoField } from '@/modules/employee-app/ui/access-info-field';

export interface ContractorShareDialogPayload {
  readonly kind: ContractorShareKind;
  readonly path: string;
  readonly expiresAt: string;
  readonly username: string;
  readonly displayName: string;
  readonly contactEmail?: string | null;
  readonly phone?: string | null;
  readonly locale?: string | null;
}

function resolveMessageLocale(raw: string | null | undefined, fallback: string): Locale {
  if (raw && isContractorShareLocale(raw)) return raw;
  if (isContractorShareLocale(fallback)) return fallback;
  return 'he-IL';
}

function ContractorCredentialsShareDialogBody({
  open,
  onOpenChange,
  payload,
  organizationName,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly payload: ContractorShareDialogPayload;
  readonly organizationName: string;
}) {
  const tUi = useTranslations('contractorAccess.manage.shareDialog');
  const tCommon = useTranslations('common');
  const toast = useOptionalToast();
  const [origin, setOrigin] = useState('');
  const [messageLocale, setMessageLocale] = useState<Locale>(() =>
    resolveMessageLocale(payload.locale, 'he-IL'),
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() => setOrigin(window.location.origin));
    return () => cancelAnimationFrame(frame);
  }, []);

  const linkPath = useMemo(() => {
    if (!payload) return '';
    return contractorLinkPathForLocale(payload.path, messageLocale);
  }, [payload, messageLocale]);

  const linkUrl = useMemo(() => {
    if (!origin || !linkPath) return '';
    return buildContractorLinkUrl(origin, linkPath);
  }, [origin, linkPath]);

  const message = useMemo(() => {
    if (!payload || !linkUrl) return '';
    const t = contractorAccessCopyTranslator(messageLocale);
    return buildContractorCredentialsShareMessage(
      {
        kind: payload.kind,
        displayName: payload.displayName,
        organizationName,
        username: payload.username,
        linkPath,
        linkUrl,
        expiresAt: new Date(payload.expiresAt),
      },
      t,
      messageLocale,
    );
  }, [payload, linkUrl, linkPath, messageLocale, organizationName]);

  const emailSubject = useMemo(() => {
    if (!payload) return '';
    const t = contractorAccessCopyTranslator(messageLocale);
    return buildContractorShareEmailSubject(payload.kind, organizationName, t);
  }, [payload, messageLocale, organizationName]);

  const title = payload.kind === 'invite' ? tUi('titleInvite') : tUi('titleReset');
  const whatsAppHref = buildWhatsAppShareUrl(normalizeWhatsAppPhone(payload.phone), message);
  const mailtoHref = buildMailtoUrl(payload.contactEmail, emailSubject, message);
  const smsHref = buildSmsShareUrl(normalizeWhatsAppPhone(payload.phone), message);

  async function copy(text: string, okLabel: string) {
    const ok = await copyTextToClipboard(text);
    toast?.push(ok ? okLabel : tUi('copyFailed'), ok ? 'success' : 'danger');
  }

  async function nativeShare() {
    const outcome = await shareViaNativeSheet({
      title: emailSubject,
      text: message,
      url: linkUrl,
    });
    if (outcome === 'shared') toast?.push(tUi('shareOpened'), 'success');
    if (outcome === 'failed') toast?.push(tUi('copyFailed'), 'danger');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tCommon('actions.close')} className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{tUi('messageLanguage')}</span>
            <select
              className="min-h-11 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3"
              value={messageLocale}
              onChange={(event) => {
                const next = event.target.value;
                if (isContractorShareLocale(next)) setMessageLocale(next);
              }}
            >
              {LOCALES.map((locale) => (
                <option key={locale} value={locale}>
                  {LOCALE_METADATA[locale].label}
                </option>
              ))}
            </select>
          </label>

          <AccessInfoField label={tUi('displayName')} value={payload.displayName} valueDir="auto" />
          <AccessInfoField
            label={tUi('username')}
            value={payload.username}
            valueDir="ltr"
            valueClassName="font-mono"
          />
          <AccessInfoField label={tUi('link')} value={linkUrl || '…'} valueDir="ltr" valueClassName="break-all text-xs" />

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button type="button" asChild variant="secondary" className="min-h-11 flex-1">
              <a href={whatsAppHref} target="_blank" rel="noopener noreferrer">
                {tUi('shareWhatsApp')}
              </a>
            </Button>
            <Button type="button" asChild variant="secondary" className="min-h-11 flex-1">
              <a href={mailtoHref}>{tUi('shareEmail')}</a>
            </Button>
            <Button type="button" asChild variant="secondary" className="min-h-11 flex-1">
              <a href={smsHref}>{tUi('shareSms')}</a>
            </Button>
            <Button type="button" variant="secondary" className="min-h-11 flex-1" onClick={() => void nativeShare()}>
              {tUi('shareNative')}
            </Button>
            <Button type="button" variant="secondary" className="min-h-11 flex-1" onClick={() => void copy(message, tUi('messageCopied'))}>
              {tUi('copyMessage')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="min-h-11 flex-1"
              onClick={() => void copy(linkUrl, tUi('linkCopied'))}
              disabled={!linkUrl}
            >
              {tUi('copyLink')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ContractorCredentialsShareDialog({
  open,
  onOpenChange,
  payload,
  organizationName,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly payload: ContractorShareDialogPayload | null;
  readonly organizationName: string;
}) {
  if (!payload) return null;

  return (
    <ContractorCredentialsShareDialogBody
      key={`${payload.kind}:${payload.path}:${payload.expiresAt}`}
      open={open}
      onOpenChange={onOpenChange}
      payload={payload}
      organizationName={organizationName}
    />
  );
}
