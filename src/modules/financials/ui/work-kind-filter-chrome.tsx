import { getTranslations } from 'next-intl/server';
import { SectionNavLink } from '@/components/ui/section-nav-link';
import {
  parseWorkKindFilter,
  type WorkKindFilter,
} from '@/modules/financials/domain/work-pricing';
import { parseReportsSection, reportsHref } from '@/modules/financials/domain/reports-section';

const FILTERS: readonly WorkKindFilter[] = ['all', 'project', 'job'];

export interface WorkKindFilterChromeProps {
  /** Current filter from `?workKind=` (default all). */
  readonly active?: string | null;
  /**
   * Pathname for filter links (locale-aware Link).
   * Home: `/` · Reports: `/reports`
   */
  readonly pathname?: '/' | '/reports';
  /** Preserve `?section=` when switching work kind on reports. */
  readonly section?: string | null;
}

/**
 * All | Projects | Jobs control for org dashboard / reports.
 * Wires `?workKind=` into Agent 3 `workKindFilter` (default: all).
 */
export async function WorkKindFilterChrome({
  active,
  pathname = '/',
  section = null,
}: WorkKindFilterChromeProps) {
  const t = await getTranslations('dashboard.workKindFilter');
  const current = parseWorkKindFilter(active);
  const reportsSection = pathname === '/reports' ? parseReportsSection(section) : null;

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
          const href =
            pathname === '/reports'
              ? reportsHref({
                  section: reportsSection,
                  workKind: value,
                })
              : value === 'all'
                ? pathname
                : `${pathname}?workKind=${value}`;
          return (
            <li key={value}>
              <SectionNavLink href={href} active={selected} className="min-h-8 px-2.5 py-1">
                {t(value)}
              </SectionNavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
