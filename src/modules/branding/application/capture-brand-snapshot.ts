import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, ValidationError } from '@/shared/errors';
import { findBrandProfileById } from '../data/brand-profile.repository';
import { upsertBrandSnapshot } from '../data/brand-snapshots.repository';
import { findCompanyProfileByOrg } from '../data/company-profile.repository';
import { and, eq } from 'drizzle-orm';
import { projects } from '@drizzle/schema';
import { resolveAndBuildSnapshot } from '../domain/resolve-brand';
import type { BrandSnapshot, DocumentBrandSnapshotRecord } from '../domain/types';
import {
  captureBrandSnapshotSchema,
  type CaptureBrandSnapshotInput,
} from '../validation/schemas';
import { ensureDefaultBranding } from './ensure-default-branding';
import { findDefaultBrandProfile } from '../data/brand-profile.repository';

async function loadProjectBrandId(
  context: OrgContext,
  projectId: string | null | undefined,
): Promise<string | null> {
  if (!projectId) return null;
  const [row] = await context.db
    .select({ brandProfileId: projects.brandProfileId })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, context.organizationId)))
    .limit(1);
  return row?.brandProfileId ?? null;
}

/**
 * Freeze current resolved brand onto an issued/sent/finalized entity.
 * First write wins. Snapshot payload is built inside SECURITY DEFINER from
 * canonical company/brand tables — not from client JSON.
 */
export async function captureBrandSnapshot(
  context: OrgContext,
  rawInput: CaptureBrandSnapshotInput,
): Promise<DocumentBrandSnapshotRecord> {
  const parsed = captureBrandSnapshotSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;

  if (input.brandProfileId) {
    const documentBrand = await findBrandProfileById(
      context.db,
      context.organizationId,
      input.brandProfileId,
    );
    if (!documentBrand) {
      throw new DomainRuleError(
        'Brand profile does not belong to this organization',
        'branding.errors.wrongOrgBrand',
      );
    }
  }

  await ensureDefaultBranding(context.db, context.organizationId, {
    name: context.organization.name,
    countryCode: context.organization.countryCode,
  });

  return upsertBrandSnapshot(context.db, {
    organizationId: context.organizationId,
    entityType: input.entityType,
    entityId: input.entityId,
    brandProfileId: input.brandProfileId ?? null,
  });
}

/** Build a live snapshot without persisting (preview / draft docs / reports). */
export async function buildLiveBrandSnapshot(
  context: OrgContext,
  input: {
    readonly projectId?: string | null;
    readonly brandProfileId?: string | null;
  } = {},
): Promise<BrandSnapshot> {
  let company = await findCompanyProfileByOrg(context.db, context.organizationId);
  if (!company) {
    const seeded = await ensureDefaultBranding(context.db, context.organizationId, {
      name: context.organization.name,
      countryCode: context.organization.countryCode,
    });
    company = seeded.company;
  }

  const defaultBrand = await findDefaultBrandProfile(context.db, context.organizationId);
  const projectBrandId = await loadProjectBrandId(context, input.projectId);
  const projectBrand = projectBrandId
    ? await findBrandProfileById(context.db, context.organizationId, projectBrandId)
    : null;

  let documentBrand = null;
  if (input.brandProfileId) {
    documentBrand = await findBrandProfileById(
      context.db,
      context.organizationId,
      input.brandProfileId,
    );
    if (!documentBrand) {
      throw new DomainRuleError(
        'Brand profile does not belong to this organization',
        'branding.errors.wrongOrgBrand',
      );
    }
  }

  return resolveAndBuildSnapshot({
    company,
    defaultBrand,
    projectBrand,
    documentBrand,
  }).snapshot;
}
