'use client';

import dynamic from 'next/dynamic';
import type { BankingReconciliationPanelProps } from './banking-reconciliation-panel';

const BankingReconciliationPanel = dynamic(
  () =>
    import('./banking-reconciliation-panel').then((m) => m.BankingReconciliationPanel),
  { ssr: false },
);

export function BankingReconciliationPanelLazy(props: BankingReconciliationPanelProps) {
  return <BankingReconciliationPanel {...props} />;
}
