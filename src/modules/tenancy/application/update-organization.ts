import { eq } from 'drizzle-orm';
import { organizations } from '@drizzle/schema';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { normalizeWorkWeekStartDay } from '@/shared/dates';
import { defaultsForCountry } from '../domain/organization-defaults';
import { updateOrganizationSchema } from '../validation/schemas';

export interface OrganizationProfile {
  readonly name: string;
  readonly baseCurrency: string;
  readonly timezone: string;
  readonly countryCode: string;
  readonly defaultLocale: string;
  readonly workWeekStartDay: number;
}

/**
 * Updates the business profile.
 *
 * Changing country re-applies that country's currency and timezone, but only
 * where the owner did not state one explicitly in the same edit - an explicit
 * choice always wins over a default.
 */
export async function updateOrganizationProfile(
  context: OrgContext,
  rawInput: unknown,
): Promise<OrganizationProfile> {
  assertPermission(context, PERMISSIONS.ORG_UPDATE);

  const parsed = updateOrganizationSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const [before] = await context.db
    .select({
      name: organizations.name,
      baseCurrency: organizations.baseCurrency,
      timezone: organizations.timezone,
      countryCode: organizations.countryCode,
      defaultLocale: organizations.defaultLocale,
      workWeekStartDay: organizations.workWeekStartDay,
    })
    .from(organizations)
    .where(eq(organizations.id, context.organizationId))
    .limit(1);

  if (!before) throw new NotFoundError('Organization');

  const countryCode = input.countryCode?.toUpperCase() ?? before.countryCode;
  const countryDefaults = input.countryCode ? defaultsForCountry(countryCode) : null;

  const patch = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.baseCurrency !== undefined ? { baseCurrency: input.baseCurrency.toUpperCase() } : {}),
    ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
    ...(input.countryCode !== undefined ? { countryCode } : {}),
    ...(input.defaultLocale !== undefined ? { defaultLocale: input.defaultLocale } : {}),
    ...(input.workWeekStartDay !== undefined
      ? { workWeekStartDay: normalizeWorkWeekStartDay(input.workWeekStartDay) }
      : {}),
    ...(countryDefaults && input.countryCode && input.baseCurrency === undefined
      ? { baseCurrency: countryDefaults.currency }
      : {}),
    ...(countryDefaults && input.countryCode && input.timezone === undefined
      ? { timezone: countryDefaults.timezone }
      : {}),
  };

  const [after] = await context.db
    .update(organizations)
    .set(patch)
    .where(eq(organizations.id, context.organizationId))
    .returning({
      name: organizations.name,
      baseCurrency: organizations.baseCurrency,
      timezone: organizations.timezone,
      countryCode: organizations.countryCode,
      defaultLocale: organizations.defaultLocale,
      workWeekStartDay: organizations.workWeekStartDay,
    });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.ORGANIZATION_UPDATED,
    entityType: 'organization',
    entityId: context.organizationId,
    before,
    after,
  });

  return {
    ...after!,
    workWeekStartDay: normalizeWorkWeekStartDay(after!.workWeekStartDay),
  };
}
