'use client';

import { useTranslations } from 'next-intl';
import { ShieldX } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

/** Shown when the signed-in user lacks permission for a settings section. */
export function SettingsNotAllowed() {
  const t = useTranslations('settings');

  return (
    <EmptyState
      icon={ShieldX}
      title={t('notAllowed.title')}
      description={t('notAllowed.body')}
      size="md"
    />
  );
}
