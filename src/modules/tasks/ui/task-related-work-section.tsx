import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { listTaskRelatedWork } from '../application/list-task-related-work';

export async function TaskRelatedWorkSection({ taskId }: { readonly taskId: string }) {
  const entries = await withOrgContext((context) => listTaskRelatedWork(context, taskId));
  if (entries.length === 0) return null;

  const t = await getTranslations('tasks');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('relatedWork.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2 text-sm">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center gap-2">
              <Link href={entry.href} className="font-medium text-[var(--pf-status-info-fg)] underline">
                {entry.label}
              </Link>
              {entry.relation ? (
                <span className="text-xs text-[var(--pf-text-muted)]">
                  {t(`relatedWork.relations.${entry.relation}`, { defaultValue: entry.relation })}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
