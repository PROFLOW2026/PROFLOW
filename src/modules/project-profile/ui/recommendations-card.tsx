'use client';

import { Lightbulb, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/shared/ui/cn';
import {
  groupByKind,
  type RecommendationTarget,
  type RecommendationWithStatus,
} from '../domain/recommendations';
import type { ProjectStructureActions } from './types';
import { useStructureAction } from './use-structure-action';

const STATUS_TONE = { open: 'info', accepted: 'success', dismissed: 'neutral' } as const;

export function RecommendationsCard({
  projectId,
  items,
  rulesetVersion,
  canManage,
  canCreateMilestones,
  canCreateTasks,
  actions,
}: {
  readonly projectId: string;
  readonly items: readonly RecommendationWithStatus[];
  readonly rulesetVersion: string;
  readonly canManage: boolean;
  readonly canCreateMilestones: boolean;
  readonly canCreateTasks: boolean;
  readonly actions: Pick<ProjectStructureActions, 'acceptRecommendations' | 'dismissRecommendations' | 'restoreRecommendations'>;
}) {
  const t = useTranslations('projectProfile');
  const action = useStructureAction();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [showDecided, setShowDecided] = useState(false);

  const targetAllowed = (target: RecommendationTarget) =>
    target === 'work_package' || (target === 'project_milestone' ? canCreateMilestones : canCreateTasks);
  const selectable = (item: RecommendationWithStatus) => canManage && item.status === 'open' && targetAllowed(item.target);

  const visible = useMemo(
    () => (showDecided ? items : items.filter((item) => item.status === 'open')),
    [items, showDecided],
  );
  const groups = useMemo(() => groupByKind(visible), [visible]);
  const selectedKeys = [...selected].filter((key) => items.some((item) => item.key === key && selectable(item)));
  const decidedCount = items.filter((item) => item.status !== 'open').length;

  const toggle = (key: string, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });

  const toggleGroup = (groupItems: readonly RecommendationWithStatus[], checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const item of groupItems) {
        if (!selectable(item)) continue;
        if (checked) next.add(item.key);
        else next.delete(item.key);
      }
      return next;
    });

  const clear = () => setSelected(new Set());

  const titleOf = (item: RecommendationWithStatus) =>
    t(`recommendations.items.${item.kind}.${item.code}`, { n: item.params.n ?? '' });

  if (items.length === 0) {
    return (
      <Card id="recommendations">
        <CardHeader>
          <CardTitle>{t('recommendations.title')}</CardTitle>
          <CardDescription>{t('recommendations.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Lightbulb}
            title={t('recommendations.empty')}
            description={t('recommendations.emptyDescription')}
            size="sm"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card id="recommendations">
      <CardHeader>
        <CardTitle>{t('recommendations.title')}</CardTitle>
        <CardDescription>{t('recommendations.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Alert tone="info" role="note">
          <p className="text-sm">{t('recommendations.nonFinancialNote')}</p>
        </Alert>

        {decidedCount > 0 ? (
          <label className="flex min-h-11 items-center gap-3" htmlFor="recommendations-show-decided">
            <Checkbox
              id="recommendations-show-decided"
              checked={showDecided}
              onCheckedChange={(checked) => setShowDecided(checked === true)}
            />
            <span className="text-sm">{t('recommendations.showDecided')}</span>
          </label>
        ) : null}

        {[...groups.entries()].map(([kind, groupItems]) => {
          if (groupItems.length === 0) return null;
          const openSelectable = groupItems.filter(selectable);
          const allSelected = openSelectable.length > 0 && openSelectable.every((item) => selected.has(item.key));
          return (
            <section key={kind} aria-labelledby={`recommendations-${kind}`} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 id={`recommendations-${kind}`} className="text-sm font-semibold">
                  {t(`recommendations.kinds.${kind}`)}{' '}
                  <span className="font-normal text-[var(--pf-text-secondary)]">({groupItems.length})</span>
                </h4>
                {openSelectable.length > 0 ? (
                  <label className="flex min-h-11 items-center gap-2 text-xs" htmlFor={`recommendations-all-${kind}`}>
                    <Checkbox
                      id={`recommendations-all-${kind}`}
                      checked={allSelected}
                      onCheckedChange={(checked) => toggleGroup(groupItems, checked === true)}
                    />
                    {t('recommendations.selectGroup')}
                  </label>
                ) : null}
              </div>
              <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {groupItems.map((item) => {
                  const checkboxId = `recommendation-${item.key.replace(/[^a-z0-9]/g, '-')}`;
                  const canSelect = selectable(item);
                  return (
                    <li
                      key={item.key}
                      className={cn(
                        'flex items-start gap-3 rounded-md border border-[var(--pf-border-default)] p-3',
                        item.status !== 'open' && 'bg-[var(--pf-bg-muted)]',
                      )}
                    >
                      {canSelect ? (
                        <Checkbox
                          id={checkboxId}
                          className="mt-0.5"
                          checked={selected.has(item.key)}
                          onCheckedChange={(checked) => toggle(item.key, checked === true)}
                        />
                      ) : null}
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <label htmlFor={canSelect ? checkboxId : undefined} className="text-sm font-medium">
                          {titleOf(item)}
                        </label>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--pf-text-secondary)]">
                          <span>{t('recommendations.why')}</span>
                          {item.reasons.map((reason) => (
                            <Badge key={reason} tone="neutral">
                              {t(`reasons.${reason}`)}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge tone={STATUS_TONE[item.status]}>{t(`recommendations.status.${item.status}`)}</Badge>
                          <span className="text-[var(--pf-text-muted)]">{t(`recommendations.targets.${item.target}`)}</span>
                        </div>
                      </div>
                      {canManage && item.status === 'dismissed' ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={action.pending}
                          onClick={() =>
                            action.run(
                              actions.restoreRecommendations,
                              { projectId, keys: [item.key] },
                              () => t('recommendations.restoredToast'),
                            )
                          }
                        >
                          <RotateCcw aria-hidden />
                          {t('recommendations.restore')}
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        {action.error ? (
          <Alert tone="danger" role="alert">
            <p className="text-sm">{action.error}</p>
          </Alert>
        ) : null}
        {action.status ? <p role="status" className="text-sm text-[var(--pf-status-success-fg)]">{action.status}</p> : null}

        {canManage ? (
          <div className="sticky bottom-[calc(var(--pf-bottomnav-total-height,0px)+0.5rem)] z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-3 shadow-sm lg:bottom-4">
            <span className="text-sm" role="status">
              {t('recommendations.selected', { count: selectedKeys.length })}
            </span>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <Button
                type="button"
                variant="secondary"
                className="flex-1 sm:flex-none"
                disabled={selectedKeys.length === 0 || action.pending}
                onClick={() =>
                  action.run(
                    actions.dismissRecommendations,
                    { projectId, keys: selectedKeys },
                    (result) => t('recommendations.dismissedToast', { count: result.count ?? selectedKeys.length }),
                    clear,
                  )
                }
              >
                {t('recommendations.dismiss')}
              </Button>
              <Button
                type="button"
                className="flex-1 sm:flex-none"
                loading={action.pending}
                disabled={selectedKeys.length === 0}
                onClick={() =>
                  action.run(
                    actions.acceptRecommendations,
                    { projectId, keys: selectedKeys },
                    (result) => t('recommendations.acceptedToast', { count: result.count ?? selectedKeys.length }),
                    clear,
                  )
                }
              >
                {t('recommendations.accept')}
              </Button>
            </div>
          </div>
        ) : null}

        <p className="text-xs text-[var(--pf-text-muted)]">{t('recommendations.ruleset', { version: rulesetVersion })}</p>
      </CardContent>
    </Card>
  );
}
