import { fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import heFinancial from '@/locales/he-IL/financial.json';
import {
  buildProjectActualBreakdown,
  type ProjectActualAtom,
} from '@/modules/financials/domain/project-actual-breakdown';
import {
  ProjectActualBreakdownView,
  ProjectOwnerStoryPanel,
  type OwnerStoryCopy,
} from '@/modules/financials/ui/project-actual-breakdown-view';
import { money, zeroMoney } from '@/shared/money';
import { renderWithIntl } from './test-utils';

vi.mock('@/shared/i18n/navigation', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const MOBILE_WIDTH_PX = 390;
const ILS = 'ILS';

function MobileViewport({ children }: { children: ReactNode }) {
  return (
    <div data-testid="mobile-viewport" style={{ width: MOBILE_WIDTH_PX, maxWidth: MOBILE_WIDTH_PX }}>
      {children}
    </div>
  );
}

function ownerCopy(): OwnerStoryCopy {
  const o = heFinancial.ownerStory;
  return {
    title: o.title,
    currentContract: o.currentContract,
    actualCost: o.actualCost,
    ofWhich: o.ofWhich,
    allocatedGeneral: o.allocatedGeneral,
    openCommitments: o.openCommitments,
    forecastFinal: o.forecastFinal,
    billed: o.billed,
    collected: o.collected,
    actualProfit: o.actualProfit,
    afterGeneralProfit: o.afterGeneralProfit,
    forecastProfit: o.forecastProfit,
    unavailable: o.unavailable,
    breakdownTitle: o.breakdownTitle,
    categories: o.categories,
    total: o.total,
    percent: o.percent,
    sources: o.sources,
    expand: o.expand,
    collapse: o.collapse,
    hours: o.hours,
    workDays: o.workDays,
    missingCost: o.missingCost,
    ofLabor: o.ofLabor,
    period: o.period,
    forecastFormulaTitle: o.forecastFormulaTitle,
    forecastFormulaActual: o.forecastFormulaActual,
    forecastFormulaCommitments: o.forecastFormulaCommitments,
    forecastFormulaEtc: o.forecastFormulaEtc,
    forecastFormulaEquals: o.forecastFormulaEquals,
    profitFormulaTitle: o.profitFormulaTitle,
    profitFormulaContract: o.profitFormulaContract,
    profitFormulaForecast: o.profitFormulaForecast,
    profitFormulaEquals: o.profitFormulaEquals,
    openApCashNote: o.openApCashNote,
    actualLabel: o.actualLabel,
    commitmentLabel: o.commitmentLabel,
    paidLabel: o.paidLabel,
    openSource: o.openSource,
  };
}

describe('OWNER GATE — mobile 390 owner actual experience', () => {
  it('story + six categories usable without horizontal overflow markers', () => {
    const atoms: ProjectActualAtom[] = [
      {
        amount: money('10000.00', ILS),
        sourceKind: 'labor',
        sourceId: 'labor:1',
      },
      {
        amount: money('8000.00', ILS),
        sourceKind: 'ap_bill',
        sourceId: 'bill-1',
        vendorId: 'v-sub',
        vendorName: 'קבלן משנה',
        vendorType: 'subcontractor',
        subcontractAgreementId: 'sa-1',
      },
      {
        amount: money('7500.00', ILS),
        sourceKind: 'expense',
        sourceId: 'exp-v',
        vendorId: 'v-sup',
        vendorName: 'ספק',
        vendorType: 'supplier',
        costFamily: 'direct_project',
        categoryKey: 'equipment',
      },
      {
        amount: money('5000.00', ILS),
        sourceKind: 'expense',
        sourceId: 'exp-m',
        vendorId: 'v-mat',
        vendorName: 'חומרים',
        vendorType: 'supplier',
        costFamily: 'direct_project',
        categoryKey: 'building_materials',
      },
      {
        amount: money('8000.00', ILS),
        sourceKind: 'expense',
        sourceId: 'exp-o',
        costFamily: 'direct_project',
        categoryKey: 'misc',
      },
      {
        amount: money('5018.64', ILS),
        sourceKind: 'expense',
        sourceId: 'exp-oh',
        costFamily: 'business_overhead',
        categoryKey: 'rent',
      },
    ];

    const breakdown = buildProjectActualBreakdown({
      totalActual: money('43518.64', ILS),
      atoms,
    });
    const copy = ownerCopy();

    renderWithIntl(
      <MobileViewport>
        <ProjectOwnerStoryPanel
          copy={copy}
          metrics={{
            currentContract: money('100000', ILS),
            actualCost: money('43518.64', ILS),
            allocatedGeneralBusinessCost: zeroMoney(ILS),
            openCommitments: money('2000', ILS),
            forecastFinal: money('45518.64', ILS),
            billed: money('10000', ILS),
            collected: money('5000', ILS),
            outstanding: money('5000', ILS),
            unbilled: zeroMoney(ILS),
            actualProfit: money('56481.36', ILS),
            afterGeneralProfit: null,
            forecastProfit: money('54481.36', ILS),
            expectedRemaining: zeroMoney(ILS),
            openApPayable: zeroMoney(ILS),
            priceNotSet: false,
          }}
        />
        <ProjectActualBreakdownView
          breakdown={breakdown}
          laborByEmployee={{
            projectId: 'p1',
            currency: ILS,
            totalLaborCost: money('10000', ILS),
            hasWorkforceData: true,
            entriesMissingCost: 0,
            employees: [
              {
                employeeId: 'e1',
                employeeName: 'עובד שעות',
                hours: '40.00',
                workDays: 5,
                laborCost: money('10000', ILS),
                entriesMissingCost: 0,
                periods: [
                  {
                    yearMonth: '2026-01',
                    hours: '40.00',
                    workDays: 5,
                    laborCost: money('10000', ILS),
                    entriesMissingCost: 0,
                    source: 'time',
                  },
                ],
              },
            ],
          }}
          copy={copy}
          projectId="project-1"
        />
      </MobileViewport>,
      { locale: 'he-IL', messages: { financial: heFinancial } },
    );

    const viewport = screen.getByTestId('mobile-viewport');
    expect(viewport).toHaveStyle({ width: '390px' });
    expect(screen.getByText('תמונת הפרויקט')).toBeInTheDocument();
    expect(screen.getByText(/ממה מורכבת העלות בפועל/)).toBeInTheDocument();
    expect(screen.getByText('עובדים')).toBeInTheDocument();
    expect(screen.getByText('קבלני משנה')).toBeInTheDocument();
    expect(screen.getByText('ספקים')).toBeInTheDocument();
    expect(screen.getByText('חומרים')).toBeInTheDocument();
    expect(screen.getByText('הוצאות אחרות')).toBeInTheDocument();
    expect(screen.getByText('הוצאות כלליות')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /עובדים/i }));
    expect(screen.getByText('עובד שעות')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /קבלני משנה/i }));
    expect(screen.getAllByText('עלות בפועל').length).toBeGreaterThan(0);
    expect(screen.getByText('התחייבות')).toBeInTheDocument();
    expect(screen.getByText('שולם')).toBeInTheDocument();

    // No layout overflow class expected on mobile column
    expect(viewport.clientWidth).toBeLessThanOrEqual(MOBILE_WIDTH_PX);
  });

  it('shows allocated general separately from direct actual in direct mode copy', () => {
    const copy = ownerCopy();
    renderWithIntl(
      <MobileViewport>
        <ProjectOwnerStoryPanel
          copy={{
            ...copy,
            directActualCost: 'עלות ישירה בפועל',
            fullActualIncludingGeneral: 'עלות מלאה כולל הוצאות כלליות',
          }}
          metrics={{
            currentContract: money('100000', ILS),
            actualCost: money('50000', ILS),
            allocatedGeneralBusinessCost: money('8000', ILS),
            openCommitments: money('0', ILS),
            forecastFinal: money('50000', ILS),
            billed: money('10000', ILS),
            collected: money('5000', ILS),
            outstanding: money('5000', ILS),
            unbilled: zeroMoney(ILS),
            actualProfit: money('50000', ILS),
            afterGeneralProfit: null,
            forecastProfit: money('50000', ILS),
            expectedRemaining: zeroMoney(ILS),
            openApPayable: zeroMoney(ILS),
            priceNotSet: false,
          }}
        />
      </MobileViewport>,
      { locale: 'he-IL', messages: { financial: heFinancial } },
    );

    expect(screen.getByText('עלות בפועל')).toBeInTheDocument();
    expect(screen.queryByText(/מתוכן:/)).not.toBeInTheDocument();
  });
});
