import { BadgeCheck } from 'lucide-react';
// eslint-disable-next-line no-restricted-imports
import { inArray } from 'drizzle-orm';
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
// eslint-disable-next-line no-restricted-imports
import { tasks } from '@drizzle/schema';
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

    // Augment task items with title + project name for richer inbox display.
    const taskIds = items
      .filter((item) => item.entityType === 'task')
      .map((item) => item.entityId);

    let taskTitles: Record<string, { title: string; projectId: string | null }> = {};
    if (taskIds.length > 0) {
      const taskRows = await context.db
        .select({ id: tasks.id, title: tasks.title, projectId: tasks.projectId })
        .from(tasks)
        .where(inArray(tasks.id, taskIds));
      taskTitles = Object.fromEntries(
        taskRows.map((row) => [row.id, { title: row.title, projectId: row.projectId }]),
      );
    }

    return {
      allowed: true as const,
      items,
      taskTitles,
      canDecide:
        hasPermission(context, PERMISSIONS.APPROVALS_DECIDE) ||
        hasPermission(context, PERMISSIONS.TASKS_APPROVE),
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
          <PendingApprovalsList
            items={data.items}
            canDecide={data.canDecide}
            taskTitles={data.taskTitles}
          />
        )}
      </section>
    </div>
  );
}
