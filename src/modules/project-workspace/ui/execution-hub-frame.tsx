import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import type { ExecutionHubChildLink, ExecutionHubKey } from '@/modules/project-workspace/domain/execution-hubs';
import { Link } from '@/shared/i18n/navigation';

export interface ExecutionHubStageRow {
  readonly id: string;
  readonly agreementId: string;
  readonly code: string | null;
  readonly description: string;
  readonly lineType: string;
  readonly weightPercent: string | null;
  readonly plannedStart: string | null;
  readonly plannedEnd: string | null;
}

export function groupHubChildren<T extends { readonly groupKey: string }>(
  children: readonly T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const child of children) {
    const bucket = groups.get(child.groupKey);
    if (bucket) bucket.push(child);
    else groups.set(child.groupKey, [child]);
  }
  return groups;
}

/** Shared hub presentation. Callers load their own data and pass it in. */
export async function ExecutionHubFrame({
  hub,
  root,
  groups,
  footer,
  stages,
  titles,
  compact = false,
}: {
  readonly hub: Exclude<ExecutionHubKey, 'overview' | 'team'>;
  readonly root: string;
  readonly groups: ReadonlyMap<string, readonly (ExecutionHubChildLink & { readonly href: string })[]>;
  readonly footer?: ReactNode;
  readonly stages?: readonly ExecutionHubStageRow[];
  readonly titles?: ReadonlyMap<string, string>;
  readonly compact?: boolean;
}) {
  const t = await getTranslations('projectWorkspace');

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {compact ? null : (
        <PageHeader
          title={t(`execution.hubs.${hub}` as never)}
          description={
            hub === 'contractors' ? undefined : t(`execution.hubDescriptions.${hub}` as never)
          }
        />
      )}

      {hub === 'payments' ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('execution.financialHint')}</p>
      ) : null}

      {hub === 'planning' ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('execution.planningHint')}</p>
      ) : null}

      {[...groups.entries()].map(([groupKey, links]) => (
        <section key={groupKey} className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-semibold text-[var(--pf-text-primary)]">
            {t(`execution.hubGroups.${groupKey}` as never)}
          </h2>
          <ul className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
            {links.map((link) => (
              <li key={link.id} className="min-w-0">
                <Link
                  href={link.href}
                  className="flex min-h-11 items-center rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 py-2 text-sm font-medium text-[var(--pf-text-primary)] hover:bg-[var(--pf-action-subtle-hover)]"
                >
                  {t(`execution.hubLinks.${link.labelKey}` as never)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {footer}

      {stages ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('execution.paymentStages.title')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('execution.paymentStages.hint')}</p>
            {stages.length === 0 ? (
              <EmptyState size="sm" title={t('execution.paymentStages.emptyTitle')} description={t('execution.paymentStages.emptyDescription')} />
            ) : (
              <ul className="flex flex-col gap-2">
                {stages.map((stage) => (
                  <li key={stage.id} className="min-w-0 rounded-lg border border-[var(--pf-border-subtle)] p-3">
                    <Link href={`${root}/contractors/${stage.agreementId}/lines`} className="font-medium break-words">
                      {stage.code ? `${stage.code} · ` : ''}
                      {stage.description}
                    </Link>
                    <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                      {titles?.get(stage.agreementId) ?? t('contractors.unknownVendor')}
                      {' · '}
                      {t(`execution.paymentStages.types.${stage.lineType}` as never)}
                      {stage.weightPercent ? ` · ${t('execution.paymentStages.weight', { weight: stage.weightPercent })}` : ''}
                      {stage.plannedStart ? ` · ${stage.plannedStart}` : ''}
                      {stage.plannedEnd ? ` – ${stage.plannedEnd}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
