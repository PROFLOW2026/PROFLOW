import { getTranslations } from 'next-intl/server';
import { pressableCardLinkClassName } from '@/components/ui/pressable';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

export type CommercialDocsHubCurrent = 'quotes' | 'changes' | 'billing' | 'crm' | 'hub';

/**
 * Routes to existing commercial objects. Does not merge quotes / changes / billing tables.
 */
export async function CommercialDocsHub({
  current,
}: {
  readonly current: CommercialDocsHubCurrent;
}) {
  const t = await getTranslations('quotes.hub');

  const cards = [
    {
      key: 'quotes' as const,
      href: '/quotes',
      title: t('preProjectTitle'),
      body: t('preProjectBody'),
      action: t('preProjectAction'),
    },
    {
      key: 'changes' as const,
      href: '/changes',
      title: t('inProjectTitle'),
      body: t('inProjectBody'),
      action: t('inProjectAction'),
    },
    {
      key: 'billing' as const,
      href: '/billing',
      title: t('billingTitle'),
      body: t('billingBody'),
      action: t('billingAction'),
    },
  ];

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label={t('title')}>
      {current === 'hub' ? null : (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('stripIntro')}</p>
      )}

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
        {cards.map((card) => {
          const here = current === card.key;
          if (here) {
            return (
              <div
                key={card.key}
                className="rounded-lg border border-[var(--pf-border-strong)] bg-[var(--pf-bg-surface)] p-4"
              >
                <p className="text-xs font-medium text-[var(--pf-text-brand)]">{t('here')}</p>
                <p className="mt-1 font-semibold">{card.title}</p>
                <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{card.body}</p>
              </div>
            );
          }

          return (
            <Link
              key={card.key}
              href={card.href}
              className={cn(pressableCardLinkClassName, 'min-w-0 hover:bg-[var(--pf-bg-subtle)]')}
            >
              <p className="font-semibold">{card.title}</p>
              <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{card.body}</p>
              <p className="mt-2 text-sm font-medium text-[var(--pf-text-brand)]">{card.action}</p>
            </Link>
          );
        })}
      </div>

      {current === 'crm' || current === 'hub' ? (
        <p className="text-xs text-[var(--pf-text-muted)]">
          {t('crmNote')}{' '}
          {current === 'hub' ? (
            <Link href="/crm" className="font-medium text-[var(--pf-text-brand)] underline-offset-4 hover:underline">
              {t('crmAction')}
            </Link>
          ) : (
            <Link href="/quotes" className="font-medium text-[var(--pf-text-brand)] underline-offset-4 hover:underline">
              {t('preProjectAction')}
            </Link>
          )}
        </p>
      ) : null}
    </section>
  );
}
