import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatBusinessDate } from '@/shared/dates';
import { Link } from '@/shared/i18n/navigation';
import { formatRfiNumber, rfiStatusTone } from '../domain/lifecycle';
import type { RfiListItem } from '../domain/types';
import { statusTone } from './tones';

export async function RfiList({
  items,
  basePath,
  locale,
}: {
  items: readonly (RfiListItem & { readonly overdue: boolean })[];
  basePath: string;
  locale: string;
}) {
  const t = await getTranslations('rfi');
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b text-start text-[var(--pf-text-secondary)]">
              <th className="px-2 py-2 font-medium">{t('list.columns.number')}</th>
              <th className="px-2 py-2 font-medium">{t('list.columns.subject')}</th>
              <th className="px-2 py-2 font-medium">{t('list.columns.contractor')}</th>
              <th className="px-2 py-2 font-medium">{t('list.columns.due')}</th>
              <th className="px-2 py-2 font-medium">{t('list.columns.status')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b hover:bg-[var(--pf-surface-hover)]">
                <td className="px-2 py-3">
                  <Link href={`${basePath}/${item.id}`} className="font-medium text-[var(--pf-text-brand)]">
                    {formatRfiNumber(item.number)}
                  </Link>
                </td>
                <td className="max-w-xs truncate px-2 py-3">{item.subject}</td>
                <td className="px-2 py-3">{item.vendorName ?? t('fields.noContractor')}</td>
                <td className="px-2 py-3">
                  {item.dueDate ? formatBusinessDate(item.dueDate as never, locale) : t('list.noDue')}
                  {item.overdue ? (
                    <Badge tone="danger" className="ms-2">
                      {t('list.overdue')}
                    </Badge>
                  ) : null}
                </td>
                <td className="px-2 py-3">
                  <Badge tone={statusTone(rfiStatusTone(item.status, item.overdue))}>{t(`status.${item.status}`)}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-3 md:hidden">
        {items.map((item) => (
          <li key={item.id}>
            <Link href={`${basePath}/${item.id}`} className="block">
              <Card className="flex flex-col gap-2 p-4 active:bg-[var(--pf-surface-hover)]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{formatRfiNumber(item.number)}</span>
                  <Badge tone={statusTone(rfiStatusTone(item.status, item.overdue))}>{t(`status.${item.status}`)}</Badge>
                  {item.overdue ? <Badge tone="danger">{t('list.overdue')}</Badge> : null}
                </div>
                <span className="text-base font-medium">{item.subject}</span>
                <span className="text-sm text-[var(--pf-text-secondary)]">
                  {item.vendorName ?? t('fields.noContractor')}
                  {' · '}
                  {item.dueDate ? t('list.dueOn', { date: formatBusinessDate(item.dueDate as never, locale) }) : t('list.noDue')}
                </span>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
