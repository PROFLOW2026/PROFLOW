'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { documentExpiryState } from '../domain/expiry';

export function DocumentExpiryBadge({ expiresAt }: { expiresAt: string | null | undefined }) {
  const t = useTranslations('documents.meta');
  const state = documentExpiryState(expiresAt);
  if (state === 'none' || !expiresAt) return null;

  return (
    <Badge tone={state === 'expired' ? 'danger' : 'warning'}>
      {state === 'expired' ? t('expired') : t('expiring')}
      <span dir="ltr" className="pf-numeric">
        {expiresAt}
      </span>
    </Badge>
  );
}

export function DocumentRequiredBadge({ isRequired }: { isRequired: boolean }) {
  const t = useTranslations('documents.meta');
  if (!isRequired) return null;
  return <Badge tone="info">{t('requiredBadge')}</Badge>;
}
