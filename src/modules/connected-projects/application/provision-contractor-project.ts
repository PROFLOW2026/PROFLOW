import { and, eq } from 'drizzle-orm';
import { clients } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { asServiceRoleWrite } from '@/shared/db/service-role-write';
import { launchProject } from '@/modules/projects';
import { createClient } from '@/modules/clients';
import type { DeveloperEngagementPreview } from '../domain/types';

export interface ProvisionContractorProjectInput {
  readonly preview: DeveloperEngagementPreview;
  readonly projectName?: string | null;
}

export interface ProvisionContractorProjectResult {
  readonly projectId: string;
  readonly clientId: string;
}

/**
 * Creates a normal business project in the contractor org. External storage is best-effort inside
 * `createProject` and must never block acceptance.
 */
export async function provisionContractorProject(
  context: OrgContext,
  input: ProvisionContractorProjectInput,
): Promise<ProvisionContractorProjectResult> {
  const name =
    input.projectName?.trim() ||
    `${input.preview.developerProjectName} · ${input.preview.developerOrganizationName}`;

  const clientId = await ensureDeveloperAsClient(context, input.preview.developerOrganizationName);

  const launched = await launchProject(context, {
    create: {
      name,
      clientId,
      workKind: 'project',
      description: input.preview.scopeSummary ?? undefined,
      startDate: input.preview.startDate ?? undefined,
      targetEndDate: input.preview.targetEndDate ?? undefined,
      contractValueAmount: input.preview.contractNetAmount ?? undefined,
      contractValueCurrency: input.preview.currency,
      amountIncludesTax: false,
      status: input.preview.contractNetAmount ? 'active' : 'draft',
    },
    launch: { kind: 'blank' },
  });

  return { projectId: launched.projectId, clientId };
}

async function ensureDeveloperAsClient(context: OrgContext, developerOrganizationName: string): Promise<string> {
  return asServiceRoleWrite(context.db, async () => {
    const [existing] = await context.db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.organizationId, context.organizationId), eq(clients.name, developerOrganizationName)))
      .limit(1);
    if (existing) return existing.id;

    const created = await createClient(context, {
      name: developerOrganizationName,
      legalName: developerOrganizationName,
    });
    return created.id;
  });
}
