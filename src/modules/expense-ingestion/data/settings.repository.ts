import type { OrgContext } from '@/shared/auth/context';
import {
  getOrganizationSettingValue,
  upsertOrganizationSettingValue,
} from '@/modules/tenancy/data/organization-settings.repository';
import {
  DEFAULT_ORG_EXPENSE_INGESTION_SETTINGS,
  EXPENSE_INGESTION_PROVIDER_KEY,
  type OrgExpenseIngestionSettings,
  parseExpenseIngestionProvider,
} from '../domain/settings';

let overrideForTests: OrgExpenseIngestionSettings | null = null;

export function setOrgExpenseIngestionSettingsForTests(
  settings: OrgExpenseIngestionSettings | null,
): void {
  overrideForTests = settings;
}

export async function getOrgExpenseIngestionSettings(
  context: OrgContext,
): Promise<OrgExpenseIngestionSettings> {
  if (overrideForTests) return overrideForTests;
  const raw = await getOrganizationSettingValue<string>(
    context.db,
    context.organizationId,
    EXPENSE_INGESTION_PROVIDER_KEY,
  );
  return {
    provider: parseExpenseIngestionProvider(raw),
  };
}

export async function upsertOrgExpenseIngestionSettings(
  context: OrgContext,
  patch: Partial<OrgExpenseIngestionSettings>,
): Promise<OrgExpenseIngestionSettings> {
  const current = await getOrgExpenseIngestionSettings(context);
  const next: OrgExpenseIngestionSettings = {
    provider: patch.provider ?? current.provider,
  };
  await upsertOrganizationSettingValue(
    context.db,
    context.organizationId,
    EXPENSE_INGESTION_PROVIDER_KEY,
    next.provider,
  );
  return next;
}

export { DEFAULT_ORG_EXPENSE_INGESTION_SETTINGS };
