import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface SeededWorld {
  organizationId: string;
  otherOrganizationId: string;
  projectId: string;
  otherProjectId: string;
  /** Optional seed ids present in richer harness worlds. */
  vendorId?: string;
  advancedProjectId?: string;
  changeProjectId?: string;
  gcOrganizationId?: string;
  gcProjectId?: string;
  gcAgreementId?: string;
  gcContractorUsername?: string;
  gcOpsUsername?: string;
}

const worldPath = path.resolve(process.cwd(), 'tests/e2e/.world.json');

export function loadWorld(): SeededWorld {
  const raw = readFileSync(worldPath, 'utf8');
  return JSON.parse(raw) as SeededWorld;
}
