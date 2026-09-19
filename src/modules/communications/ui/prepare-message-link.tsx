'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Link } from '@/shared/i18n/navigation';
import type { CommunicationEntityType } from '@/modules/communications/domain/types';

export function PrepareMessageLink({
  entityType,
  entityId,
  projectId,
  clientId,
  vendorId,
  recipientEmail,
  subject,
  disabled = false,
}: {
  entityType: CommunicationEntityType;
  entityId?: string | null;
  projectId?: string | null;
  clientId?: string | null;
  vendorId?: string | null;
  recipientEmail?: string | null;
  subject?: string | null;
  /** Set when the user lacks communications.manage permission. */
  disabled?: boolean;
}) {
  const t = useTranslations('communications');

  if (disabled) {
    return (
      <Button type="button" variant="secondary" disabled title="בקרוב">
        {t('prepareMessage')}
      </Button>
    );
  }

  const params = new URLSearchParams();
  params.set('entityType', entityType);
  if (entityId) params.set('entityId', entityId);
  if (projectId) params.set('projectId', projectId);
  if (clientId) params.set('clientId', clientId);
  if (vendorId) params.set('vendorId', vendorId);
  if (recipientEmail) params.set('to', recipientEmail);
  if (subject) params.set('subject', subject);
  return (
    <Button asChild variant="secondary">
      <Link href={`/communications/new?${params.toString()}`}>{t('prepareMessage')}</Link>
    </Button>
  );
}
