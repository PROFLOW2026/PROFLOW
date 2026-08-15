import { getTranslations } from 'next-intl/server';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';
import type { ReportKind } from '../domain/types';
import { ReportDownloadButtons } from './report-download-buttons';

export async function ProjectReportActions({
  projectId,
  canStatus,
  canFinancials,
}: {
  projectId: string;
  canStatus: boolean;
  canFinancials: boolean;
}) {
  const t = await getTranslations('reports');
  const kinds: ReportKind[] = [];
  if (canStatus) kinds.push('project_status');
  if (canFinancials) kinds.push('project_financial_summary');
  if (kinds.length === 0) return null;

  return (
    <WithClientMessages extra={['reports', 'exports']}>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <span className="sr-only">{t('title')}</span>
        {kinds.map((kind) => (
          <ReportDownloadButtons key={kind} kind={kind} id={projectId} compact />
        ))}
      </div>
    </WithClientMessages>
  );
}
