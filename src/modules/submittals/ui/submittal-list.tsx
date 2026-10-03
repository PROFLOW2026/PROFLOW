import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatBusinessDate } from '@/shared/dates';
import { Link } from '@/shared/i18n/navigation';
import { formatSubmittalNumber, submittalStatusTone } from '../domain/lifecycle';
import type { SubmittalListItem } from '../domain/types';
import { statusTone } from './tones';

export async function SubmittalList({
  items,
  basePath,
  locale,
}: {
  items: readonly (SubmittalListItem & { readonly overdue: boolean })[];
  basePath: string;
  locale: string;
}) {
  const t = await getTranslations('submittals');
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b text-start text-[var(--pf-text-secondary)]">
              <th className="px-2 py-2 font-medium">{t('list.columns.number')}</th>
              <th className="px-2 py-2 font-medium">{t('list.columns.title')}</th>
              <th className="px-2 py-2 font-medium">{t('list.columns.type')}</th>
              <th className="px-2 py-2 font-medium">{t('list.columns.contractor')}</th>
              <th className="px-2 py-2 font-medium">{t('list.columns.revision')}</th>
              <th className="px-2 py-2 font-medium">{t('list.columns.status')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b hover:bg-[var(--pf-surface-hover)]">
                <td className="px-2 py-3">
                  <Link href={`${basePath}/${item.id}`} className="font-medium text-[var(--pf-text-brand)]">
                    {formatSubmittalNumber(item.number)}
                  </Link>
                </td>
                <td className="max-w-xs truncate px-2 py-3">{item.title}</td>
                <td className="px-2 py-3">{t(`type.${item.type}`)}</td>
                <td className="px-2 py-3">{item.vendorName}</td>
                <td className="px-2 py-3">{t('list.revision', { number: item.currentRevisionNumber })}</td>
                <td className="px-2 py-3">
                  <Badge tone={statusTone(submittalStatusTone(item.status, item.overdue))}>
                    {t(`status.${item.status}`)}
                  </Badge>
                  {item.overdue ? (
                    <Badge tone="danger" className="ms-2">
                      {t('list.overdue')}
                    </Badge>
                  ) : null}
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
                  <span className="font-semibold">{formatSubmittalNumber(item.number)}</span>
                  <Badge tone={statusTone(submittalStatusTone(item.status, item.overdue))}>
                    {t(`status.${item.status}`)}
                  </Badge>
                </div>
                <span className="text-base font-medium">{item.title}</span>
                <span className="text-sm text-[var(--pf-text-secondary)]">
                  {t(`type.${item.type}`)} · {item.vendorName} · {t('list.revision', { number: item.currentRevisionNumber })}
                </span>
                {item.dueDate ? (
                  <span className="text-sm text-[var(--pf-text-secondary)]">
                    {t('list.dueOn', { date: formatBusinessDate(item.dueDate as never, locale) })}
                  </span>
                ) : null}
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
