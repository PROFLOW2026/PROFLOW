'use client';

import { useRouter } from '@/shared/i18n/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { saveScheduleBaselineAction } from './baseline-actions';

export interface PlanningBaselineComparisonRow {
  readonly workItemId: string;
  readonly name: string;
  readonly baselineStartDate: string | null;
  readonly currentStartDate: string | null;
  readonly baselineTargetEndDate: string | null;
  readonly currentTargetEndDate: string | null;
  readonly startDeltaDays: number | null;
  readonly targetEndDeltaDays: number | null;
}

export interface PlanningBaselinePanelProps {
  readonly projectId: string;
  readonly canWrite: boolean;
  readonly latestBaselineCreatedAtIso: string | null;
  readonly latestBaselineLabel: string | null;
  readonly comparisonRows: readonly PlanningBaselineComparisonRow[];
  readonly messages: {
    readonly title: string;
    readonly description: string;
    readonly save: string;
    readonly label: string;
    readonly empty: string;
    readonly savedAt: string;
    readonly compareTitle: string;
    readonly colName: string;
    readonly colBaselineStart: string;
    readonly colCurrentStart: string;
    readonly colBaselineEnd: string;
    readonly colCurrentEnd: string;
    readonly colStartDelta: string;
    readonly colEndDelta: string;
    readonly error: string;
  };
}

function formatDelta(days: number | null): string {
  if (days == null) return '—';
  if (days === 0) return '0';
  return days > 0 ? `+${days}` : String(days);
}

export function PlanningBaselinePanel({
  projectId,
  canWrite,
  latestBaselineCreatedAtIso,
  latestBaselineLabel,
  comparisonRows,
  messages,
}: PlanningBaselinePanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const label = String(data.get('label') ?? '').trim();
    setError(null);
    startTransition(async () => {
      const result = await saveScheduleBaselineAction({ projectId, label: label || null });
      if (!result.ok) {
        setError(messages.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.title}</CardTitle>
        <CardDescription>{messages.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {latestBaselineCreatedAtIso ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">
            {messages.savedAt}
            {latestBaselineLabel ? ` — ${latestBaselineLabel}` : ''}
            {' · '}
            {latestBaselineCreatedAtIso.slice(0, 10)}
          </p>
        ) : (
          <p className="text-sm text-[var(--pf-text-secondary)]">{messages.empty}</p>
        )}

        {canWrite ? (
          <form className="flex flex-wrap items-end gap-3" onSubmit={onSave}>
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm">
              <span>{messages.label}</span>
              <Input name="label" type="text" maxLength={200} disabled={pending} />
            </label>
            <Button type="submit" disabled={pending}>
              {messages.save}
            </Button>
          </form>
        ) : null}

        {error ? (
          <p className="text-sm text-[var(--pf-text-danger)]" role="alert">
            {error}
          </p>
        ) : null}

        {comparisonRows.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-[var(--pf-text-primary)]">
              {messages.compareTitle}
            </h3>
            <div className="overflow-x-auto rounded-md border border-[var(--pf-border-default)]">
              <table className="min-w-full text-start text-sm">
                <thead className="bg-[var(--pf-bg-muted)] text-[var(--pf-text-secondary)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">{messages.colName}</th>
                    <th className="px-3 py-2 font-medium">{messages.colBaselineStart}</th>
                    <th className="px-3 py-2 font-medium">{messages.colCurrentStart}</th>
                    <th className="px-3 py-2 font-medium">{messages.colStartDelta}</th>
                    <th className="px-3 py-2 font-medium">{messages.colBaselineEnd}</th>
                    <th className="px-3 py-2 font-medium">{messages.colCurrentEnd}</th>
                    <th className="px-3 py-2 font-medium">{messages.colEndDelta}</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row) => (
                    <tr key={row.workItemId} className="border-t border-[var(--pf-border-default)]">
                      <td className="px-3 py-2">{row.name}</td>
                      <td className="px-3 py-2">{row.baselineStartDate ?? '—'}</td>
                      <td className="px-3 py-2">{row.currentStartDate ?? '—'}</td>
                      <td className="px-3 py-2">{formatDelta(row.startDeltaDays)}</td>
                      <td className="px-3 py-2">{row.baselineTargetEndDate ?? '—'}</td>
                      <td className="px-3 py-2">{row.currentTargetEndDate ?? '—'}</td>
                      <td className="px-3 py-2">{formatDelta(row.targetEndDeltaDays)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
