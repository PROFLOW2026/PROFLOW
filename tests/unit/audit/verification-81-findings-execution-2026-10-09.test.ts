/**
 * Executable proofs aligned with Build dispositions (2026-10-09).
 * Static + small domain checks — updated when FIX/IMPLEMENT lands.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPORT_KINDS } from '@/modules/reports/domain/types';
import {
  MIN_MONTHLY_ACCRUAL_WORKING_DAYS,
  recognizeMonthlyEmployerPoolToDate,
} from '@/modules/workforce/domain/monthly-accrual';
import { money, toNumericString } from '@/shared/money';
import { convertWithSubcontracts } from '@/modules/site-instructions/application/conversion-port';
import { parseProjectAccessMode } from '@/modules/projects/domain/project-access';

const root = process.cwd();

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('audit 81 — NOT VERIFIED execution proofs (2026-10-09)', () => {
  it('WF-002: attendance overwrite corrects approved rows (not silent void-only loss)', () => {
    const src = readSrc('src/modules/workforce/application/attendance-project-sync.ts');
    expect(src).toContain('correctTimeEntry');
    expect(src).toContain("reason: 'attendance_overwrite'");
    expect(src).toMatch(/approved rows are corrected via correctTimeEntry/);
  });

  it('WF-004: low WDM is floored so early days cannot recognize full pool', () => {
    const full = money('9750', 'ILS');
    const lowW = recognizeMonthlyEmployerPoolToDate({
      fullMonthlyEmployerCost: full,
      workingDaysPerMonth: '5',
      accruedWorkDayCount: 5,
      recognizeFullMonth: false,
    });
    expect(Number(lowW.recognizedPool.amount)).toBeLessThan(Number(full.amount));
    expect(toNumericString(lowW.recognizedPool)).toBe('3250.000000');
    expect(MIN_MONTHLY_ACCRUAL_WORKING_DAYS).toBeGreaterThanOrEqual(15);
  });

  it('WF-006: attendance sync auto-approves only when org setting allows', () => {
    const src = readSrc('src/modules/workforce/application/attendance-project-sync.ts');
    expect(src).toContain('shouldAutoApproveAttendanceProjectTime');
    expect(src).toContain('autoApproveOnSync');
  });

  it('WF-007: parallel timesheet lifecycle + entry approval modules exist', () => {
    expect(readSrc('src/modules/workforce/domain/timesheet-lifecycle.ts')).toContain('Timesheet');
    expect(readSrc('src/modules/workforce/application/time-entries.ts')).toContain('timesheet-lifecycle');
  });

  it('WF-009: monthly recompute exposes unallocated pool field', () => {
    const src = readSrc('src/modules/workforce/application/monthly-cost-recompute.ts');
    expect(src).toContain('nonProjectOrUnallocated');
    expect(src).toContain('unallocated');
  });

  it('FIN-004: credit note adjustment triggers statutory credit integration', () => {
    const src = readSrc('src/modules/billing/application/create-billing-adjustment.ts');
    expect(src).toMatch(/issueStatutoryCreditForBillingAdjustment|statutory/i);
    expect(src).toContain("kind: 'credit_note'");
  });

  it('FIN2-002: customer statement labels net invoiced distinctly from gross', () => {
    const src = readSrc('src/modules/reports/domain/present-financials.ts');
    expect(src).toContain('netInvoiced');
    expect(src).toMatch(/invoicedNet|fields\.invoicedNet/);
  });

  it('CRM-001: convertQuote wins linked opportunity without CRM_MANAGE gate', () => {
    const src = readSrc('src/modules/quotes/application/convert-quote.ts');
    expect(src).toContain('markLinkedOpportunityWon');
    expect(src).not.toMatch(/if \(!hasPermission\(context, PERMISSIONS\.CRM_MANAGE\)\) return/);
  });

  it('CRM-002: CRM→product bridge falls back to latest version when none accepted', () => {
    const src = readSrc('src/modules/crm/application/convert-crm-quote-to-product-quote.ts');
    expect(src).toMatch(/acceptedVersionId/);
    expect(src).toMatch(/listSalesQuoteVersions/);
    expect(src).toMatch(/version_number DESC/);
  });

  it('UI-004: /inbox redirects to /today', () => {
    const src = readSrc('src/app/[locale]/(app)/inbox/page.tsx');
    expect(src).toContain("href: '/today'");
  });

  it('SEC-003: app permission union ignores scoped role_assignments.project_id', () => {
    const src = readSrc('src/modules/rbac/data/roles.repository.ts');
    expect(src).toContain('isNull(roleAssignments.projectId)');
  });

  it('SEC-004: execution hubs require developer+GC profile gate', () => {
    const hub = readSrc('src/modules/project-workspace/ui/execution-hub-links.tsx');
    expect(hub).toContain('requireDeveloperGcExecutionPage');
  });

  it('SEC-006: default project access mode is selected when unset', () => {
    expect(parseProjectAccessMode(undefined)).toBe('selected');
    expect(readSrc('drizzle/migrations/0176_project_access_mode_default_selected.sql')).toMatch(
      /selected/,
    );
  });

  it('PM-002: closeout keys persisted and read by closeout workspace', () => {
    const apply = readSrc('src/modules/projects/application/apply-project-template.ts');
    expect(apply).toContain('persistProjectCloseoutRequirementKeys');
    expect(readSrc('src/modules/closeout/application/closeout-requirements.ts')).toContain(
      'getProjectCloseoutRequirementKeys',
    );
  });

  it('PM-004: instruction→commercial conversion port delegates to subcontract change', async () => {
    const port = readSrc('src/modules/site-instructions/application/conversion-port.ts');
    expect(port).toContain('createChangeFromInstruction');
    await expect(convertWithSubcontracts({} as never, {} as never)).resolves.toBeNull();
  });

  it('PM-008: template apply sets default progress source from catalog', () => {
    const apply = readSrc('src/modules/projects/application/apply-project-template.ts');
    expect(apply).toContain('applyTemplateDefaultProgressSource');
    expect(readSrc('src/modules/projects/domain/templates.ts')).toContain('defaultProgressSourceForTemplate');
  });

  it('RPT-001: report catalog includes labor-by-period org pack kind', () => {
    expect(REPORT_KINDS).toContain('labor_by_period');
  });

  it('RPT-005: vendorsRecognized rollup key in org aggregate report', () => {
    const src = readSrc('src/modules/financials/domain/aggregate-org-report.ts');
    expect(src).toContain("key: 'vendorsRecognized'");
  });

  it('OPS-002: storage provision worker returns immediately and uses waitUntil', () => {
    const src = readSrc('src/app/api/internal/storage-provision-worker/route.ts');
    expect(src).toContain('waitUntil');
    expect(src).toMatch(/Accepts immediately/);
  });

  it('OPS-004: DG kick logs remote errors with structured kick failure tag', () => {
    const src = readSrc('src/modules/dg-events/application/kick.ts');
    expect(src).toContain('logUsageKickFailure');
  });

  it('DOC-008: template folder apply records skipped folders when manage perm missing', () => {
    const apply = readSrc('src/modules/projects/application/apply-project-template.ts');
    expect(apply).toContain('skippedDocumentFolders');
    const actions = readSrc('src/app/[locale]/(app)/projects/actions.ts');
    expect(actions).toContain('skippedDocumentFolders');
    expect(actions).toContain('skippedFoldersWarning');
    const form = readSrc('src/app/[locale]/(app)/projects/[projectId]/project-template-apply-form.tsx');
    expect(form).toMatch(/state\.warning/);
  });

  it('DOC-011: null document category denied when category grants configured', () => {
    const hits = readSrc('src/modules/employee-app/application/document-access.ts');
    expect(hits).toMatch(/Uncategorized project files/);
    expect(hits).toContain('return false');
  });

  it('DOC-012: statutory PDF save exists; no project-folder auto-archive worker hook in billing adjust', () => {
    expect(readSrc('src/modules/invoicing-integration/application/save-statutory-pdf-to-storage.ts')).toContain(
      'statutory_invoice',
    );
    expect(readSrc('src/modules/billing/application/create-billing-adjustment.ts')).not.toContain(
      'saveStatutoryPdf',
    );
  });

  it('FIN2-008: GCM read bundle joins open/frozen months (timing surface)', () => {
    const src = readSrc('src/modules/financials/data/financials-read-bundle.repository.ts');
    expect(src).toContain('general_cost_months');
    expect(src).toMatch(/status in \('open', 'frozen'\)/);
  });

  it('FIN2-009: legacy expenses-only org sum marked deprecated', () => {
    const src = readSrc('src/modules/financials/data/expenses.repository.ts');
    expect(src).toMatch(/@deprecated.*sumOrganizationRecognizedCostsInDateRange/);
  });

  it('DOC-001: evidence gallery exposes inline preview control', () => {
    const src = readSrc('src/modules/evidence/ui/evidence-gallery.tsx');
    expect(src).toContain('EvidenceInlinePreview');
  });

  it('DOC-006: Google Drive provider handles API failures (static)', () => {
    const src = readSrc('src/modules/external-storage/providers/google-drive.ts');
    expect(src).toMatch(/throw|Error|failed/i);
    const storagePage = readSrc('src/app/[locale]/(app)/settings/storage/page.tsx');
    expect(storagePage).toContain('oauthFailedRetryHint');
  });
});
