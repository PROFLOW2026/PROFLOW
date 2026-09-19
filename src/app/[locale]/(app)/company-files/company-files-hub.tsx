'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/shared/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CompanyFilesTab } from './company-files-tab';

const REGISTRY_SHORTCUTS = [
  { href: '/documents?ownerType=client', labelKey: 'shortcuts.clients' as const },
  { href: '/documents?ownerType=project', labelKey: 'shortcuts.projects' as const },
  { href: '/documents?ownerType=vendor', labelKey: 'shortcuts.vendors' as const },
  { href: '/documents?ownerType=billing_record', labelKey: 'shortcuts.billing' as const },
  { href: '/documents?ownerType=ap_bill', labelKey: 'shortcuts.vendorInvoices' as const },
  { href: '/documents?ownerType=contract', labelKey: 'shortcuts.contracts' as const },
  { href: '/documents?ownerType=quote_version', labelKey: 'shortcuts.quotes' as const },
  { href: '/documents?ownerType=employee', labelKey: 'shortcuts.employees' as const },
] as const;

export function CompanyFilesHub({
  storageConfigured,
  canManage,
  initialTab,
}: {
  storageConfigured: boolean;
  canManage: boolean;
  initialTab: 'cloud' | 'registry';
}) {
  const t = useTranslations('externalStorage.orgFiles');
  const activeRegistry = initialTab === 'registry';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 border-b border-[var(--pf-border-default)] pb-3">
        <Button asChild size="sm" variant={activeRegistry ? 'secondary' : 'primary'}>
          <Link href="/company-files?tab=cloud">{t('tabs.cloudFiles')}</Link>
        </Button>
        <Button asChild size="sm" variant={activeRegistry ? 'primary' : 'secondary'}>
          <Link href="/company-files?tab=registry">{t('tabs.documentRegistry')}</Link>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link href="/documents">{t('tabs.openFullRegistry')}</Link>
        </Button>
      </div>

      {activeRegistry ? (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('registry.title')}</CardTitle>
              <p className="text-sm text-[var(--pf-text-secondary)]">{t('registry.description')}</p>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {REGISTRY_SHORTCUTS.map((shortcut) => (
                <Button key={shortcut.href} asChild size="sm" variant="secondary">
                  <Link href={shortcut.href}>{t(shortcut.labelKey)}</Link>
                </Button>
              ))}
            </CardContent>
          </Card>
          <p className="text-sm text-[var(--pf-text-secondary)]">
            {t('registry.hint')}{' '}
            <Link href="/documents" className="underline">
              {t('tabs.openFullRegistry')}
            </Link>
          </p>
        </div>
      ) : (
        <CompanyFilesTab storageConfigured={storageConfigured} canManage={canManage} />
      )}
    </div>
  );
}
