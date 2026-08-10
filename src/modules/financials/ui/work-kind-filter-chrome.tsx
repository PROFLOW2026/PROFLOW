import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import {
  parseWorkKindFilter,
  type WorkKindFilter,
} from '@/modules/financials/domain/work-pricing';

const FILTERS: readonly WorkKindFilter[] = ['all', 'project', 'job'];

export interface WorkKindFilterChromeProps {
  /** Current filter from `?workKind=` (default all). */
  readonly active?: string | null;
  /**
   * Pathname for filter links (locale-aware Link).
   * Home: `/` · Reports: `/reports`
   */
  readonly pathname?: '/' | '/reports';
}

/**
 * All | Projects | Jobs control for org dashboard / reports.
 * Wires `?workKind=` into Agent 3 `workKindFilter` (default: all).
 */
export async function WorkKindFilterChrome({
  active,
  pathname = '/',
}: WorkKindFilterChromeProps) {
  const t = await getTranslations('dashboard.workKindFilter');
  const current = parseWorkKindFilter(active);

  return (
    <nav
      aria-label={t('label')}
      className="flex min-w-0 flex-wrap items-center gap-2"
      data-pf-work-kind-filter=""
    >
      <span className="text-xs text-[var(--pf-text-secondary)]">{t('label')}</span>
      <ul className="flex min-w-0 flex-wrap gap-1">
        {FILTERS.map((value) => {
          const selected = current === value;
          return (
            <li key={value}>
              <Link
                href={{ pathname, query: value === 'all' ? {} : { workKind: value } }}
                className={
                  selected
                    ? 'inline-flex rounded-md bg-[var(--pf-bg-muted)] px-2.5 py-1 text-sm font-medium text-[var(--pf-text-brand)]'
                    : 'inline-flex rounded-md px-2.5 py-1 text-sm text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-muted)] hover:text-[var(--pf-text-primary)]'
                }
                aria-current={selected ? 'page' : undefined}
              >
                {t(value)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
