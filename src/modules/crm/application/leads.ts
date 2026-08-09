import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import { findLeadById, findProspectById, insertLead, listLeads, updateLeadById } from '../data/crm.repository';
import type { LeadRecord } from '../domain/types';
import {
  createLeadSchema,
  updateLeadSchema,
  type CreateLeadInput,
  type UpdateLeadInput,
} from '../validation/schemas';

export async function listLeadsForOrg(
  context: OrgContext,
  filters: { search?: string; status?: LeadRecord['status'] | 'all'; includeArchived?: boolean } = {},
): Promise<LeadRecord[]> {
  assertPermission(context, PERMISSIONS.CRM_READ);
  return listLeads(context.db, context.organizationId, filters);
}

export async function getLeadById(context: OrgContext, leadId: string): Promise<LeadRecord> {
  assertPermission(context, PERMISSIONS.CRM_READ);
  const lead = await findLeadById(context.db, context.organizationId, leadId);
  if (!lead) throw new NotFoundError('Lead');
  return lead;
}

export async function createLead(
  context: OrgContext,
  rawInput: CreateLeadInput,
): Promise<LeadRecord> {
  assertPermission(context, PERMISSIONS.CRM_MANAGE);

  const parsed = createLeadSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  if (input.prospectId) {
    const prospect = await findProspectById(context.db, context.organizationId, input.prospectId);
    if (!prospect) throw new NotFoundError('Prospect');
  }

  const lead = await insertLead(context.db, {
    organizationId: context.organizationId,
    title: input.title,
    prospectId: input.prospectId ?? null,
    source: input.source ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    notes: input.notes ?? null,
  });

  await noteModuleUsage(context.db, context.organizationId, 'crm');

  return lead;
}

export async function updateLead(
  context: OrgContext,
  rawInput: UpdateLeadInput,
): Promise<LeadRecord> {
  assertPermission(context, PERMISSIONS.CRM_MANAGE);

  const parsed = updateLeadSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const existing = await findLeadById(context.db, context.organizationId, input.leadId);
  if (!existing) throw new NotFoundError('Lead');

  if (input.prospectId) {
    const prospect = await findProspectById(context.db, context.organizationId, input.prospectId);
    if (!prospect) throw new NotFoundError('Prospect');
  }

  const updated = await updateLeadById(context.db, context.organizationId, input.leadId, {
    title: input.title,
    prospectId: input.prospectId === undefined ? undefined : input.prospectId,
    source: input.source === undefined ? undefined : input.source,
    status: input.status,
    email: input.email === undefined ? undefined : input.email,
    phone: input.phone === undefined ? undefined : input.phone,
    notes: input.notes === undefined ? undefined : input.notes,
  });
  if (!updated) throw new NotFoundError('Lead');

  await noteModuleUsage(context.db, context.organizationId, 'crm');

  return updated;
}
