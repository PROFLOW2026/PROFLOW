import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROJECT_CAPABILITIES as C } from '@/modules/project-team';
import { buildDeliveryProfile } from '@/modules/project-profile';
import {
  selectExecutionHubChildren,
  selectExecutionHubs,
} from '@/modules/project-workspace/domain/execution-hubs';
import { shouldShowExecutionNavGroup } from '@/modules/project-workspace/domain/select-execution-nav-links';

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

  it('shows the seven employee hubs only for developer + general contractor', () => {
    const surfaceRoot = '/employee/projects/p1';
    const links = selectExecutionHubs({
      projectId: 'p1',
      capabilities: new Set(Object.values(C)),
      deliveryProfile: buildDeliveryProfile({ operatingRoles: ['developer', 'general_contractor'] }),
      surfaceRoot,
    });

    expect(links.map((link) => link.key)).toEqual([
      'overview',
      'contractors',
      'contracts',
      'payments',
      'planning',
      'quality',
      'team',
    ]);
    expect(links.find((link) => link.key === 'overview')?.href).toBe(`${surfaceRoot}/execution`);
    expect(links.find((link) => link.key === 'payments')?.href).toBe(`${surfaceRoot}/contractor-payments`);
    expect(links.every((link) => link.href.startsWith(`${surfaceRoot}/`))).toBe(true);
    expect(links.some((link) => link.href.includes('?tab=schedule'))).toBe(false);

    const payments = selectExecutionHubChildren({
      hub: 'payments',
      projectId: 'p1',
      capabilities: new Set(Object.values(C)),
      surfaceRoot,
    });
    expect(payments.find((child) => child.path === 'claims')?.href).toBe(`${surfaceRoot}/claims`);
    expect(payments.find((child) => child.path === 'cost-control')?.href).toBe(`${surfaceRoot}/cost-control`);

    const overviewScreen = readFileSync(
      join(
        process.cwd(),
        'src/app/[locale]/(app)/projects/[projectId]/execution/screen.tsx',
      ),
      'utf8',
    );
    expect(overviewScreen).toContain('${base}/structure');
  });

  it('does not open the GC layer for developer only or for a subcontract agreement alone', () => {
    const developerOnly = buildDeliveryProfile({ operatingRoles: ['developer'] });
    expect(
      selectExecutionHubs({
        projectId: 'p1',
        capabilities: new Set(Object.values(C)),
        deliveryProfile: developerOnly,
        surfaceRoot: '/employee/projects/p1',
      }),
    ).toEqual([]);
    expect(shouldShowExecutionNavGroup({ deliveryProfile: developerOnly })).toBe(false);
    expect(shouldShowExecutionNavGroup({ deliveryProfile: null })).toBe(false);
  });
});
