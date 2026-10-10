'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useOptionalToast } from '@/components/ui/toast';
import {
  buildCredentialsEmailSubject,
  buildCredentialsShareMessage,
  buildMailtoUrl,
  buildWhatsAppShareUrl,
  formatCredentialExpiry,
  normalizeWhatsAppPhone,
  type EmployeeCredentialsShareInput,
} from '@/modules/employee-app/domain/credentials-share';
import {
  buildSmsShareUrl,
  copyTextToClipboard,
  shareViaNativeSheet,
} from '@/shared/credentials/outbound-share';
import { cn } from '@/shared/ui/cn';
import {
  ACCESS_CREDENTIALS_INSET_CLASS,
  ACCESS_CREDENTIAL_VALUE_CLASS,
  AccessInfoField,
} from './access-info-field';

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly credentials: EmployeeCredentialsShareInput;
  readonly employeePhone: string | null;
  readonly employeeEmail: string | null;
}

export function EmployeeCredentialsShareDialog({
  open,
  onOpenChange,
  credentials,
  employeePhone,
  employeeEmail,
}: Props) {
  const locale = useLocale();
  const t = useTranslations('employeeApp.admin');
  const tCommon = useTranslations('common');
  const toast = useOptionalToast();
  const message = buildCredentialsShareMessage(credentials, t);
  const subject = buildCredentialsEmailSubject(credentials.organizationName, t);
  const expiryLabel = formatCredentialExpiry(credentials.temporaryPinExpiresAt, locale);

  async function copyText(text: string, successMessage: string) {
    const ok = await copyTextToClipboard(text);
    toast?.push(ok ? successMessage : t('copyFailed'), ok ? 'success' : 'danger');
  }

  async function nativeShare() {
    const outcome = await shareViaNativeSheet({ title: subject, text: message, url: credentials.loginUrl });
    if (outcome === 'shared') toast?.push(t('shareOpened'), 'success');
    if (outcome === 'failed') toast?.push(t('copyFailed'), 'danger');
  }

  const smsHref = buildSmsShareUrl(normalizeWhatsAppPhone(employeePhone), message);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tCommon('actions.close')} className="w-full min-w-0 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('shareDialogTitle')}</DialogTitle>
        </DialogHeader>

        <DialogBody className="flex min-w-0 flex-col gap-4">
          <div className={cn('flex w-full min-w-0 flex-col gap-4', ACCESS_CREDENTIALS_INSET_CLASS)}>
          <AccessInfoField
            label={t('username')}
            value={credentials.username}
            valueDir="ltr"
            valueClassName={ACCESS_CREDENTIAL_VALUE_CLASS}
            actions={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void copyText(credentials.username, t('usernameCopied'))}
              >
                {t('copy')}
              </Button>
            }
          />
          <AccessInfoField
            label={t('tempPinLabel')}
            value={credentials.temporaryPin}
            valueDir="ltr"
            valueClassName={ACCESS_CREDENTIAL_VALUE_CLASS}
            actions={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void copyText(credentials.temporaryPin, t('pinCopied'))}
              >
                {t('copy')}
              </Button>
            }
          />
          <AccessInfoField label={t('tempPinExpiry')} value={expiryLabel} valueDir="ltr" />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button type="button" asChild variant="secondary" className="flex-1">
              <a
                href={buildWhatsAppShareUrl(normalizeWhatsAppPhone(employeePhone), message)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('shareWhatsApp')}
              </a>
            </Button>
            <Button type="button" asChild variant="secondary" className="flex-1 min-h-11">
              <a href={buildMailtoUrl(employeeEmail, subject, message)}>{t('shareEmail')}</a>
            </Button>
            <Button type="button" asChild variant="secondary" className="flex-1 min-h-11">
              <a href={smsHref}>{t('shareSms')}</a>
            </Button>
            <Button type="button" variant="secondary" className="flex-1 min-h-11" onClick={() => void nativeShare()}>
              {t('shareNative')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="flex-1 min-h-11"
              onClick={() => void copyText(message, t('messageCopied'))}
            >
              {t('copyMessage')}
            </Button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
