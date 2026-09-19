import { AlertCircle } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import {
  listDashboardAttentionItems,
  type DashboardAttentionCounts,
} from '../domain/dashboard-attention-routes';
import { cn } from '@/shared/ui/cn';
import { pressableCardLinkClassName } from '@/components/ui/pressable';

export async function DashboardAttentionCards({
  attention,
}: {
  attention: DashboardAttentionCounts;
}) {
  const items = listDashboardAttentionItems(attention);
  if (items.length === 0) return null;

  const t = await getTranslations('dashboard');

  return (
    <section className="min-w-0 max-w-full">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <AlertCircle className="size-4 shrink-0" aria-hidden />
        {t('attention.title')}
      </h2>
      <div className="flex min-w-0 flex-wrap gap-2">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            prefetch={false}
            className={cn(
              pressableCardLinkClassName,
              'inline-flex min-w-0 items-center px-3 py-2 text-sm font-medium',
            )}
          >
            {t(`attention.compact.${item.key}`, { count: item.count })}
          </Link>
        ))}
      </div>
    </section>
  );
}
