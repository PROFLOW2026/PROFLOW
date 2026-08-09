import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { listAllChangeRequests } from '@/modules/commercial';
import { ChangeRequestList } from '@/modules/commercial/ui/change-request-list';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('changes');
  return { title: t('pageTitle') };
}

export default async function ChangesPage() {
  const t = await getTranslations('changes');
  const shell = await getShellContext();
  const canManage = shell?.permissions.has(PERMISSIONS.CHANGES_MANAGE) ?? false;

  const items = await withOrgContext(async (context) => listAllChangeRequests(context));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('pageTitle')}
        description={t('pageDescription')}
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/changes/new">
                <Plus aria-hidden />
                {t('panel.new')}
              </Link>
            </Button>
          ) : null
        }
      />

      <ChangeRequestList items={items} canManage={canManage} />
    </div>
  );
}
