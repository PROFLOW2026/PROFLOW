'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { mapServerActionError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { updateMaterialItemTrade } from '@/modules/procurement';

export type MaterialTradeValue = 'electrical' | 'plumbing' | 'steel_rebar' | 'concrete' | null;

export async function setMaterialTradeAction(
  materialId: string,
  trade: MaterialTradeValue,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.PROCUREMENT_MANAGE);
      await updateMaterialItemTrade(context.db, context.organizationId, materialId, trade);
    });
    revalidatePath(`/procurement/materials/${materialId}`);
    return { ok: true };
  } catch (error) {
    const tErrors = await getTranslations('errors');
    return {
      ok: false,
      error: mapServerActionError(error, {
        tErrors: (key) => tErrors(key as 'unexpected'),
        rethrowUnknown: false,
      }).error,
    };
  }
}
