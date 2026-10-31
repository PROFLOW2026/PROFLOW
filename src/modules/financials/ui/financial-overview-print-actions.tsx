'use client';

import { MainAppListToolbar } from '@/components/patterns/main-app';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { printReportPreview } from '@/modules/reports/ui/report-print-button';

export const FINANCIAL_OVERVIEW_SHORT_FRAME_ID = 'pf-financial-overview-short-report';
export const FINANCIAL_OVERVIEW_DETAILED_FRAME_ID = 'pf-financial-overview-detailed-report';

export function FinancialOverviewPrintActions({
  menuLabel,
  shortLabel,
  detailedLabel,
}: {
  readonly menuLabel: string;
  readonly shortLabel: string;
  readonly detailedLabel: string;
}) {
  return (
    <MainAppListToolbar className="print:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="secondary" size="sm">
            {menuLabel}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => printReportPreview(FINANCIAL_OVERVIEW_SHORT_FRAME_ID)}>
            {shortLabel}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => printReportPreview(FINANCIAL_OVERVIEW_DETAILED_FRAME_ID)}
          >
            {detailedLabel}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </MainAppListToolbar>
  );
}
