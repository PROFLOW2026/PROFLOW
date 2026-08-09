'use client';

import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Link } from '@/shared/i18n/navigation';

const EXPORT_LINKS = [
  { href: '/exports/projects', labelKey: 'exportProjects' },
  { href: '/exports/clients', labelKey: 'exportClients' },
  { href: '/exports/vendors', labelKey: 'exportVendors' },
  { href: '/exports/expenses', labelKey: 'exportExpenses' },
  { href: '/exports/billing', labelKey: 'exportBilling' },
  { href: '/exports/payments', labelKey: 'exportPayments' },
  { href: '/exports/receivables-aging', labelKey: 'exportReceivables' },
  { href: '/exports/employees', labelKey: 'exportEmployees' },
  { href: '/exports/time-entries', labelKey: 'exportTimeEntries' },
  { href: '/exports/purchase-orders', labelKey: 'exportPurchaseOrders' },
  { href: '/exports/ap-bills', labelKey: 'exportApBills' },
  { href: '/imports', labelKey: 'importData' },
] as const;

/**
 * Reports export/import actions — menu on all viewports so the toolbar never
 * forces page-level horizontal overflow.
 */
export function ReportsExportActions() {
  const t = useTranslations('dashboard.reports');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="secondary" size="sm" className="min-h-11 gap-1">
          {t('exportMenu')}
          <ChevronDown className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-[min(70dvh,24rem)] min-w-48 max-w-xs overflow-y-auto text-start"
      >
        {EXPORT_LINKS.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link href={item.href}>{t(item.labelKey)}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
