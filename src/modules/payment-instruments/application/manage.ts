import { eq } from 'drizzle-orm';
import { organizationPaymentInstruments } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ValidationError } from '@/shared/errors';

export interface PaymentInstrumentInput {
  readonly id?: string;
  readonly displayName?: string | null;
  readonly lastFour?: string | null;
  readonly monthlyDebitDay?: number | null;
}

function normalizeLastFour(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (!/^[0-9]{4}$/.test(trimmed)) {
    throw new ValidationError([{ path: 'lastFour', message: 'Last four digits must be exactly 4 numbers' }]);
  }
  return trimmed;
}

function normalizeDebitDay(value: number | null | undefined): number | null {
  if (value == null) return null;
  const day = Math.trunc(value);
  if (day < 1 || day > 28) {
    throw new ValidationError([{ path: 'monthlyDebitDay', message: 'Debit day must be between 1 and 28' }]);
  }
  return day;
}

export async function upsertPaymentInstrument(
  context: OrgContext,
  input: PaymentInstrumentInput,
): Promise<string> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);

  const lastFour = normalizeLastFour(input.lastFour);
  const monthlyDebitDay = normalizeDebitDay(input.monthlyDebitDay);
  const displayName = input.displayName?.trim() || null;

  if (input.id) {
    await context.db
      .update(organizationPaymentInstruments)
      .set({
        displayName,
        lastFour,
        monthlyDebitDay,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(
        eq(organizationPaymentInstruments.id, input.id),
      );
    return input.id;
  }

  const [row] = await context.db
    .insert(organizationPaymentInstruments)
    .values({
      organizationId: context.organizationId,
      instrumentType: 'credit_card',
      displayName,
      lastFour,
      monthlyDebitDay,
      isActive: true,
    })
    .returning({ id: organizationPaymentInstruments.id });

  return row!.id;
}

export async function deactivatePaymentInstrument(
  context: OrgContext,
  instrumentId: string,
): Promise<void> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  await context.db
    .update(organizationPaymentInstruments)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(organizationPaymentInstruments.id, instrumentId));
}
