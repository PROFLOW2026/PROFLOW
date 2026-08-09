import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import {
  findProspectById,
  insertProspect,
  insertProspectContact,
  listProspectContacts,
  listProspects,
  updateProspectById,
} from '../data/crm.repository';
import { CRM_AUDIT_ACTIONS, type ProspectContactRecord, type ProspectRecord } from '../domain/types';
import {
  createProspectContactSchema,
  createProspectSchema,
  updateProspectSchema,
  type CreateProspectInput,
  type UpdateProspectInput,
} from '../validation/schemas';

async function noteCrmUsage(context: OrgContext): Promise<void> {
  await noteModuleUsage(context.db, context.organizationId, 'crm');
}

export async function listProspectsForOrg(
  context: OrgContext,
  filters: { search?: string; status?: ProspectRecord['status'] | 'all'; includeArchived?: boolean } = {},
): Promise<ProspectRecord[]> {
  assertPermission(context, PERMISSIONS.CRM_READ);
  return listProspects(context.db, context.organizationId, filters);
}

export async function getProspectById(
  context: OrgContext,
  prospectId: string,
): Promise<ProspectRecord & { contacts: readonly ProspectContactRecord[] }> {
  assertPermission(context, PERMISSIONS.CRM_READ);
  const prospect = await findProspectById(context.db, context.organizationId, prospectId);
  if (!prospect) throw new NotFoundError('Prospect');
  const contacts = await listProspectContacts(context.db, context.organizationId, prospectId);
  return { ...prospect, contacts };
}

export async function createProspect(
  context: OrgContext,
  rawInput: CreateProspectInput,
): Promise<ProspectRecord> {
  assertPermission(context, PERMISSIONS.CRM_MANAGE);

  const parsed = createProspectSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const prospect = await insertProspect(context.db, {
    organizationId: context.organizationId,
    name: input.name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    companyName: input.companyName ?? null,
    notes: input.notes ?? null,
  });

  await noteCrmUsage(context);
  await recordAuditEvent(context, {
    action: CRM_AUDIT_ACTIONS.PROSPECT_CREATED,
    entityType: 'crm_prospect',
    entityId: prospect.id,
    after: prospect,
  });

  return prospect;
}

export async function updateProspect(
  context: OrgContext,
  rawInput: UpdateProspectInput,
): Promise<ProspectRecord> {
  assertPermission(context, PERMISSIONS.CRM_MANAGE);

  const parsed = updateProspectSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const existing = await findProspectById(context.db, context.organizationId, input.prospectId);
  if (!existing) throw new NotFoundError('Prospect');

  const updated = await updateProspectById(context.db, context.organizationId, input.prospectId, {
    name: input.name,
    status: input.status,
    email: input.email === undefined ? undefined : input.email,
    phone: input.phone === undefined ? undefined : input.phone,
    companyName: input.companyName === undefined ? undefined : input.companyName,
    notes: input.notes === undefined ? undefined : input.notes,
  });
  if (!updated) throw new NotFoundError('Prospect');

  await noteCrmUsage(context);

  return updated;
}

export async function createProspectContact(
  context: OrgContext,
  rawInput: unknown,
): Promise<ProspectContactRecord> {
  assertPermission(context, PERMISSIONS.CRM_MANAGE);

  const parsed = createProspectContactSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const prospect = await findProspectById(context.db, context.organizationId, input.prospectId);
  if (!prospect) throw new NotFoundError('Prospect');

  const contact = await insertProspectContact(context.db, {
    organizationId: context.organizationId,
    prospectId: input.prospectId,
    name: input.name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    role: input.role ?? null,
  });

  await noteCrmUsage(context);
  return contact;
}
