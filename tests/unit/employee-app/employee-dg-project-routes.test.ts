import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROJECT_CAPABILITIES as C } from '@/modules/project-team';
import { buildDeliveryProfile } from '@/modules/project-profile';
import { selectExecutionNavLinks } from '@/modules/project-workspace';

const EMPLOYEE_PROJECT = join(
  process.cwd(),
  'src',
  'app',
  '[locale]',
  'employee',
  '(shell)',
  'projects',
  '[projectId]',
);

/** DG routes mounted for project members in the Employee app. */
const EMPLOYEE_DG_ROUTES = [
  'structure/page.tsx',
  'contractors/page.tsx',
  'contractors/[agreementId]/page.tsx',
  'contractors/[agreementId]/changes/page.tsx',
  'contractors/[agreementId]/lines/page.tsx',
  'execution/page.tsx',
  'cost-control/page.tsx',
  'claims/page.tsx',
  'claims/[claimId]/page.tsx',
  'deductions/page.tsx',
  'coordination/page.tsx',
  'coordination/[eventId]/page.tsx',
  'inspections/page.tsx',
  'inspections/[inspectionId]/page.tsx',
  'defects/page.tsx',
  'defects/[defectId]/page.tsx',
  'rfi/page.tsx',
  'rfi/[rfiId]/page.tsx',
  'submittals/page.tsx',
  'submittals/[submittalId]/page.tsx',
  'plans/page.tsx',
  'plans/[drawingId]/page.tsx',
  'site-log/page.tsx',
  'site-log/[logDate]/page.tsx',
  'site-meetings/page.tsx',
  'site-meetings/[meetingId]/page.tsx',
  'instructions/page.tsx',
  'instructions/[instructionId]/page.tsx',
  'site-safety/page.tsx',
  'deliveries/page.tsx',
  'contractor-compliance/page.tsx',
  'contractor-closeout/page.tsx',
  'contractor-warranty/page.tsx',
  'tenders/page.tsx',
  'tenders/[packageId]/page.tsx',
  'unpriced-work/page.tsx',
  'activity/page.tsx',
] as const;

describe('employee DG project routes', () => {
  it('exports a default page for every mounted route and keeps the capability gate', () => {
    for (const route of EMPLOYEE_DG_ROUTES) {
      const source = readFileSync(join(EMPLOYEE_PROJECT, route), 'utf8');
      expect(source, route).toMatch(/export default async function /);
      expect(source, route).toContain('requireProjectCapabilityPage');
    }
  });

  it('keeps the financial capability gate on cost control, claims and deductions', () => {
    const cost = readFileSync(join(EMPLOYEE_PROJECT, 'cost-control/page.tsx'), 'utf8');
    expect(cost).toContain('PROJECT_CAPABILITIES.FINANCIAL_VIEW');
    expect(cost).toContain('PROJECT_CAPABILITIES.PROJECT_BUDGET_VIEW');
    expect(cost).toContain("mode: 'any'");

    const claims = readFileSync(join(EMPLOYEE_PROJECT, 'claims/page.tsx'), 'utf8');
    const claimDetail = readFileSync(join(EMPLOYEE_PROJECT, 'claims/[claimId]/page.tsx'), 'utf8');
    const deductions = readFileSync(join(EMPLOYEE_PROJECT, 'deductions/page.tsx'), 'utf8');
    expect(claims).toContain("'claim.view'");
    expect(claimDetail).toContain("'claim.view'");
    expect(deductions).toContain("'claim.view'");
  });

  it('builds execution nav hrefs under the employee project root', () => {
    const links = selectExecutionNavLinks({
      projectId: 'p1',
      capabilities: new Set(Object.values(C)),
      deliveryProfile: buildDeliveryProfile({ operatingRoles: ['developer'] }),
      hasSubcontractAgreements: true,
      surfaceRoot: '/employee/projects/p1',
    });

    expect(links.find((link) => link.key === 'structure')?.href).toBe('/employee/projects/p1/structure');
    expect(links.find((link) => link.key === 'claims')?.href).toBe('/employee/projects/p1/claims');
    expect(links.find((link) => link.key === 'costControl')?.href).toBe('/employee/projects/p1/cost-control');
    expect(links.some((link) => link.key === 'contractorAccess')).toBe(false);
    expect(links.every((link) => link.href.startsWith('/employee/projects/p1/'))).toBe(true);
  });
});
