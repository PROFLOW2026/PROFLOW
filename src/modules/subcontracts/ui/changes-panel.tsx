import { getLocale, getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { bidiIsolate, formatMoneyString } from '@/shared/money';
import type { ChangeView, WorkLineOperationalView } from '../domain/types';
import { ChangeStatusBadge } from './status';

/** Change list shared by the internal changes page and the contractor portal. */
export async function ChangesPanel({
  changes,
  lines,
  renderActions,
}: {
  changes: readonly ChangeView[];
  lines: readonly Pick<WorkLineOperationalView, 'id' | 'code' | 'description'>[];
  renderActions?: (change: ChangeView) => React.ReactNode;
}) {
  const t = await getTranslations('subcontracts');
  const locale = await getLocale();
  const lineLabel = new Map(lines.map((line) => [line.id, line.code ? `${line.code} · ${line.description}` : line.description]));
  if (changes.length === 0) {
    return <EmptyState size="sm" title={t('changes.emptyTitle')} description={t('changes.emptyDescription')} />;
  }
  return (
    <ul className="flex flex-col gap-4">
      {changes.map((change) => (
        <li key={change.id} className="rounded-lg border border-[var(--pf-border-subtle)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold break-words">
                {bidiIsolate(`#${change.changeNumber}`)} {change.title}
              </p>
              <p className="text-xs text-[var(--pf-text-muted)]">
                {[
                  t(`changeTypes.${change.changeType}`),
                  t(`origins.${change.origin}`),
                  change.timeExtensionDays ? t('changes.extensionDays', { days: change.timeExtensionDays }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <ChangeStatusBadge status={change.status} label={t(`changeStatus.${change.status}`)} />
          </div>
          {change.description ? <p className="mt-2 whitespace-pre-line text-sm">{change.description}</p> : null}
          {change.decisionReason ? (
            <p className="mt-2 text-sm text-[var(--pf-text-secondary)]">
              {t('changes.decisionReason')}: {change.decisionReason}
            </p>
          ) : null}
          {change.versions ? (
            change.versions.length === 0 ? (
              <p className="mt-3 text-xs text-[var(--pf-text-muted)]">{t('versions.none')}</p>
            ) : (
              <ol className="mt-3 flex flex-col gap-2">
                {change.versions.map((version) => (
                  <li
                    key={version.id}
                    className={`rounded-md border p-3 text-sm ${
                      change.approvedVersionId === version.id
                        ? 'border-[var(--pf-status-success-border)] bg-[var(--pf-status-success-bg)]'
                        : 'border-[var(--pf-border-subtle)]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {t('versions.label', { no: version.versionNo })} · {t(`actors.${version.actorType}`)}
                      </span>
                      <span className="font-semibold">{bidiIsolate(formatMoneyString(version.amount, version.currency, locale))}</span>
                    </div>
                    {version.note ? <p className="mt-1 text-[var(--pf-text-secondary)]">{version.note}</p> : null}
                    {version.lines.length > 0 ? (
                      <ul className="mt-2 flex flex-col gap-1 text-xs">
                        {version.lines.map((line) => (
                          <li key={line.id} className="flex flex-wrap justify-between gap-2">
                            <span className="min-w-0 break-words">
                              {line.workLineId ? (lineLabel.get(line.workLineId) ?? '—') : `${t('versions.newLine')}: ${line.newLineDescription}`}
                              {Number(line.quantityDelta) !== 0 ? ` · ${bidiIsolate(`${Number(line.quantityDelta) > 0 ? '+' : ''}${Number(line.quantityDelta)}`)}` : ''}
                            </span>
                            <span>{bidiIsolate(formatMoneyString(line.amountDelta, version.currency, locale))}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ol>
            )
          ) : null}
          {renderActions ? <div className="mt-3">{renderActions(change)}</div> : null}
        </li>
      ))}
    </ul>
  );
}
