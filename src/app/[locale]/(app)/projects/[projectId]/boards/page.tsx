import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LayoutGrid } from 'lucide-react';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { pressableCardLinkClassName } from '@/components/ui/pressable';
import {
  findWorkspaceIdsByProject,
  getWorkspaceDetail,
} from '@/modules/workspaces';
// Agent A's real API
import { listBoards } from '@/modules/tasks';
import { mapBoardToUiBoard } from '@/modules/tasks/ui/_task-api-stub';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; projectId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tasks' });
  return { title: t('boards.projectPageTitle') };
}

export default async function ProjectBoardsPage({
  params,
}: {
  params: Promise<{ locale: string; projectId: string }>;
}) {
  const { projectId } = await params;
  const t = await getTranslations('tasks');

  const data = await withOrgContext(async (context) => {
    const workspaceIds = await findWorkspaceIdsByProject(context.db, projectId);
    if (workspaceIds.length === 0) return { boards: [], workspaceName: null, primaryWorkspaceId: null };

    const primaryWsId = workspaceIds[0];
    if (!primaryWsId) return { boards: [], workspaceName: null, primaryWorkspaceId: null };
    const workspace = await getWorkspaceDetail(context, primaryWsId);
    const rawBoards = await listBoards(context, primaryWsId);

    return {
      boards: rawBoards.map((b) => mapBoardToUiBoard(b)),
      workspaceName: workspace?.name ?? null,
      primaryWorkspaceId: primaryWsId,
    };
  });

  if (!data) notFound();

  const { boards, workspaceName, primaryWorkspaceId } = data;
  const activeBoards = boards.filter((b) => !b.isArchived);
  const defaultBoard = activeBoards.find((b) => b.isDefault);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={workspaceName ? `${workspaceName} — ${t('boards.pageTitle')}` : t('boards.pageTitle')}
        description={t('boards.pageDescription')}
        actions={
          primaryWorkspaceId ? (
            <Button asChild variant="primary" size="md">
              <Link href={`/workspaces/${primaryWorkspaceId}/boards/new`}>
                {t('boards.createBoard')}
              </Link>
            </Button>
          ) : null
        }
      />

      {activeBoards.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title={t('boards.empty.title')}
          description={t('boards.empty.description')}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {activeBoards.map((board) => (
            <li key={board.id}>
              <Link
                href={`/projects/${projectId}/boards/${board.id}`}
                className={cn(
                  pressableCardLinkClassName,
                  'flex flex-col gap-2',
                  board.id === defaultBoard?.id &&
                    'border-[var(--pf-border-brand)] bg-[var(--pf-teal-50)]',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate font-semibold">{board.name}</span>
                  <div className="flex shrink-0 gap-1.5">
                    {board.id === defaultBoard?.id && (
                      <Badge tone="brand" className="text-xs">
                        {t('boards.default')}
                      </Badge>
                    )}
                    <Badge tone="neutral" className="text-xs">
                      {board.taskCount} {t('boards.tasks')}
                    </Badge>
                  </div>
                </div>
                <p className="mt-auto text-xs text-[var(--pf-text-muted)]">
                  {t('boards.openBoard')} →
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
