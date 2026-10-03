import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Link } from '@/shared/i18n/navigation';
import type { DrawingListItem } from '@/modules/project-plans';

export async function DrawingsRegister({
  projectId,
  drawings,
  basePath,
}: {
  readonly projectId: string;
  readonly drawings: readonly DrawingListItem[];
  /** Register route. Defaults to the Owner app path. */
  readonly basePath?: string;
}) {
  const t = await getTranslations('projectPlans.register');
  const listBase = basePath ?? `/projects/${projectId}/plans`;
  if (drawings.length === 0) {
    return <p className="text-sm text-[var(--pf-text-secondary)]">{t('empty')}</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {drawings.map((drawing) => (
        <li key={drawing.id}>
          <Link
            href={`${listBase}/${drawing.id}`}
            className="flex min-h-14 flex-col gap-1 rounded-xl border border-[var(--pf-border-default)] p-3 active:bg-[var(--pf-surface-hover)] sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="truncate font-semibold">
                {drawing.drawingNumber} · {drawing.title}
              </p>
              <p className="text-xs text-[var(--pf-text-secondary)]">
                {t(`discipline.${drawing.discipline}`)}
                {drawing.locationName ? ` · ${drawing.locationName}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {drawing.currentRevision ? (
                <Badge tone="neutral">{t('currentRev', { label: drawing.currentRevision.revisionLabel })}</Badge>
              ) : null}
              {drawing.draftCount > 0 ? <Badge tone="warning">{t('drafts', { count: drawing.draftCount })}</Badge> : null}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
