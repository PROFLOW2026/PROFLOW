import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';

/** Small non-intrusive note when invoices/receipts are handled outside ProjectFlow. */
export async function CollectionModeNote() {
  const t = await getTranslations('billing.collectionMode');

  return (
    <p className="text-xs text-[var(--pf-text-muted)]">
      {t('externalAccountingNote')}{' '}
      <Link href="/settings/integrations" className="text-[var(--pf-accent)] underline">
        {t('connectAccountingLink')}
      </Link>
    </p>
  );
}
