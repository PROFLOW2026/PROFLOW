import { existsSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { AuthorizationError, NotFoundError } from '@/shared/errors';
import { money, zeroMoney } from '@/shared/money';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import type { ProjectFinancials } from '@/modules/financials/domain/types';
import { buildSliceAvailability } from '@/modules/financials/domain/financial-slice-availability';
import type { ProjectDetailChrome } from '@/modules/projects';
import {
  assertReportKindPermission,
  generateReport,
  getReportsCopy,
  hebrewFontFilePath,
  presentProjectFinancialSummary,
  renderReportPdf,
} from '@/modules/reports';
import { toProviderAttachments } from '@/shared/ports/email';

const allSlicesLoaded = buildSliceAvailability({
  canReadCommercial: true,
  canReadBilling: true,
  canReadExpenses: true,
  canReadWorkforce: true,
  canReadProcurement: true,
  canReadAp: true,
  laborLoaded: true,
});

function contextWith(permissions: readonly PermissionKey[], locale = 'he-IL'): OrgContext {
  return {
    userId: 'user-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    organization: {
      id: 'org-1',
      name: 'חברת בדיקה',
      baseCurrency: 'ILS',
      timezone: 'Asia/Jerusalem',
      countryCode: 'IL',
      defaultLocale: 'he-IL',
    },
    permissions: new Set(permissions),
    roleKeys: ['viewer'],
    db: {} as OrgContext['db'],
    locale,
  };
}

function chrome(projectId = 'proj-1'): ProjectDetailChrome {
  return {
    project: {
      id: projectId,
      organizationId: 'org-1',
      name: 'פרויקט חוף',
      documentNumber: 'PRJ-1',
      status: 'active',
      workKind: 'project',
      experienceProfile: null,
      pricingMode: null,
      clientId: 'client-1',
      primaryContactId: null,
      currency: 'ILS',
      description: null,
      location: 'תל אביב',
      projectRole: null,
      deliveryMode: null,
      startDate: '2026-01-01',
      targetEndDate: '2026-12-31',
      actualEndDate: null,
      progressPercent: '40',
      progressStatus: 'on_track',
      notes: null,
      archivedAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    },
    clientName: 'לקוח דוגמה',
    clientContact: null,
    domainName: null,
    contract: null,
    contracts: [],
    contractValueEvents: [],
    currentContractValue: money('100000', 'ILS'),
    originalContractAmountLocked: false,
  };
}

function financials(overrides: Partial<ProjectFinancials> = {}): ProjectFinancials {
  const currency = 'ILS';
  return {
    projectId: 'proj-1',
    currency,
    workKind: 'project',
    pricingMode: null,
    priceNotSet: false,
    commercial: {
      originalContractValue: money('100000', currency),
      approvedAdditions: money('5000', currency),
      approvedReductions: zeroMoney(currency),
      currentContractValue: money('105000', currency),
      pendingChanges: money('2000', currency),
    },
    billing: {
      invoiced: money('20000', currency),
      paid: money('8000', currency),
      outstanding: money('12000', currency),
      netInvoiced: money('20000', currency),
      hasBillingData: true,
      monthCloseRevenueNet: zeroMoney(currency),
    },
    cost: {
      actualCostToDate: money('30000', currency),
      estimatedFinalCost: money('80000', currency),
      byFamily: {
        directProject: money('25000', currency),
        shared: zeroMoney(currency),
        businessOverhead: zeroMoney(currency),
        assetCapital: zeroMoney(currency),
      },
      laborActual: money('9000', currency),
      vendorActual: money('4000', currency),
      overheadActual: zeroMoney(currency),
      committedOpen: money('15000', currency),
      expectedRemainingCost: money('35000', currency),
      openApPayable: money('3000', currency),
      monthCloseCostNet: zeroMoney(currency),
      directActualCostToDate: money('30000', currency),
      allocatedGeneralBusinessCost: zeroMoney(currency),
      fullActualCostToDate: money('30000', currency),
    },
    profit: {
      estimatedProfit: money('25000', currency),
      marginPercent: '23.81',
      actualProfit: money('75000', currency),
      actualMarginPercent: '71.43',
    },
    coverage: {
      basis: 'direct_only',
      entries: [],
      calculatedAt: new Date('2026-08-16T00:00:00Z'),
    },
    sliceAvailability: allSlicesLoaded,
    dataConfidence: { level: 'high', reasons: [] },
    ...overrides,
  };
}

