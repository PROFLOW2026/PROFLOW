import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { money } from '@/shared/money';
import {
  getOrganizationSettingValue,
  upsertOrganizationSettingValue,
} from '../data/organization-settings.repository';
import {
  OPENING_CASH_BALANCE_SETTING_KEY,
  parseOpeningCashBalance,
  type OpeningCashBalance,
} from '../domain/opening-cash-balance';

/** Soft read for cash forecast UI. Callers gate PROJECT_FINANCIALS_READ. */
export async function getOpeningCashBalanceForOrg(
  context: OrgContext,
): Promise<OpeningCashBalance | null> {
  const raw = await getOrganizationSettingValue<unknown>(
    context.db,
    context.organizationId,
    OPENING_CASH_BALANCE_SETTING_KEY,
  );
  return parseOpeningCashBalance(raw);
}

/**
 * Persist opening cash. Same permission as other organization financial settings
 * (project profitability mode): SETTINGS_MANAGE.
 */
export async function saveOpeningCashBalance(
  context: OrgContext,
  raw: unknown,
): Promise<OpeningCashBalance> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);

  const parsed = parseOpeningCashBalance(raw);
  if (!parsed) {
    throw new ValidationError([
      {
        path: 'openingCashBalance',
        message: 'Invalid opening cash balance',
        messageKey: 'financial.cashFlowForecast.openingInvalid',
      },
    ]);
  }

  const baseCurrency = context.organization.baseCurrency.toUpperCase();
  if (parsed.currency !== baseCurrency) {
    throw new ValidationError([
      {
        path: 'currency',
        message: 'Currency must match the organization base currency',
        messageKey: 'financial.cashFlowForecast.openingCurrencyMismatch',
      },
    ]);
  }

  let normalizedAmount: string;
  try {
    const value = money(parsed.amount, parsed.currency);
    if (value.amount.startsWith('-')) {
      throw new ValidationError([
        {
          path: 'amount',
          message: 'Opening cash must be zero or positive',
          messageKey: 'financial.cashFlowForecast.openingInvalid',
        },
      ]);
    }
    normalizedAmount = value.amount;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError([
      {
        path: 'amount',
        message: 'Invalid opening cash amount',
        messageKey: 'financial.cashFlowForecast.openingInvalid',
      },
    ]);
  }

  const stored: OpeningCashBalance = {
    amount: normalizedAmount,
    currency: parsed.currency,
    asOf: parsed.asOf,
  };

  await upsertOrganizationSettingValue(
    context.db,
    context.organizationId,
    OPENING_CASH_BALANCE_SETTING_KEY,
    stored,
  );

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'organization_setting',
    entityId: null,
    after: { key: OPENING_CASH_BALANCE_SETTING_KEY, value: stored },
  });

  return stored;
}

export { OPENING_CASH_BALANCE_SETTING_KEY };
