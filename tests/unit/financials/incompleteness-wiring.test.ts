import { describe, expect, it } from 'vitest';
import { loadProjectIncompletenessSignals } from '@/modules/financials/data/incompleteness.repository';
import { dataConfidenceFromCoverage } from '@/modules/financials/domain/data-confidence';
import { buildFinancialCoverage } from '@/modules/financials/domain/coverage';
import { composeProjectFinancials } from '@/modules/financials/application/compose-project-financials';

describe('project incompleteness wiring (R-006)', () => {
  it('raises medium confidence when open drafts and allocations present', () => {
    const currency = 'ILS';
    const result = composeProjectFinancials({
      projectId: 'p1',
      currency,
      expectedRemainingCostAmount: null,
      canReadCommercial: false,
      canReadBilling: false,
      canReadProfit: false,
      commercialData: null,
      billingRows: null,
      expenseContributions: [],
      laborInput: null,
      committed: null,
      openAp: null,
      recognizedVendor: null,
      incompleteness: {
        openDraftDocumentCount: 2,
        openAllocationCount: 1,
      },
    });

    expect(result.dataConfidence.level).toBe('medium');
    expect(result.dataConfidence.reasons).toEqual(
      expect.arrayContaining(['open_draft_documents', 'open_allocations']),
    );
  });

  it('loadProjectIncompletenessSignals is exported for getProjectFinancials', () => {
    expect(typeof loadProjectIncompletenessSignals).toBe('function');
    expect(
      dataConfidenceFromCoverage(buildFinancialCoverage([]), {
        openDraftDocumentCount: 1,
        openAllocationCount: 0,
      }).reasons,
    ).toContain('open_draft_documents');
  });
});
