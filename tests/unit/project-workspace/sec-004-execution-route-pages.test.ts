/**
 * SEC-004 — static proof that owner execution hub entry routes delegate to gated server UI.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('SEC-004 execution hub route gates', () => {
  it('execution dashboard screen calls requireDeveloperGcExecutionPage', () => {
    const src = read('src/app/[locale]/(app)/projects/[projectId]/execution/screen.tsx');
    expect(src).toContain('requireDeveloperGcExecutionPage');
    expect(src).not.toContain('execution.financialTitle');
    expect(src).not.toContain('loadExecutionPayableTotals');
    expect(src).toContain('${base}/cost-control');
    expect(src).toContain('${base}/contractor-payments');
  });

  it('cost-control screen calls requireDeveloperGcExecutionPage', () => {
    expect(read('src/app/[locale]/(app)/projects/[projectId]/cost-control/screen.tsx')).toContain(
      'requireDeveloperGcExecutionPage',
    );
  });

  it('execution hub link pages use gated ExecutionHubLinks', () => {
    for (const page of [
      'src/app/[locale]/(app)/projects/[projectId]/execution-planning/page.tsx',
      'src/app/[locale]/(app)/projects/[projectId]/execution-quality/page.tsx',
      'src/app/[locale]/(app)/projects/[projectId]/contractor-payments/page.tsx',
    ]) {
      const src = read(page);
      expect(src).toContain('ExecutionHubLinks');
    }
    expect(read('src/modules/project-workspace/ui/execution-hub-links.tsx')).toContain(
      'requireDeveloperGcExecutionPage',
    );
  });

  it('execution-contracts page uses gated ContractsExecutionHub', () => {
    expect(
      read('src/app/[locale]/(app)/projects/[projectId]/execution-contracts/page.tsx'),
    ).toContain('ContractsExecutionHub');
    expect(read('src/modules/project-workspace/ui/contracts-execution-hub.tsx')).toContain(
      'requireDeveloperGcExecutionPage',
    );
  });

  it('employee execution dashboard reuses gated owner screen', () => {
    const employee = read('src/app/[locale]/employee/(shell)/projects/[projectId]/execution/page.tsx');
    expect(employee).toContain('ProjectExecutionDashboardScreen');
    expect(read('src/app/[locale]/(app)/projects/[projectId]/execution/screen.tsx')).toContain(
      'requireDeveloperGcExecutionPage',
    );
  });
});
