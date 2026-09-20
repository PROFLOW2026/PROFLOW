import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getWorkspaceDetail } from '@/modules/workspaces';
import { CreateBoardForm } from './_create-board-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; workspaceId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tasks' });
  return { title: t('boards.createBoard') };
}

export default async function CreateBoardPage({
  params,
}: {
  params: Promise<{ locale: string; workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const t = await getTranslations('tasks');

  const workspace = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.WORKSPACES_MANAGE)) return null;
    return getWorkspaceDetail(context, workspaceId);
  });

  if (!workspace) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('boards.createBoard')}
        description={t('boards.createDescription', { workspace: workspace.name })}
      />
      <CreateBoardForm workspaceId={workspaceId} />
    </div>
  );
}
