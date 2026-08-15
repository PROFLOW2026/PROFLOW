'use client';

import { useActionState, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MoneyText } from '@/components/patterns/money-text';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { fromNumericString, type MoneyValue } from '@/shared/money';
import { cn } from '@/shared/ui/cn';
import type { ContractBoqReconStatus } from '../domain/types';
import {
  activateBoqAction,
  allocateApprovedChangeToBoqAction,
  approveProgressBatchAction,
  createProgressBatchAction,
  createProgressBillingAction,
  createProjectBoqAction,
  removeBoqNodeAction,
  upsertBoqNodeAction,
  type BoqFormState,
} from './actions';

export interface BoqPanelNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly nodeKind: 'chapter' | 'item';
  readonly itemCode: string | null;
  readonly description: string;
  readonly unit: string | null;
  readonly currentQuantity: string;
  readonly currentUnitPrice: string;
  readonly currentAmount: string;
  readonly originalQuantity: string;
  readonly originalAmount: string;
  readonly sortOrder: number;
  readonly status: string;
}

export interface BoqPanelBatchLine {
  readonly id: string;
  readonly boqNodeId: string;
  readonly measuredQuantity: string;
  readonly approvedQuantity: string;
  readonly periodAmount: string;
  readonly previousApprovedQuantity: string;
}

export interface BoqPanelBatch {
  readonly id: string;
  readonly certificateNumber: number;
  readonly periodLabel: string;
  readonly status: string;
  readonly lines: readonly BoqPanelBatchLine[];
}

export interface BoqPanelClientProps {
  readonly projectId: string;
  readonly currency: string;
  readonly boq: {
    readonly id: string;
    readonly status: string;
    readonly title: string | null;
    readonly progressMode: string;
    readonly versionNumber: number;
  } | null;
  readonly nodes: readonly BoqPanelNode[];
  readonly batches: readonly BoqPanelBatch[];
  readonly totals: {
    readonly original: MoneyValue;
    readonly current: MoneyValue;
  };
  readonly reconciliation: {
    readonly status: ContractBoqReconStatus;
    readonly originalContract: MoneyValue;
    readonly originalBoq: MoneyValue;
    readonly currentContract: MoneyValue;
    readonly currentBoq: MoneyValue;
    readonly approvedChanges: MoneyValue;
    readonly allocatedApprovedChanges: MoneyValue;
    readonly unallocatedApprovedChanges: MoneyValue;
  } | null;
  readonly reconUnavailable?: boolean;
  readonly changeOrders?: readonly {
    readonly id: string;
    readonly label: string;
    readonly amount: string;
    readonly direction: string;
  }[];
  readonly allocations?: readonly {
    readonly id: string;
    readonly changeOrderId: string;
    readonly allocationKind: string;
    readonly quantityDelta: string;
    readonly amountDelta: string;
    readonly boqNodeId: string | null;
  }[];
  readonly permissions: {
    readonly canManage: boolean;
    readonly canSubmitProgress: boolean;
    readonly canApproveProgress: boolean;
    readonly canCreateBilling: boolean;
    readonly showAmounts: boolean;
  };
  readonly contracts?: readonly {
    readonly id: string;
    readonly name: string | null;
    readonly contractNumber: string | null;
    readonly isPrimary: boolean;
  }[];
  readonly selectedContractId?: string | null;
}

type KindFilter = 'all' | 'chapter' | 'item';

interface FlatNode {
  readonly node: BoqPanelNode;
  readonly depth: number;
}

