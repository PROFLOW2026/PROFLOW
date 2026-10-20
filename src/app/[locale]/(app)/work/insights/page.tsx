import { MainAppSection } from '@/components/patterns/main-app';
﻿import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { withOrgContext, getShellContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getTaskInsights } from '@/modules/tasks/application/get-task-insights';
import { TaskInsightsView } from '@/modules/tasks/ui/task-insights-view';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tasks' });
  return { title: t('insights.pageTitle') };
}

export default async function WorkInsightsPage() {
  const shell = await getShellContext();
  if (!shell?.permissions.has(PERMISSIONS.TASKS_READ) || !shell.modules.work_management) {
    notFound();
  }

  const t = await getTranslations('tasks');
  const insights = await withOrgContext((context) => getTaskInsights(context));

  return (
    <>
      <PageHeader title={t('insights.pageTitle')} description={t('insights.pageDescription')} />
      <MainAppSection className="w-full min-w-0">
        <TaskInsightsView insights={insights} />
      </MainAppSection>
    </>
  );
}
