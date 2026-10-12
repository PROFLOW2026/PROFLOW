import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';

const LINKS = [
  {
    key: 'generalOverhead' as const,
    href: '/expenses?costFamily=business_overhead',
  },
  {
    key: 'sharedExpenses' as const,
    href: '/expenses?costFamily=shared',
  },
  {
    key: 'allocatedOverhead' as const,
    href: '/financials/business-profitability',
  },
  {
    key: 'companyOnly' as const,
    href: '/financials/business-profitability',
  },
  {
    key: 'unallocated' as const,
    href: '/reports?section=cost',
  },
  {
    key: 'allExpenses' as const,
    href: '/expenses',
  },
] as const;

export async function OverheadNavigationHub() {
  const t = await getTranslations('expenses.overheadHome.hub');

  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      {LINKS.map((link) => (
        <Card key={link.key} className="min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t(`${link.key}.title`)}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 pt-0">
            <p className="text-xs text-[var(--pf-text-secondary)]">{t(`${link.key}.body`)}</p>
            <Link href={link.href} className={textNavLinkClassName}>
              {t(`${link.key}.action`)}
            </Link>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
