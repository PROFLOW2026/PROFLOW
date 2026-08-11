import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { z } from 'zod';
import { BUSINESS_PROFILE_KEYS, type BusinessProfileKey } from '../domain/business-profiles';
import { applyBusinessProfileConfig } from './apply-business-profile';

const applySchema = z.object({
  businessProfile: z.enum(BUSINESS_PROFILE_KEYS),
});

/** Applies a business profile to an existing organization (additive + settings). */
export async function applyOrganizationBusinessProfile(
  context: OrgContext,
  rawInput: { businessProfile: string },
): Promise<{ profileKey: BusinessProfileKey }> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);

  const parsed = applySchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const locale = context.organization.defaultLocale === 'en' ? 'en' : 'he-IL';
  const result = await applyBusinessProfileConfig(
    context.db,
    context.organizationId,
    parsed.data.businessProfile,
    locale,
  );

  if (!result.applied) {
    throw new ValidationError([{ path: 'businessProfile', message: 'Unknown business profile' }]);
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'organization_business_profile',
    entityId: context.organizationId,
    after: { profileKey: result.profileKey },
  });

  return { profileKey: result.profileKey };
}
