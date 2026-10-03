import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Link } from '@/shared/i18n/navigation';
import type { ContractorPlanItem } from '@/modules/project-plans';

export async function ContractorPlansList({
  projectId,
  items,
}: {
  readonly projectId: string;
  readonly items: readonly ContractorPlanItem[];
}) {
  const t = await getTranslations('projectPlans.portal.plans');
  if (items.length === 0) return <p className="text-sm text-[var(--pf-text-secondary)]">{t('empty')}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.drawingId}>
          <Link
            href={`/contractor/projects/${projectId}/plans/${item.drawingId}`}
            className="block rounded-xl border border-[var(--pf-border-default)] p-4 active:bg-[var(--pf-surface-hover)]"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">
                {item.drawingNumber} · Rev {item.revisionLabel}
              </span>
              {item.acknowledgementPending ? <Badge tone="warning">{t('ackRequired')}</Badge> : null}
            </div>
            <p className="mt-1 text-sm">{item.title}</p>
            <p className="text-xs text-[var(--pf-text-secondary)]">{t(`discipline.${item.discipline}`)}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
