import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

/** Lines / changes switcher for one agreement (internal or portal routes). */
export async function AgreementSubNav({
  linesHref,
  changesHref,
  overviewHref,
  current,
}: {
  linesHref: string;
  changesHref: string;
  overviewHref?: string;
  current: 'overview' | 'lines' | 'changes';
}) {
  const t = await getTranslations('subcontracts');
  const items = [
    ...(overviewHref ? [{ key: 'overview' as const, href: overviewHref, label: t('nav.overview') }] : []),
    { key: 'lines' as const, href: linesHref, label: t('nav.lines') },
    { key: 'changes' as const, href: changesHref, label: t('nav.changes') },
  ];
  return (
    <nav aria-label={t('nav.label')} className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.key === current ? 'page' : undefined}
          className={cn(
            'inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium md:min-h-9',
            item.key === current
              ? 'bg-[var(--pf-teal-50)] text-[var(--pf-teal-800)]'
              : 'text-[var(--pf-text-secondary)] hover:bg-[var(--pf-action-subtle-hover)]',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
