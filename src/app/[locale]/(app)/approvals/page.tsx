import { BadgeCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { listPendingApprovals } from '@/modules/approvals';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { PendingApprovalsList } from './pending-list';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'approvals' });
  return { title: t('title') };
}

export default async function ApprovalsPage() {
  const t = await getTranslations('approvals');

  const data = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.APPROVALS_READ)) {
      return { allowed: false as const };
    }
    const items = await listPendingApprovals(context, { limit: 100 });
    return {
      allowed: true as const,
      items,
      canDecide: hasPermission(context, PERMISSIONS.APPROVALS_DECIDE),
      canManage: hasPermission(context, PERMISSIONS.APPROVALS_MANAGE),
    };
  });

  if (!data.allowed) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('title')} description={t('description')} />
        <EmptyState title={t('pendingEmpty.title')} description={t('pendingEmpty.body')} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          data.canManage ? (
            <Button asChild variant="secondary">
              <Link href="/settings/approvals">{t('settingsLink')}</Link>
            </Button>
          ) : null
        }
      />

      <section className="flex flex-col gap-3" aria-label={t('pendingTitle')}>
        <h2 className="text-base font-semibold">{t('pendingTitle')}</h2>
        {data.items.length === 0 ? (
          <EmptyState
            icon={BadgeCheck}
            title={t('pendingEmpty.title')}
            description={t('pendingEmpty.body')}
          />
        ) : (
          <PendingApprovalsList items={data.items} canDecide={data.canDecide} />
        )}
      </section>
    </div>
  );
}
