'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { saveOpeningCashBalance } from '@/modules/tenancy/application/opening-cash-balance';
import { withOrgContext } from '@/shared/auth/session';
import { mapServerActionError } from '@/shared/errors';

export interface OpeningCashActionState {
  ok?: boolean;
  error?: string;
}

export async function saveOpeningCashBalanceAction(
  _prev: OpeningCashActionState,
  formData: FormData,
): Promise<OpeningCashActionState> {
  const tErrors = await getTranslations('errors');
  const tFinancial = await getTranslations('financial');
  const amount = String(formData.get('amount') ?? '').trim();
  const currency = String(formData.get('currency') ?? '').trim();
  const asOf = String(formData.get('asOf') ?? '').trim();

  try {
    await withOrgContext((context) =>
      saveOpeningCashBalance(context, { amount, currency, asOf }),
    );
    revalidatePath('/cash-flow');
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (error) {
    const mapped = mapServerActionError(error, {
      tErrors,
      namespaces: { financial: tFinancial },
    });
    return { error: mapped.fieldErrors?.openingCashBalance ?? mapped.fieldErrors?.amount ?? mapped.fieldErrors?.currency ?? mapped.error };
  }
}