function flattenTree(nodes: readonly BoqPanelNode[]): FlatNode[] {
  const byParent = new Map<string | null, BoqPanelNode[]>();
  for (const node of nodes) {
    if (node.status === 'archived' || node.status === 'cancelled') continue;
    const key = node.parentId;
    const list = byParent.get(key) ?? [];
    list.push(node);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.description.localeCompare(b.description));
  }
  const out: FlatNode[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const node of byParent.get(parentId) ?? []) {
      out.push({ node, depth });
      walk(node.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

function ActionMessage({ state }: { state: BoqFormState }) {
  if (!state.error && !state.message) return null;
  return (
    <p
      className={cn(
        'text-sm text-start',
        state.error ? 'text-[var(--pf-status-danger-fg)]' : 'text-[var(--pf-text-secondary)]',
      )}
      role={state.error ? 'alert' : undefined}
    >
      {state.error ?? state.message}
    </p>
  );
}

export function BoqPanelClient({
  projectId,
  currency,
  boq,
  nodes,
  batches,
  totals,
  reconciliation,
  reconUnavailable = false,
  changeOrders = [],
  allocations = [],
  permissions,
  contracts = [],
  selectedContractId = null,
}: BoqPanelClientProps) {
  const t = useTranslations('boq');
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [historyNodeId, setHistoryNodeId] = useState<string | null>(null);
  const [progressLines, setProgressLines] = useState<Record<string, string>>({});

  const [createState, createAction, createPending] = useActionState(createProjectBoqAction, {});
  const [nodeState, nodeAction, nodePending] = useActionState(upsertBoqNodeAction, {});
  const [activateState, activateAction, activatePending] = useActionState(activateBoqAction, {});
  const [removeState, removeAction, removePending] = useActionState(removeBoqNodeAction, {});
  const [progressState, progressAction, progressPending] = useActionState(
    createProgressBatchAction,
    {},
  );
  const [approveState, approveAction, approvePending] = useActionState(
    approveProgressBatchAction,
    {},
  );
  const [billState, billAction, billPending] = useActionState(createProgressBillingAction, {});
  const [allocateState, allocateAction, allocatePending] = useActionState(
    allocateApprovedChangeToBoqAction,
    {},
  );

  const flat = useMemo(() => flattenTree(nodes), [nodes]);
  const chapters = useMemo(
    () => nodes.filter((node) => node.nodeKind === 'chapter' && node.status === 'active'),
    [nodes],
  );
  const items = useMemo(
    () => nodes.filter((node) => node.nodeKind === 'item' && node.status === 'active'),
    [nodes],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return flat.filter(({ node }) => {
      if (kindFilter !== 'all' && node.nodeKind !== kindFilter) return false;
      if (!q) return true;
      const hay = `${node.itemCode ?? ''} ${node.description}`.toLowerCase();
      return hay.includes(q);
    });
  }, [flat, kindFilter, query]);

  const historyLines = useMemo(() => {
    if (!historyNodeId) return [];
    const rows: { batch: BoqPanelBatch; line: BoqPanelBatchLine }[] = [];
    for (const batch of batches) {
      for (const line of batch.lines) {
        if (line.boqNodeId === historyNodeId) rows.push({ batch, line });
      }
    }
    return rows;
  }, [batches, historyNodeId]);

  if (!boq) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('panel.simpleModeHint')}</p>
        {permissions.canManage ? (
          <form action={createAction} className="flex min-w-0 flex-col gap-3 rounded-md border border-[var(--pf-border-default)] p-3">
            <input type="hidden" name="projectId" value={projectId} />
            {contracts.length > 1 ? (
              <Field label={t('forms.contract')}>
                {(controlProps) => (
                  <select
                    {...controlProps}
                    name="contractId"
                    defaultValue={selectedContractId ?? contracts.find((row) => row.isPrimary)?.id ?? ''}
                    className="w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
                  >
                    {contracts.map((contract) => (
                      <option key={contract.id} value={contract.id}>
                        {contract.name ??
                          contract.contractNumber ??
                          (contract.isPrimary ? t('forms.contractPrimary') : contract.id.slice(0, 8))}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            ) : selectedContractId ? (
              <input type="hidden" name="contractId" value={selectedContractId} />
            ) : null}
            <Field label={t('forms.title')}>
              {(controlProps) => (
                <input
                  {...controlProps}
                  name="title"
                  className="w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
                />
              )}
            </Field>
            <Field label={t('forms.progressMode')}>
              {(controlProps) => (
                <select
                  {...controlProps}
                  name="progressMode"
                  defaultValue="simple"
                  className="w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
                >
                  <option value="simple">{t('forms.progressModeSimple')}</option>
                  <option value="advanced">{t('forms.progressModeAdvanced')}</option>
                </select>
              )}
            </Field>
            <Field label={t('forms.notes')}>
              {(controlProps) => (
                <textarea
                  {...controlProps}
                  name="notes"
                  rows={2}
                  className="w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
                />
              )}
            </Field>
            <Button type="submit" disabled={createPending} loading={createPending}>
              {t('panel.emptyAction')}
            </Button>
            <ActionMessage state={createState} />
          </form>
        ) : null}
      </div>
    );
  }

  const isDraft = boq.status === 'draft';
  const isActive = boq.status === 'active';

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('panel.simpleModeHint')}</p>
      {!permissions.showAmounts ? (
        <p className="text-xs text-[var(--pf-text-muted)]">{t('permissions.amountsHidden')}</p>
      ) : null}

      {permissions.showAmounts ? (
        <section className="grid min-w-0 gap-3 rounded-md border border-[var(--pf-border-default)] p-3 sm:grid-cols-2">
          <div className="min-w-0 text-start">
            <p className="text-xs text-[var(--pf-text-muted)]">{t('totals.original')}</p>
            <p className="text-lg font-semibold">
              <MoneyText value={totals.original} />
            </p>
          </div>
          <div className="min-w-0 text-start">
            <p className="text-xs text-[var(--pf-text-muted)]">{t('totals.current')}</p>
            <p className="text-lg font-semibold">
              <MoneyText value={totals.current} />
            </p>
          </div>
          <p className="sm:col-span-2 text-xs text-[var(--pf-text-muted)]">
            {t('status.' + (boq.status as 'draft'))} · v{boq.versionNumber}
            {boq.title ? ` · ${boq.title}` : null}
            {' · '}
            {t('totals.currency')}: <span dir="ltr">{currency}</span>
          </p>
        </section>
      ) : (
        <p className="text-xs text-[var(--pf-text-muted)]">
          {t('status.' + (boq.status as 'draft'))} · v{boq.versionNumber}
          {boq.title ? ` · ${boq.title}` : null}
        </p>
      )}

      {permissions.showAmounts && reconciliation ? (
        <section className="flex min-w-0 flex-col gap-2 rounded-md border border-[var(--pf-border-default)] p-3">
          <h3 className="text-sm font-semibold">{t('recon.title')}</h3>
          <p className="text-xs text-[var(--pf-text-muted)]">
            {t(`recon.status.${reconciliation.status}`)}
          </p>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(
              [
                ['originalContract', reconciliation.originalContract],
                ['originalBoq', reconciliation.originalBoq],
                ['currentContract', reconciliation.currentContract],
                ['currentBoq', reconciliation.currentBoq],
                ['approvedChanges', reconciliation.approvedChanges],
                ['allocated', reconciliation.allocatedApprovedChanges],
                ['unallocated', reconciliation.unallocatedApprovedChanges],
              ] as const
            ).map(([key, value]) => (
              <div key={key} className="min-w-0 text-start">
                <dt className="text-xs text-[var(--pf-text-muted)]">{t(`recon.${key}`)}</dt>
                <dd className="text-sm font-medium">
                  <MoneyText value={value} colorizeNegative />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : permissions.showAmounts && reconUnavailable ? (
        <p className="text-xs text-[var(--pf-text-muted)]">{t('recon.unavailable')}</p>
      ) : null}

      {isDraft && permissions.canManage ? (
        <form action={activateAction} className="flex min-w-0 flex-col gap-2 rounded-md border border-[var(--pf-border-default)] p-3">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="boqId" value={boq.id} />
          <p className="text-xs text-[var(--pf-text-muted)]">{t('forms.activateHint')}</p>
          <Button type="submit" disabled={activatePending || items.length === 0} loading={activatePending}>
            {t('forms.activate')}
          </Button>
          <ActionMessage state={activateState} />
        </form>
      ) : null}

      <section className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h3 className="text-sm font-semibold">{t('nodes.title')}</h3>
          <div className="flex min-w-0 flex-wrap gap-2">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('nodes.search')}
              className="min-h-11 min-w-0 flex-1 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm sm:max-w-xs"
            />
            {(['all', 'chapter', 'item'] as const).map((key) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={kindFilter === key ? 'primary' : 'secondary'}
                onClick={() => setKindFilter(key)}
              >
                {key === 'all'
                  ? t('nodes.filterAll')
                  : key === 'chapter'
                    ? t('nodes.filterChapters')
                    : t('nodes.filterItems')}
              </Button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('nodes.empty')}</p>
        ) : (
          <ul className="flex min-w-0 flex-col gap-2">
            {filtered.map(({ node, depth }) => (
              <li
                key={node.id}
                className="min-w-0 rounded-md border border-[var(--pf-border-default)] p-3 text-start"
                style={{ marginInlineStart: `${Math.min(depth, 4) * 0.75}rem` }}
              >
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs text-[var(--pf-text-muted)]">
                      {node.nodeKind === 'chapter' ? t('nodes.chapter') : t('nodes.item')}
                      {node.itemCode ? ` · ${node.itemCode}` : null}
                      {node.unit ? ` · ${node.unit}` : null}
                    </p>
                    <p className="text-sm font-medium">{node.description}</p>
                    <p className="text-xs text-[var(--pf-text-muted)]">
                      {t('nodes.currentQty')}: <span dir="ltr">{node.currentQuantity}</span>
                    </p>
                    {permissions.showAmounts ? (
                      <p className="text-xs text-[var(--pf-text-secondary)]">
                        {t('nodes.unitPrice')}:{' '}
                        <MoneyText
                          value={
                            fromNumericString(node.currentUnitPrice, currency) ??
                            fromNumericString('0', currency)!
                          }
                        />{' '}
                        · {t('nodes.amount')}:{' '}
                        <MoneyText
                          value={
                            fromNumericString(node.currentAmount, currency) ??
                            fromNumericString('0', currency)!
                          }
                        />
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {node.nodeKind === 'item' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setHistoryNodeId((current) => (current === node.id ? null : node.id))
                        }
                      >
                        {t('nodes.history')}
                      </Button>
                    ) : null}
                    {isDraft && permissions.canManage ? (
                      <form action={removeAction}>
                        <input type="hidden" name="projectId" value={projectId} />
                        <input type="hidden" name="nodeId" value={node.id} />
                        <Button
                          type="submit"
                          size="sm"
                          variant="dangerGhost"
                          disabled={removePending}
                        >
                          {t('forms.removeNode')}
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </div>
                {historyNodeId === node.id ? (
                  <div className="mt-2 border-t border-[var(--pf-border-default)] pt-2">
                    {historyLines.length === 0 ? (
                      <p className="text-xs text-[var(--pf-text-muted)]">{t('nodes.noHistory')}</p>
                    ) : (
                      <ul className="flex flex-col gap-1 text-xs">
                        {historyLines.map(({ batch, line }) => (
                          <li key={line.id} className="text-start text-[var(--pf-text-secondary)]">
                            {t('progress.certificate', { number: batch.certificateNumber })} ·{' '}
                            {batch.periodLabel} · {t(`batchStatus.${batch.status as 'draft'}`)} ·{' '}
                            <span dir="ltr">{line.approvedQuantity}</span>
                            {permissions.showAmounts ? (
                              <>
                                {' · '}
                                <MoneyText
                                  value={
                                    fromNumericString(line.periodAmount, currency) ??
                                    fromNumericString('0', currency)!
                                  }
                                />
                              </>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <ActionMessage state={removeState} />
      </section>

      {isDraft && permissions.canManage ? (
        <form
          action={nodeAction}
          className="flex min-w-0 flex-col gap-3 rounded-md border border-[var(--pf-border-default)] p-3"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="boqId" value={boq.id} />
          <h3 className="text-sm font-semibold">{t('forms.addItem')}</h3>
          <Field label={t('nodes.chapter') + ' / ' + t('nodes.item')}>
            {(controlProps) => (
              <select
                {...controlProps}
                name="nodeKind"
                defaultValue="item"
                className="w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
              >
                <option value="chapter">{t('forms.addChapter')}</option>
                <option value="item">{t('forms.addItem')}</option>
              </select>
            )}
          </Field>
          <Field label={t('forms.parentChapter')}>
            {(controlProps) => (
              <select
                {...controlProps}
                name="parentId"
                defaultValue=""
                className="w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
              >
                <option value="">{t('forms.noParent')}</option>
                {chapters.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapter.description}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t('nodes.code')}>
            {(controlProps) => (
              <input
                {...controlProps}
                name="itemCode"
                className="w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
              />
            )}
          </Field>
          <Field label={t('nodes.description')} required>
            {(controlProps) => (
              <input
                {...controlProps}
                name="description"
                required
                className="w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
              />
            )}
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('nodes.unit')}>
              {(controlProps) => (
                <input
                  {...controlProps}
                  name="unit"
                  className="w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
                />
              )}
            </Field>
            <Field label={t('forms.quantity')}>
              {(controlProps) => (
                <input
                  {...controlProps}
                  name="quantity"
                  inputMode="decimal"
                  defaultValue="0"
                  className="w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
                  dir="ltr"
                />
              )}
            </Field>
            {permissions.showAmounts ? (
              <Field label={t('forms.unitPrice')}>
                {(controlProps) => (
                  <input
                    {...controlProps}
                    name="unitPrice"
                    inputMode="decimal"
                    defaultValue="0"
                    className="w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
                    dir="ltr"
                  />
                )}
              </Field>
            ) : (
              <input type="hidden" name="unitPrice" value="0" />
            )}
          </div>
          <Button type="submit" disabled={nodePending} loading={nodePending}>
            {t('forms.saveNode')}
          </Button>
          <ActionMessage state={nodeState} />
        </form>
      ) : null}

      {isActive ? (
        <section className="flex min-w-0 flex-col gap-4">
          <div className="min-w-0 text-start">
            <h3 className="text-sm font-semibold">{t('progress.title')}</h3>
            <p className="text-xs text-[var(--pf-text-muted)]">{t('progress.description')}</p>
          </div>

          {permissions.canSubmitProgress ? (
            <form
              action={progressAction}
              className="flex min-w-0 flex-col gap-3 rounded-md border border-[var(--pf-border-default)] p-3"
            >
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="boqId" value={boq.id} />
              <h4 className="text-sm font-medium">{t('progress.createTitle')}</h4>
              <Field label={t('progress.periodLabel')} required>
                {(controlProps) => (
                  <input
                    {...controlProps}
                    name="periodLabel"
                    required
                    className="w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
                  />
                )}
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('progress.periodStart')}>
                  {(controlProps) => (
                    <input
                      {...controlProps}
                      type="date"
                      name="periodStart"
                      className="w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
                    />
                  )}
                </Field>
                <Field label={t('progress.periodEnd')}>
                  {(controlProps) => (
                    <input
                      {...controlProps}
                      type="date"
                      name="periodEnd"
                      className="w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
                    />
                  )}
                </Field>
              </div>
              <p className="text-xs text-[var(--pf-text-muted)]">{t('progress.selectItems')}</p>
              <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
                {items.map((item) => {
                  const qty = progressLines[item.id] ?? '';
                  const included = qty.trim().length > 0;
                  return (
                    <li
                      key={item.id}
                      className="rounded-md border border-[var(--pf-border-default)] p-2"
                    >
                      <p className="text-sm font-medium">{item.description}</p>
                      <p className="text-xs text-[var(--pf-text-muted)]">
                        {t('nodes.currentQty')}: <span dir="ltr">{item.currentQuantity}</span>
                      </p>
                      <label className="mt-2 block text-xs text-[var(--pf-text-secondary)]">
                        {t('progress.measuredQty')}
                        <input
                          name={included ? 'measuredQuantity' : undefined}
                          value={qty}
                          onChange={(event) =>
                            setProgressLines((current) => ({
                              ...current,
                              [item.id]: event.target.value,
                            }))
                          }
                          inputMode="decimal"
                          className="mt-1 w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
                          dir="ltr"
                        />
                      </label>
                      {included ? <input type="hidden" name="boqNodeId" value={item.id} /> : null}
                    </li>
                  );
                })}
              </ul>
              <Button type="submit" disabled={progressPending} loading={progressPending}>
                {t('progress.submit')}
              </Button>
              <ActionMessage state={progressState} />
            </form>
          ) : null}

          <div className="flex min-w-0 flex-col gap-2">
            <h4 className="text-sm font-medium">{t('progress.batchesTitle')}</h4>
            {batches.length === 0 ? (
              <p className="text-sm text-[var(--pf-text-secondary)]">{t('progress.emptyBatches')}</p>
            ) : (
              <ul className="flex min-w-0 flex-col gap-2">
                {batches.map((batch) => (
                  <li
                    key={batch.id}
                    className="flex min-w-0 flex-col gap-2 rounded-md border border-[var(--pf-border-default)] p-3"
                  >
                    <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 text-start">
                        <p className="text-sm font-medium">
                          {t('progress.certificate', { number: batch.certificateNumber })} ·{' '}
                          {batch.periodLabel}
                        </p>
                        <p className="text-xs text-[var(--pf-text-muted)]">
                          {t(`batchStatus.${batch.status as 'draft'}`)} ·{' '}
                          {t('progress.linesCount', { count: batch.lines.length })}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {batch.status === 'draft' && permissions.canApproveProgress ? (
                          <form
                            action={approveAction}
                            className="flex min-w-0 flex-col gap-2 rounded-md border border-[var(--pf-border-default)] p-2"
                          >
                            <input type="hidden" name="projectId" value={projectId} />
                            <input type="hidden" name="batchId" value={batch.id} />
                            {boq.progressMode === 'advanced' ? (
                              <ul className="flex min-w-0 flex-col gap-2">
                                {batch.lines.map((line) => {
                                  const item = items.find((n) => n.id === line.boqNodeId);
                                  return (
                                    <li key={line.id} className="text-xs text-start">
                                      <p className="font-medium">
                                        {item?.description ?? line.boqNodeId}
                                      </p>
                                      <p className="text-[var(--pf-text-muted)]">
                                        {t('progress.measuredQty')}:{' '}
                                        <span dir="ltr">{line.measuredQuantity}</span>
                                      </p>
                                      <input type="hidden" name="approveLineId" value={line.id} />
                                      <label className="mt-1 block text-[var(--pf-text-secondary)]">
                                        {t('progress.approvedQty')}
                                        <input
                                          name="approveApprovedQuantity"
                                          required
                                          inputMode="decimal"
                                          defaultValue=""
                                          className="mt-1 w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-2 py-1.5 text-sm"
                                          dir="ltr"
                                        />
                                      </label>
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : (
                              <p className="text-xs text-[var(--pf-text-muted)]">
                                {t('progress.simpleApproveHint')}
                              </p>
                            )}
                            <Button
                              type="submit"
                              size="sm"
                              disabled={approvePending}
                              loading={approvePending}
                            >
                              {t('progress.approve')}
                            </Button>
                          </form>
                        ) : null}
                        {batch.status === 'approved' && permissions.canCreateBilling ? (
                          <form
                            action={billAction}
                            className="flex min-w-0 flex-wrap items-end gap-2"
                          >
                            <input type="hidden" name="projectId" value={projectId} />
                            <input type="hidden" name="batchId" value={batch.id} />
                            {permissions.showAmounts ? (
                              <>
                                <label className="text-xs text-[var(--pf-text-secondary)]">
                                  {t('progress.taxAmount')}
                                  <input
                                    name="taxAmount"
                                    inputMode="decimal"
                                    placeholder="0"
                                    className="mt-1 block w-28 rounded-md border border-[var(--pf-border-default)] bg-transparent px-2 py-1.5 text-sm"
                                    dir="ltr"
                                  />
                                </label>
                                <label className="text-xs text-[var(--pf-text-secondary)]">
                                  {t('progress.retentionPercent')}
                                  <input
                                    name="retentionPercent"
                                    inputMode="decimal"
                                    className="mt-1 block w-24 rounded-md border border-[var(--pf-border-default)] bg-transparent px-2 py-1.5 text-sm"
                                    dir="ltr"
                                  />
                                </label>
                              </>
                            ) : null}
                            <Button
                              type="submit"
                              size="sm"
                              disabled={billPending}
                              loading={billPending}
                            >
                              {t('progress.createBill')}
                            </Button>
                          </form>
                        ) : null}
                        {batch.status === 'billed' ? (
                          <span className="max-w-xs text-xs text-[var(--pf-text-muted)]">
                            {t('progress.billedLinked')}. {t('kpis.alreadyBilledHint')}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <ActionMessage state={approveState} />
            <ActionMessage state={billState} />
          </div>

          {permissions.canManage ? (
            <div className="flex min-w-0 flex-col gap-3">
              <section className="flex min-w-0 flex-col gap-2 rounded-md border border-[var(--pf-border-default)] p-3">
                <h4 className="text-sm font-medium">{t('allocations.title')}</h4>
                {allocations.length === 0 ? (
                  <p className="text-xs text-[var(--pf-text-muted)]">{t('allocations.empty')}</p>
                ) : (
                  <ul className="flex min-w-0 flex-col gap-2">
                    {allocations.map((row) => (
                      <li key={row.id} className="text-sm text-start">
                        <span className="text-[var(--pf-text-muted)]">{row.allocationKind}</span>
                        {' · '}
                        <span dir="ltr">{row.quantityDelta}</span>
                        {permissions.showAmounts ? (
                          <>
                            {' · '}
                            <span dir="ltr">{row.amountDelta}</span>
                          </>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <form
                action={allocateAction}
                className="flex min-w-0 flex-col gap-3 rounded-md border border-[var(--pf-border-default)] p-3"
              >
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="boqId" value={boq.id} />
                <h4 className="text-sm font-medium">{t('allocate.title')}</h4>
                <p className="text-xs text-[var(--pf-text-muted)]">{t('allocate.description')}</p>
                <Field label={t('allocate.changeOrderId')} required>
                  {(controlProps) =>
                    changeOrders.length > 0 ? (
                      <select
                        {...controlProps}
                        name="changeOrderId"
                        required
                        defaultValue=""
                        className="w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
                      >
                        <option value="" disabled>
                          {t('allocate.changeOrderPlaceholder')}
                        </option>
                        {changeOrders.map((order) => (
                          <option key={order.id} value={order.id}>
                            {order.label} ({order.direction} {order.amount})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-xs text-[var(--pf-text-muted)]">
                        {t('allocate.noChangeOrders')}
                      </p>
                    )
                  }
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t('allocate.allocationKind')}>
                    {(controlProps) => (
                      <select
                        {...controlProps}
                        name="allocationKind"
                        defaultValue="quantity_change"
                        className="w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
                      >
                        <option value="quantity_change">{t('allocate.kindQuantity')}</option>
                        <option value="unit_price_change">{t('allocate.kindUnitPrice')}</option>
                        <option value="unallocated_contract">{t('allocate.unallocated')}</option>
                      </select>
                    )}
                  </Field>
                  <Field label={t('allocate.targetItem')}>
                    {(controlProps) => (
                      <select
                        {...controlProps}
                        name="boqNodeId"
                        defaultValue=""
                        className="w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
                      >
                        <option value="">{t('forms.noParent')}</option>
                        {items.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.itemCode ? `${item.itemCode} — ` : ''}
                            {item.description}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label={t('allocate.quantityDelta')}>
                    {(controlProps) => (
                      <input
                        {...controlProps}
                        name="quantityDelta"
                        defaultValue="0"
                        inputMode="decimal"
                        className="w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
                        dir="ltr"
                      />
                    )}
                  </Field>
                  <Field label={t('allocate.unitPriceDelta')}>
                    {(controlProps) => (
                      <input
                        {...controlProps}
                        name="unitPriceDelta"
                        defaultValue="0"
                        inputMode="decimal"
                        className="w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
                        dir="ltr"
                      />
                    )}
                  </Field>
                  <Field label={t('allocate.amountDelta')} required>
                    {(controlProps) => (
                      <input
                        {...controlProps}
                        name="amountDelta"
                        required
                        defaultValue="0"
                        inputMode="decimal"
                        className="w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
                        dir="ltr"
                      />
                    )}
                  </Field>
                </div>
                <Button
                  type="submit"
                  disabled={allocatePending || changeOrders.length === 0}
                  loading={allocatePending}
                >
                  {t('allocate.submit')}
                </Button>
                <ActionMessage state={allocateState} />
              </form>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
