/**
 * Executable proof ledger — FINANCE + CRM + PM slice (2026-10-09).
 * AUDIT ONLY — no product changes.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import type { BillingRecordDetail } from '@/modules/billing/domain/types';
import {
  buildStatutoryBridgeFromBillingRecord,
  buildStatutoryIdempotencyKey,
} from '@/modules/invoicing-integration';
import {
  assembleSumitCreateRequestBody,
  buildSumitCreatePayload,
} from '@/modules/invoicing-integration/providers/sumit/sumit-create-payload';
import {
  emptyCostPosition,
  withCommittedAndApPayable,
  type ProjectExpenseContribution,
} from '@/modules/financials/domain/cost-aggregation';
import { money, zeroMoney } from '@/shared/money';
import { mapBudgetLineActuals } from '@/modules/budgets/domain/map-line-actuals';
import type { ProjectBudgetLineRecord } from '@/modules/budgets/domain/types';
import { convertWithSubcontracts } from '@/modules/site-instructions/application/conversion-port';
import {
  cloneProjectTemplateForApply,
  PROJECT_TEMPLATE_KEYS,
} from '@/modules/projects/domain/templates';

const root = process.cwd();

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), 'utf8');
}

const ORG_ID = '01900000-0000-7000-8000-0000000000aa';
const BILLING_ID = '01900000-0000-7000-8000-0000000000bb';

function billingWithGrossLineOnRow(): BillingRecordDetail {
  return {
    id: BILLING_ID,
    projectId: '01900000-0000-7000-8000-0000000000cc',
    projectName: 'Demo',
    clientId: '01900000-0000-7000-8000-0000000000dd',
    reference: 'INV-2026/09',
    issueDate: businessDate('2026-09-18'),
    dueDate: businessDate('2026-11-30'),
    status: 'finalized',
    kind: 'invoice',
    subtotalAmount: { amount: '48500.000000', currency: 'ILS' },
    taxAmount: { amount: '8730.000000', currency: 'ILS' },
    totalAmount: { amount: '57230.000000', currency: 'ILS' },
    paidAmount: { amount: '0.000000', currency: 'ILS' },
    outstandingAmount: { amount: '57230.000000', currency: 'ILS' },
    vatMode: 'exclusive',
    taxSnapshot: {
      subtotalAmount: '48500.000000',
      taxAmount: '8730.000000',
      totalAmount: '57230.000000',
      currency: 'ILS',
      capturedAt: '2026-09-18T08:00:00.000Z',
      vatMode: 'exclusive',
      vatRatePercent: 18,
    },
    customerSnapshot: {
      name: 'Client Ltd',
      companyNumber: '557012345',
      externalIdentifier: '01900000-0000-7000-8000-0000000000dd',
      email: null,
      phone: null,
      address: null,
      city: null,
      postalCode: null,
      noVat: false,
    },
    finalizedAt: new Date('2026-09-18T08:00:00.000Z'),
    voidedAt: null,
    voidsBillingRecordId: null,
    externalDocumentId: null,
    notes: null,
    collectionContactedAt: null,
    collectionNextFollowUpAt: null,
    collectionPromiseToPayDate: null,
    collectionNote: null,
    lines: [
      {
        id: 'line-gross',
        description: 'Progress billing (stored gross on line)',
        lineTotal: { amount: '57230.000000', currency: 'ILS' },
        changeOrderId: null,
        sortOrder: 0,
      },
    ],
    payments: [],
    collectionStatus: 'open',
  };
}

describe('audit verification — FINANCE + CRM + PM executable proof (2026-10-09)', () => {
  describe('FINANCE — void / credit / SUMIT wiring', () => {
    it('FIN-002: voidBillingRecord voids AR and cancels issued statutory documents', () => {
      const src = readSrc('src/modules/billing/application/void-billing-record.ts');
      expect(src).toContain("status: 'void'");
      expect(src).toMatch(/cancelIssuedStatutoryDocumentsForBillingVoid/);
    });

    it('FIN-003: invoicing server actions expose issue/refresh/PDF plus statutory credit/cancel', () => {
      const src = readSrc('src/modules/invoicing-integration/ui/actions.ts');
      expect(src).toMatch(/requestExternalStatutoryDocumentAction/);
      expect(src).toMatch(/refreshExternalStatutoryStatusAction/);
      expect(src).toMatch(/cancelExternalStatutoryDocumentAction/);
      expect(src).toMatch(/creditExternalStatutoryDocumentAction/);
    });

    it('FIN-004: billing credit_note adjustment posts statutory credit via invoicing integration', () => {
      const src = readSrc('src/modules/billing/application/create-billing-adjustment.ts');
      expect(src).toContain("kind: 'credit_note'");
      expect(src).toMatch(/issueStatutoryCreditForBillingAdjustment/);
    });

    it('FIN-005: default billing lineTotal uses gross totalAmount; bridge→SUMIT sends that as line net', () => {
      const createSrc = readSrc('src/modules/billing/application/create-billing-record.ts');
      expect(createSrc).toMatch(/lineTotal: toNumericString\(amounts\.totalAmount\)/);

      const { bridge } = buildStatutoryBridgeFromBillingRecord(
        { organizationId: ORG_ID },
        billingWithGrossLineOnRow(),
      );

      expect(bridge.subtotalAmount.amount).toBe('48500.000000');
      expect(bridge.taxAmount!.amount).toBe('8730.000000');
      expect(bridge.totalAmount.amount).toBe('57230.000000');
      expect(bridge.lines[0]?.lineNet.amount).toBe('57230.000000');

      const payload = buildSumitCreatePayload({ billing: bridge, kind: 'tax_invoice' });
      const body = assembleSumitCreateRequestBody(
        payload,
        buildStatutoryIdempotencyKey(BILLING_ID, 'tax_invoice'),
      );

      expect(body.VATIncluded).toBe(false);
      expect(body.VATRate).toBe(18);
      const items = body.Items as Array<{
        Item: { Name: string; SearchMode: number };
        Quantity: number;
        UnitPrice: number;
        TotalPrice: number;
      }>;
      expect(items).toHaveLength(1);
      expect(items[0]).toEqual({
        Item: {
          Name: 'Progress billing (stored gross on line)',
          SearchMode: 1,
        },
        Quantity: 1,
        UnitPrice: 57230,
        TotalPrice: 57230,
      });
    });
  });

  describe('FINANCE — budget / GCM', () => {
    it('FIN2-003: discipline budget lines receive mapped actuals from matching contributions', () => {
      const ILS = 'ILS';
      const cost = withCommittedAndApPayable(
        {
          ...emptyCostPosition(ILS),
          actualCostToDate: money('50000', ILS),
          estimatedFinalCost: money('50000', ILS),
        },
        zeroMoney(ILS),
        zeroMoney(ILS),
        zeroMoney(ILS),
      );
      const contribution = (amount: string): ProjectExpenseContribution => ({
        amount,
        currency: ILS,
        costFamily: 'direct_project',
        isDirectOnProject: true,
        isAllocated: false,
        isSubcontractor: false,
        categoryKey: 'electrical',
        workPackageId: 'wp',
      });
      const line = (
        overrides: Partial<ProjectBudgetLineRecord> & Pick<ProjectBudgetLineRecord, 'id' | 'lineType' | 'label' | 'budgetAmount'>,
      ): ProjectBudgetLineRecord => ({
        organizationId: 'o',
        budgetId: 'b',
        revisionNumber: 1,
        categoryKey: null,
        workPackageId: null,
        disciplineKey: null,
        costCode: null,
        costCodeId: null,
        etcAmount: null,
        sortOrder: 0,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        ...overrides,
      });

      const result = mapBudgetLineActuals({
        currency: ILS,
        cost,
        contributions: [contribution('50000')],
        lines: [
          line({
            id: 'disc',
            lineType: 'discipline',
            disciplineKey: 'electrical',
            label: 'Electrical',
            budgetAmount: '20000',
          }),
        ],
      });

      const disc = result.rows.find((row) => row.id === 'disc')!;
      expect(disc.mappingStatus).toBe('mapped');
      expect(disc.metrics.actual).toEqual(money('50000', ILS));
      expect(result.unmappedRemainder).toEqual(zeroMoney(ILS));
    });

    it('FIN2-008: GCM read bundle filters general_cost_months to open/frozen (timing surface)', () => {
      const src = readSrc('src/modules/financials/data/financials-read-bundle.repository.ts');
      expect(src).toContain('general_cost_months');
      expect(src).toMatch(/status in \('open', 'frozen'\)/);
    });
  });

  describe('CRM — convert permissions / version', () => {
    it('CRM-001: product quote convert always wins linked opportunity (no CRM_MANAGE skip)', () => {
      const src = readSrc('src/modules/quotes/application/convert-quote.ts');
      expect(src).toContain('markLinkedOpportunityWon');
      expect(src).not.toMatch(/if \(!hasPermission\(context, PERMISSIONS\.CRM_MANAGE\)\) return/);
    });

    it('CRM-002: CRM→product bridge uses latest version when acceptedVersionId is null', () => {
      const src = readSrc('src/modules/crm/application/convert-crm-quote-to-product-quote.ts');
      expect(src).toMatch(/acceptedVersionId/);
      expect(src).toMatch(/listSalesQuoteVersions/);
      expect(src).toMatch(/version_number DESC/);
      expect(src).toMatch(/Prefer accepted version; fall back to the most recent/);
    });
  });

  describe('PM — templates / progress', () => {
    it('PM-001: structure apply persists packages and materializes BOQ/forms skeleton', () => {
      const apply = readSrc('src/modules/projects/application/apply-project-template.ts');
      expect(apply).toContain('splitProjectIntoWorkPackages');
      expect(apply).toContain('applyTemplateBoqSkeleton');
      expect(apply).toContain('applyTemplateFormChecklists');

      const copy = cloneProjectTemplateForApply('simple_finish', 'en');
      expect(copy!.boqSkeleton.length).toBeGreaterThan(0);
      expect(copy!.formChecklists.length).toBeGreaterThan(0);
      expect(PROJECT_TEMPLATE_KEYS).toHaveLength(10);
    });

    it('PM-002: closeout keys persisted for closeout reader', () => {
      const apply = readSrc('src/modules/projects/application/apply-project-template.ts');
      expect(apply).toContain('persistProjectCloseoutRequirementKeys');
    });

    it('PM-004: instruction→commercial conversion requires agreement id', async () => {
      await expect(convertWithSubcontracts({} as never, {} as never)).resolves.toBeNull();
      const port = readSrc('src/modules/site-instructions/application/conversion-port.ts');
      expect(port).toContain('createChangeFromInstruction');
    });

    it('PM-008: template apply sets progress source from catalog helper', () => {
      const apply = readSrc('src/modules/projects/application/apply-project-template.ts');
      expect(apply).toContain('defaultProgressSourceForTemplate');
    });
  });
});
