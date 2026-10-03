'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Link } from '@/shared/i18n/navigation';
import type { InspectionListItem } from '../domain/types';
import { inspectionOutcomeTone, inspectionStatusTone } from './tones';

export function InspectionList({
  items,
  basePath,
}: {
  readonly items: readonly InspectionListItem[];
  readonly basePath: string;
}) {
  const t = useTranslations('inspections');
  if (items.length === 0) {
    return <p className="text-sm text-[var(--pf-text-secondary)]">{t('list.empty')}</p>;
  }
  return (
    <>
      <ul className="flex flex-col gap-3 md:hidden">
        {items.map((item) => (
          <li key={item.id}>
            <Link href={`${basePath}/${item.id}`} className="block rounded-lg border border-[var(--pf-border-subtle)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 font-medium">
                  <span className="pf-numeric text-[var(--pf-text-secondary)]">#{item.referenceNo} </span>
                  {item.title}
                </p>
                <Badge tone={inspectionStatusTone(item.status)}>{t(`status.${item.status}`)}</Badge>
              </div>
              <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">
                {item.scheduledFor ? t('list.scheduled', { date: item.scheduledFor }) : t('list.notScheduled')}
                {item.outcome ? ` · ${t(`outcome.${item.outcome}`)}` : ''}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-lg border border-[var(--pf-border-subtle)] md:block">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-[var(--pf-bg-muted)] text-start">
            <tr>
              <th className="px-3 py-2 font-medium">{t('fields.reference')}</th>
              <th className="px-3 py-2 font-medium">{t('fields.title')}</th>
              <th className="px-3 py-2 font-medium">{t('fields.category')}</th>
              <th className="px-3 py-2 font-medium">{t('filters.status')}</th>
              <th className="px-3 py-2 font-medium">{t('fields.outcome')}</th>
              <th className="px-3 py-2 font-medium">{t('fields.scheduledFor')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-[var(--pf-border-subtle)]">
                <td className="px-3 py-2 tabular-nums">
                  <Link href={`${basePath}/${item.id}`} className="font-medium text-[var(--pf-text-brand)] hover:underline">
                    #{item.referenceNo}
                  </Link>
                </td>
                <td className="px-3 py-2">{item.title}</td>
                <td className="px-3 py-2">{t(`category.${item.category}` as 'category.general')}</td>
                <td className="px-3 py-2">
                  <Badge tone={inspectionStatusTone(item.status)}>{t(`status.${item.status}`)}</Badge>
                </td>
                <td className="px-3 py-2">
                  {item.outcome ? (
                    <Badge tone={inspectionOutcomeTone(item.outcome)}>{t(`outcome.${item.outcome}`)}</Badge>
                  ) : (
                    t('outcome.none')
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{item.scheduledFor ?? t('list.notScheduled')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
