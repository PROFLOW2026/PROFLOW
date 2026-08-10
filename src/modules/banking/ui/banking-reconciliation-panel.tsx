'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import type {
  BankAccount,
  BankMatchSuggestion,
  BankTransaction,
  BankTxnMatchStatus,
} from '../domain/types';
import {
  createBankAccountAction,
  decideBankMatchAction,
  importBankStatementAction,
  refreshSuggestionsAction,
} from '../application/banking-actions';

function statusShape(
  status: BankTxnMatchStatus,
): 'pending' | 'onHold' | 'completed' | 'rejected' {
  if (status === 'matched') return 'completed';
  if (status === 'partially_matched') return 'onHold';
  if (status === 'ignored') return 'rejected';
  return 'pending';
}

export interface BankingReconciliationPanelProps {
  readonly initialAccounts: readonly BankAccount[];
  readonly initialTransactions: readonly BankTransaction[];
  readonly defaultCurrency: string;
  readonly canManage: boolean;
}

export function BankingReconciliationPanel({
  initialAccounts,
  initialTransactions,
  defaultCurrency,
  canManage,
}: BankingReconciliationPanelProps) {
  const t = useTranslations('banking');
  const [accounts, setAccounts] = useState<BankAccount[]>([...initialAccounts]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([
    ...initialTransactions,
  ]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    initialAccounts[0]?.id ?? null,
  );
  const [selectedTxnId, setSelectedTxnId] = useState<string | null>(
    initialTransactions[0]?.id ?? null,
  );
  const [suggestions, setSuggestions] = useState<BankMatchSuggestion[]>([]);
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(
    null,
  );
  const [accountName, setAccountName] = useState('');
  const [csvText, setCsvText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visibleTxns = useMemo(
    () =>
      transactions.filter((txn) =>
        selectedAccountId ? txn.bankAccountId === selectedAccountId : true,
      ),
    [transactions, selectedAccountId],
  );

  const selectedTxn = useMemo(
    () => visibleTxns.find((txn) => txn.id === selectedTxnId) ?? null,
    [visibleTxns, selectedTxnId],
  );

  const onCreateAccount = () => {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await createBankAccountAction({
        name: accountName,
        currency: defaultCurrency,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAccounts((prev) => [...prev, result.account]);
      setSelectedAccountId(result.account.id);
      setAccountName('');
      setInfo(t('accounts.created'));
    });
  };

  const onImport = () => {
    setError(null);
    setInfo(null);
    if (!selectedAccountId) {
      setError(t('errors.needAccount'));
      return;
    }
    if (!csvText.trim()) {
      setError(t('errors.needCsv'));
      return;
    }
    startTransition(async () => {
      const result = await importBankStatementAction({
        bankAccountId: selectedAccountId,
        csvText,
        source: 'csv_import',
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTransactions((prev) => [...result.imported, ...prev]);
      setCsvText('');
      setInfo(
        t('import.success', {
          imported: result.importedCount,
          duplicates: result.duplicateCount,
          invalid: result.invalidRows,
        }),
      );
    });
  };

  const onSelectTxn = (txnId: string) => {
    setSelectedTxnId(txnId);
    setSelectedSuggestionId(null);
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await refreshSuggestionsAction({ bankTransactionId: txnId });
      if (!result.ok) {
        setSuggestions([]);
        setError(result.error);
        return;
      }
      setSuggestions([...result.suggestions]);
    });
  };

  const onDecide = (decision: 'approve' | 'change' | 'ignore') => {
    if (!selectedTxn) return;
    setError(null);
    setInfo(null);

    const suggestion =
      suggestions.find((s) => s.id === selectedSuggestionId) ?? suggestions[0];

    if (decision !== 'ignore' && !suggestion) {
      setError(t('actions.selectTarget'));
      return;
    }

    startTransition(async () => {
      const result = await decideBankMatchAction({
        bankTransactionId: selectedTxn.id,
        decision,
        targetKind: decision === 'ignore' ? null : suggestion!.targetKind,
        targetId: decision === 'ignore' ? null : suggestion!.targetId,
        appliedAmount: decision === 'ignore' ? null : suggestion!.suggestedAmount,
        currency: decision === 'ignore' ? null : suggestion!.currency,
        billAlreadyRecognized:
          suggestion?.targetKind === 'vendor_payment' ||
          suggestion?.targetKind === 'vendor_bill',
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTransactions((prev) =>
        prev.map((txn) =>
          txn.id === result.transaction.id ? result.transaction : txn,
        ),
      );
      setInfo(
        decision === 'ignore'
          ? t('actions.ignored')
          : decision === 'change'
            ? t('actions.changed')
            : t('actions.approved'),
      );
      if (decision === 'ignore' || result.transaction.matchStatus === 'matched') {
        setSuggestions([]);
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('description')}</p>
      <p className="text-xs font-medium text-[var(--pf-text-brand)]">{t('ruleNote')}</p>

      <Alert tone="info" title={t('liveFeed.title')}>
        {t('liveFeed.body')}
      </Alert>

      {error ? (
        <Alert tone="danger" aria-live="assertive">
          {error}
        </Alert>
      ) : null}
      {info ? (
        <Alert tone="success" aria-live="polite">
          {info}
        </Alert>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">{t('accounts.title')}</h2>
        {accounts.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('accounts.empty')}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {accounts.map((account) => (
              <li key={account.id}>
                <Button
                  type="button"
                  size="sm"
                  variant={selectedAccountId === account.id ? 'primary' : 'secondary'}
                  onClick={() => setSelectedAccountId(account.id)}
                >
                  {account.name} ({account.currency})
                </Button>
              </li>
            ))}
          </ul>
        )}
        {canManage ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Label htmlFor="bank-account-name">{t('accounts.nameLabel')}</Label>
              <Input
                id="bank-account-name"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                disabled={pending}
              />
            </div>
            <Button
              type="button"
              onClick={onCreateAccount}
              disabled={pending || !accountName.trim()}
            >
              {t('accounts.create')}
            </Button>
          </div>
        ) : null}
      </section>

      {canManage ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">{t('import.title')}</h2>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('import.hint')}</p>
          <p className="text-xs text-[var(--pf-text-secondary)]">
            {t('import.noFinancialWrite')}
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bank-csv">{t('import.csvLabel')}</Label>
            <Textarea
              id="bank-csv"
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              rows={6}
              disabled={pending}
            />
          </div>
          <Button type="button" onClick={onImport} disabled={pending}>
            {t('import.submit')}
          </Button>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">{t('transactions.title')}</h2>
        {visibleTxns.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">
            {t('transactions.empty')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-start text-sm">
              <thead>
                <tr className="border-b border-[var(--pf-border-default)] text-[var(--pf-text-secondary)]">
                  <th className="px-2 py-2 font-medium">
                    {t('transactions.columns.date')}
                  </th>
                  <th className="px-2 py-2 font-medium">
                    {t('transactions.columns.description')}
                  </th>
                  <th className="px-2 py-2 font-medium">
                    {t('transactions.columns.amount')}
                  </th>
                  <th className="px-2 py-2 font-medium">
                    {t('transactions.columns.direction')}
                  </th>
                  <th className="px-2 py-2 font-medium">
                    {t('transactions.columns.status')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleTxns.map((txn) => (
                  <tr
                    key={txn.id}
                    className={`cursor-pointer border-b border-[var(--pf-border-default)] ${
                      selectedTxnId === txn.id ? 'bg-[var(--pf-teal-50)]' : ''
                    }`}
                    onClick={() => onSelectTxn(txn.id)}
                  >
                    <td className="px-2 py-2 whitespace-nowrap">{txn.date}</td>
                    <td className="px-2 py-2">{txn.description}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {txn.amount} {txn.currency}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {t(`transactions.directions.${txn.direction}`)}
                    </td>
                    <td className="px-2 py-2">
                      <StatusBadge
                        shape={statusShape(txn.matchStatus)}
                        label={t(`statuses.${txn.matchStatus}`)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedTxn ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">{t('suggestions.title')}</h2>
          <p className="text-sm text-[var(--pf-text-secondary)]">
            {selectedTxn.direction === 'credit'
              ? t('suggestions.incomingHint')
              : t('suggestions.outgoingHint')}
          </p>
          <p className="text-xs text-[var(--pf-text-secondary)]">
            {t('suggestions.costGuard')}
          </p>
          {suggestions.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">
              {t('suggestions.empty')}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {suggestions.map((sug) => (
                <li key={sug.id}>
                  <button
                    type="button"
                    className={`flex w-full flex-col gap-0.5 rounded-md border px-3 py-2 text-start text-sm ${
                      selectedSuggestionId === sug.id
                        ? 'border-[var(--pf-text-brand)] bg-[var(--pf-teal-50)]'
                        : 'border-[var(--pf-border-default)]'
                    }`}
                    onClick={() => setSelectedSuggestionId(sug.id)}
                  >
                    <span className="font-medium">
                      {t(`suggestions.target.${sug.targetKind}`)} · {sug.targetId}
                    </span>
                    <span className="text-[var(--pf-text-secondary)]">
                      {sug.suggestedAmount} {sug.currency} —{' '}
                      {t('suggestions.score', { score: sug.score })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {canManage && selectedTxn.matchStatus !== 'ignored' ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => onDecide('approve')}
                disabled={pending}
              >
                {t('actions.approve')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => onDecide('change')}
                disabled={pending}
              >
                {t('actions.change')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onDecide('ignore')}
                disabled={pending}
              >
                {t('actions.ignore')}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
