import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { NavIcon } from '@/components/shell/nav-icon';
import type { DashboardQuickAccessDefinition } from '@/modules/tenancy/domain/dashboard-quick-access';
import { cn } from '@/shared/ui/cn';
import { pressableCardLinkClassName } from '@/components/ui/pressable';

export async function DashboardQuickAccessSection({
  shortcuts,
}: {
  shortcuts: readonly DashboardQuickAccessDefinition[];
}) {
  if (shortcuts.length === 0) return null;

  const [tDashboard, tNav] = await Promise.all([
    getTranslations('dashboard'),
    getTranslations('nav'),
  ]);

  return (
    <section className="min-w-0 max-w-full" aria-label={tDashboard('quickAccess.title')}>
      <h2 className="mb-2 text-sm font-semibold">{tDashboard('quickAccess.title')}</h2>
      <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {shortcuts.map((shortcut) => {
          const label =
            shortcut.labelNamespace === 'dashboard'
              ? tDashboard(`quickAccess.shortcuts.${shortcut.labelKey}`)
              : tNav(shortcut.labelKey);
          return (
            <Link
              key={shortcut.key}
              href={shortcut.href}
              prefetch={false}
              className={cn(
                pressableCardLinkClassName,
                'flex min-w-0 items-center gap-2 px-3 py-2 text-sm sm:w-auto',
              )}
            >
              <NavIcon iconKey={shortcut.iconKey} className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 truncate font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
