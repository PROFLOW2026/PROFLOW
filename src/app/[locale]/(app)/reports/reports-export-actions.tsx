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
import {
  ExportDownloadToast,
  useExportDownload,
} from '@/modules/exports/ui/export-download-control';
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
] as const;

/**
 * Reports export/import actions - menu on all viewports so the toolbar never
 * forces page-level horizontal overflow.
 */
export function ReportsExportActions() {
  const t = useTranslations('dashboard.reports');
  const download = useExportDownload();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-h-11 gap-1"
            disabled={download.busy}
            loading={download.busy}
          >
            {t('exportMenu')}
            <ChevronDown className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="max-h-[min(70dvh,24rem)] min-w-48 max-w-xs overflow-y-auto text-start"
        >
          {EXPORT_LINKS.map((item) => (
            <DropdownMenuItem
              key={item.href}
              disabled={download.busy}
              onSelect={() => {
                void download.run(item.href);
              }}
            >
              {t(item.labelKey)}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem asChild disabled={download.busy}>
            <Link href="/imports">{t('importData')}</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ExportDownloadToast feedback={download} />
    </>
  );
}