describe('report packs', () => {
  it('denies generate without PROJECT_FINANCIALS_READ / QUOTES_READ / BOQ_READ', () => {
    const context = contextWith([PERMISSIONS.PROJECTS_READ]);
    expect(() => assertReportKindPermission(context, 'project_financial_summary')).toThrow(
      AuthorizationError,
    );
    expect(() => assertReportKindPermission(context, 'quote_estimate')).toThrow(AuthorizationError);
    expect(() => assertReportKindPermission(context, 'boq_progress')).toThrow(AuthorizationError);
  });

  it('omits profit without inventing zeros when profit is hidden', () => {
    const copy = getReportsCopy('he-IL');
    const presented = presentProjectFinancialSummary(financials({ profit: null }), {
      copy,
      locale: 'he-IL',
      canReadWorkforceCost: true,
    });
    expect(presented.omitted.profit).toBe(true);
    expect(presented.sections.find((section) => section.id === 'profit')).toBeUndefined();
    expect(presented.notices.some((notice) => notice.includes('רווח'))).toBe(true);
    const profitValues = presented.sections.flatMap((section) => section.rows ?? []).filter((row) =>
      row.label.includes('רווח'),
    );
    expect(profitValues).toHaveLength(0);
  });

  it('omits compensation unless WORKFORCE_COST_READ', () => {
    const copy = getReportsCopy('en');
    const hidden = presentProjectFinancialSummary(financials(), {
      copy,
      locale: 'en',
      canReadWorkforceCost: false,
    });
    expect(hidden.omitted.compensation).toBe(true);
    expect(hidden.sections.find((section) => section.id === 'cost')?.rows?.some((row) => row.label.includes('compensation') || row.label.includes('Labor'))).toBe(false);

    const shown = presentProjectFinancialSummary(financials(), {
      copy,
      locale: 'en',
      canReadWorkforceCost: true,
    });
    expect(shown.omitted.compensation).toBeUndefined();
    expect(
      shown.sections
        .find((section) => section.id === 'cost')
        ?.rows?.some((row) => row.label.toLowerCase().includes('compensation')),
    ).toBe(true);
  });

  it('maps assertCanAccessProject failure to NotFound (no other-project leak)', async () => {
    const context = contextWith([PERMISSIONS.PROJECT_FINANCIALS_READ, PERMISSIONS.PROJECTS_READ]);
    await expect(
      generateReport(
        context,
        { kind: 'project_financial_summary', id: 'other-project', locale: 'he-IL' },
        {
          assertCanAccessProject: async () => {
            throw new NotFoundError('Project');
          },
          getProjectDetailChrome: vi.fn(),
          getProjectFinancials: vi.fn(),
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('includes snapshot timestamp and Hebrew strings on a financial payload', async () => {
    const generatedAt = new Date('2026-08-16T08:30:00.000Z');
    const payload = await generateReport(
      contextWith(
        [
          PERMISSIONS.PROJECT_FINANCIALS_READ,
          PERMISSIONS.PROJECTS_READ,
          PERMISSIONS.PROJECT_PROFIT_READ,
        ],
        'he-IL',
      ),
      { kind: 'project_financial_summary', id: 'proj-1', locale: 'he-IL' },
      {
        now: () => generatedAt,
        assertCanAccessProject: async () => undefined,
        getProjectDetailChrome: async () => chrome(),
        getProjectFinancials: async () => financials({ profit: null }),
      },
    );

    expect(payload.generatedAt).toBe(generatedAt.toISOString());
    expect(payload.title).toMatch(/פיננסי|סיכום/);
    expect(payload.identity.companyName).toBe('חברת בדיקה');
    expect(payload.identity.projectName).toBe('פרויקט חוף');
    expect(payload.identity.clientName).toBe('לקוח דוגמה');
    expect(payload.notices.some((notice) => notice.includes('מע״מ') || notice.includes('רווח'))).toBe(
      true,
    );
    expect(payload.omitted.profit).toBe(true);
    expect(payload.sections.find((section) => section.id === 'profit')).toBeUndefined();
    const cost = payload.sections.find((section) => section.id === 'cost');
    expect(cost?.rows?.some((row) => row.nature === 'actual')).toBe(true);
    expect(cost?.rows?.some((row) => row.nature === 'committed')).toBe(true);
    expect(cost?.rows?.some((row) => row.nature === 'forecast')).toBe(true);
    expect(cost?.rows?.some((row) => row.label.includes('שכר'))).toBe(false);
  });

  it('keeps pending-change copy off the current contract in Hebrew catalog', () => {
    const he = getReportsCopy('he-IL');
    expect(he.notices.pendingNotInContract).toMatch(/ממתינים/);
    expect(he.notices.pendingNotInContract).toMatch(/חוזה הנוכחי/);
    expect(he.fields.currentContract).not.toBe(he.fields.pendingChanges);
    expect(he.natures.actual).toBe('בפועל');
    expect(he.natures.committed).toBe('מחויב');
    expect(he.natures.forecast).toBe('תחזית');
    expect(he.fields.invoiced).not.toBe(he.fields.actualProfit);
    expect(he.fields.tax).toMatch(/מע״מ/);
  });

  it('embeds a PDF header for a Hebrew payload and vendors the OFL font', async () => {
    expect(existsSync(hebrewFontFilePath())).toBe(true);
    const bytes = await renderReportPdf({
      kind: 'project_status',
      title: 'דוח סטטוס פרויקט',
      generatedAt: '2026-08-16T08:30:00.000Z',
      locale: 'he-IL',
      dir: 'rtl',
      identity: {
        companyName: 'חברת בדיקה',
        projectId: 'proj-1',
        projectName: 'פרויקט חוף',
        projectNumber: 'PRJ-1',
        clientName: 'לקוח דוגמה',
      },
      notices: ['שינויים ממתינים אינם מעדכנים את החוזה הנוכחי עד לאישורם.'],
      sections: [
        {
          id: 'status',
          heading: 'סטטוס',
          rows: [{ label: 'סטטוס', value: 'active' }],
        },
      ],
      omitted: {},
    });
    const header = Buffer.from(bytes.slice(0, 5)).toString('latin1');
    expect(header).toBe('%PDF-');
  });
});

describe('email attachments', () => {
  it('maps attachments for Resend and leaves console callers free to ignore bytes', () => {
    expect(toProviderAttachments(undefined)).toBeUndefined();
    expect(toProviderAttachments([])).toBeUndefined();
    const mapped = toProviderAttachments([
      { filename: 'report.pdf', contentType: 'application/pdf', bytes: new Uint8Array([1, 2, 3]) },
    ]);
    expect(mapped).toHaveLength(1);
    expect(mapped?.[0]?.filename).toBe('report.pdf');
    expect(mapped?.[0]?.contentType).toBe('application/pdf');
  });
});
