import { screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import heExpenses from '@/locales/he-IL/expenses.json';
import heFinancial from '@/locales/he-IL/financial.json';
import { ExpenseForm } from '@/modules/expenses/ui/expense-form';
import { buildFinancialCoverage } from '@/modules/financials/domain/coverage';
import { buildSliceAvailability } from '@/modules/financials/domain/financial-slice-availability';
import type { ProjectFinancials } from '@/modules/financials/domain/types';
import { ProjectFinancialsKpiPanel } from '@/modules/financials/ui/project-financials-kpi-panel';
import { ProjectFinancialsSnapshotView } from '@/modules/financials/ui/project-financials-snapshot-view';
import { zeroMoney } from '@/shared/money';
import { renderWithIntl } from './test-utils';

vi.mock('@/shared/i18n/navigation', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const MOBILE_WIDTH_PX = 390;

function MobileViewport({ children }: { children: ReactNode }) {
  return (
    <div data-testid="mobile-viewport" style={{ width: MOBILE_WIDTH_PX, maxWidth: MOBILE_WIDTH_PX }}>
      {children}
    </div>
  );
}

function buildFinancials(): ProjectFinancials {
  const currency = 'ILS';
  const zero = zeroMoney(currency);

  return {
    projectId: 'project-1',
    currency,
    workKind: 'project',
    pricingMode: null,
    priceNotSet: false,
    commercial: {
      originalContractValue: { amount: '150000.000000', currency },
      approvedAdditions: zero,
      approvedReductions: zero,
      currentContractValue: { amount: '150000.000000', currency },
      pendingChanges: zero,
    },
    billing: {
      invoiced: { amount: '40000.000000', currency },
      netInvoiced: { amount: '40000.000000', currency },
      paid: { amount: '10000.000000', currency },
      outstanding: { amount: '30000.000000', currency },
      hasBillingData: true,
      monthCloseRevenueNet: zero,
    },
    cost: {
      actualCostToDate: { amount: '12000.000000', currency },
      estimatedFinalCost: { amount: '12000.000000', currency },
      byFamily: {
        directProject: { amount: '12000.000000', currency },
        shared: zero,
        businessOverhead: zero,
        assetCapital: zero,
      },
      laborActual: zero,
      vendorActual: zero,
      overheadActual: zero,
      committedOpen: { amount: '5000.000000', currency },
      expectedRemainingCost: zero,
      openApPayable: zero,
      monthCloseCostNet: zero,
    },
    profit: {
      estimatedProfit: { amount: '138000.000000', currency },
      marginPercent: '92.00',
      actualProfit: { amount: '138000.000000', currency },
      actualMarginPercent: '92.00',
    },
    coverage: buildFinancialCoverage([{ source: 'direct_expenses', hasData: true }], new Date()),
    sliceAvailability: buildSliceAvailability({
      canReadCommercial: true,
      canReadBilling: true,
      canReadExpenses: true,
      canReadWorkforce: true,
      canReadProcurement: true,
      canReadAp: true,
      laborLoaded: true,
    }),
    dataConfidence: { level: 'high', reasons: [] },
  };
}

describe('mobile money surfaces @390px', () => {
  const t = (key: string) => {
    const parts = key.split('.');
    let node: unknown = heFinancial;
    for (const part of parts) {
      node = (node as Record<string, unknown> | undefined)?.[part];
    }
    return typeof node === 'string' ? node : key;
  };

  it('ProjectFinancialsKpiPanel keeps primary KPI drilldowns in the mobile column', () => {
    renderWithIntl(
      <MobileViewport>
        <ProjectFinancialsKpiPanel
          projectId="project-1"
          financials={buildFinancials()}
          canReadProfit
          canReadBilling
          canReadCommercial
          canReadAp
          t={t}
        />
      </MobileViewport>,
    );

    const viewport = screen.getByTestId('mobile-viewport');
    expect(viewport.getBoundingClientRect().width).toBeLessThanOrEqual(MOBILE_WIDTH_PX + 1);

    for (const label of [/^סכום החוזה הנוכחי/, /^עלות בפועל/, /^רווח צפוי/]) {
      const button = screen.getByRole('button', { name: label });
      expect(button).toBeVisible();
      expect(button.getBoundingClientRect().width).toBeLessThanOrEqual(MOBILE_WIDTH_PX + 1);
    }
  });

  it('ProjectFinancialsSnapshotView renders overview money rows without clipping', () => {
    renderWithIntl(
      <MobileViewport>
        <ProjectFinancialsSnapshotView financials={buildFinancials()} canReadProfit t={t} />
      </MobileViewport>,
    );

    expect(screen.getByText('עלות בפועל')).toBeVisible();
    expect(screen.getByText('חיובים ללקוח')).toBeVisible();
    expect(screen.getByText('יתרה פתוחה')).toBeVisible();
    expect(screen.getByText('רווח צפוי')).toBeVisible();
  });

  it('ExpenseForm exposes primary capture fields at mobile width', () => {
    renderWithIntl(
      <MobileViewport>
        <ExpenseForm
          mode="create"
          defaultCurrency="ILS"
          projects={[{ id: 'project-1', name: 'שיפוץ דירה ברמת גן', currency: 'ILS' }]}
          categories={[]}
          workPackages={[]}
          vendors={[]}
          initialValues={{
            amount: '',
            currency: 'ILS',
            description: '',
            expenseDate: '2026-08-23',
            supplierName: '',
            vendorId: '',
            targeting: 'project-1',
            projectId: 'project-1',
            workPackageId: '',
            costFamily: 'direct_project',
            costCategoryId: '',
            amountIncludesTax: false,
            netAmount: '',
            taxAmount: '',
            paymentMethod: '',
            notes: '',
            recurrenceCadence: 'one_time',
            recurrenceCustomLabel: '',
            allocations: [],
            allocationDriverMethod: '',
            allocationPeriodStart: '',
            allocationPeriodEnd: '',
            allocationScheduleMode: '',
          }}
        />
      </MobileViewport>,
      {
        messages: {
          expenses: heExpenses,
        },
      },
    );

    expect(screen.getByRole('textbox', { name: 'סכום' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: heExpenses.fields.target })).toBeVisible();
    expect(screen.getByRole('button', { name: 'פרטים נוספים' })).toBeVisible();
  });
});
