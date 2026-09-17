'use client';

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
  buildCredentialsEmailSubject,
  buildCredentialsShareMessage,
  buildMailtoUrl,
  buildWhatsAppShareUrl,
  formatCredentialExpiry,
  normalizeWhatsAppPhone,
  type EmployeeCredentialsShareInput,
} from '@/modules/employee-app/domain/credentials-share';
import { ACCESS_CREDENTIAL_VALUE_CLASS, AccessInfoField } from './access-info-field';

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
  const t = useTranslations('employeeApp.admin');
  const tCommon = useTranslations('common');
  const toast = useOptionalToast();
  const message = buildCredentialsShareMessage(credentials);
  const subject = buildCredentialsEmailSubject(credentials.organizationName);
  const expiryLabel = formatCredentialExpiry(credentials.temporaryPinExpiresAt);

  async function copyText(text: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast?.push(successMessage, 'success');
    } catch {
      toast?.push(t('copyFailed'), 'danger');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tCommon('actions.close')} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('shareDialogTitle')}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex max-w-sm flex-col gap-4">
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
            <Button type="button" asChild variant="secondary" className="flex-1">
              <a href={buildMailtoUrl(employeeEmail, subject, message)}>{t('shareEmail')}</a>
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => void copyText(message, t('messageCopied'))}
            >
              {t('copyMessage')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
