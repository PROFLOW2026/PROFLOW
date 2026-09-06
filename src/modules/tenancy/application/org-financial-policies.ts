import type { OrgContext } from '@/shared/auth/context';
import {
  listOrganizationSettingValues,
  upsertOrganizationSettingValue,
} from '../data/organization-settings.repository';
import {
  DEFAULT_SALARY_PAYMENT_DAY,
  EXPENSE_PAYMENT_CONFIRMATION_MODE_KEY,
  SALARY_PAYMENT_CONFIRMATION_MODE_KEY,
  SALARY_PAYMENT_DAY_KEY,
  parseExpensePaymentMode,
  parseSalaryPaymentDay,
  parseSalaryPaymentMode,
  type ExpensePaymentConfirmationMode,
  type OrgFinancialPolicies,
  type SalaryPaymentConfirmationMode,
} from '../domain/org-financial-policies';

export async function getOrgFinancialPolicies(
  context: OrgContext,
): Promise<OrgFinancialPolicies> {
  const map = await listOrganizationSettingValues(context.db, context.organizationId, [
    EXPENSE_PAYMENT_CONFIRMATION_MODE_KEY,
    SALARY_PAYMENT_CONFIRMATION_MODE_KEY,
    SALARY_PAYMENT_DAY_KEY,
  ]);

  return {
    expensePaymentConfirmationMode: parseExpensePaymentMode(
      map.get(EXPENSE_PAYMENT_CONFIRMATION_MODE_KEY),
    ),
    salaryPaymentConfirmationMode: parseSalaryPaymentMode(
      map.get(SALARY_PAYMENT_CONFIRMATION_MODE_KEY),
    ),
    salaryPaymentDay: parseSalaryPaymentDay(
      map.get(SALARY_PAYMENT_DAY_KEY) ?? DEFAULT_SALARY_PAYMENT_DAY,
    ),
  };
}

export async function saveOrgFinancialPolicies(
  context: OrgContext,
  input: {
    readonly expensePaymentConfirmationMode: ExpensePaymentConfirmationMode;
    readonly salaryPaymentConfirmationMode: SalaryPaymentConfirmationMode;
    readonly salaryPaymentDay: number;
  },
): Promise<void> {
  await upsertOrganizationSettingValue(
    context.db,
    context.organizationId,
    EXPENSE_PAYMENT_CONFIRMATION_MODE_KEY,
    input.expensePaymentConfirmationMode,
  );
  await upsertOrganizationSettingValue(
    context.db,
    context.organizationId,
    SALARY_PAYMENT_CONFIRMATION_MODE_KEY,
    input.salaryPaymentConfirmationMode,
  );
  await upsertOrganizationSettingValue(
    context.db,
    context.organizationId,
    SALARY_PAYMENT_DAY_KEY,
    parseSalaryPaymentDay(input.salaryPaymentDay),
  );
}
