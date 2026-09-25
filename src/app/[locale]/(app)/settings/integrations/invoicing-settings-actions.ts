'use server';

import { getTranslations } from 'next-intl/server';
import { upsertOrgInvoicingSettings } from '@/modules/invoicing-integration';
import type {
  InvoicingPaymentDocumentPolicy,
  InvoicingReceiptIssuance,
  InvoicingStatutoryMode,
} from '@/modules/invoicing-integration/domain/org-invoicing-settings';
import { withOrgContext, requireSession } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { hasPermission } from '@/shared/permissions/assert';
import { revalidatePath } from 'next/cache';

export interface InvoicingSettingsFormState {
  error?: string;
  ok?: boolean;
}

export async function saveInvoicingSettingsAction(
  _prev: InvoicingSettingsFormState,
  formData: FormData,
): Promise<InvoicingSettingsFormState> {
  const tErrors = await getTranslations('settings.integrations.invoicing.errors');
  try {
    const session = await requireSession();
    if (!session.activeOrganizationId) {
      return { error: tErrors('noActiveOrganization') };
    }

    const mode = String(formData.get('mode') ?? 'manual') as InvoicingStatutoryMode;
    const paymentDocumentPolicy = String(
      formData.get('paymentDocumentPolicy') ?? 'tax_invoice_then_receipt',
    ) as InvoicingPaymentDocumentPolicy;
    const receiptIssuance = String(
      formData.get('receiptIssuance') ?? 'automatic',
    ) as InvoicingReceiptIssuance;

    await withOrgContext(async (context) => {
      if (!hasPermission(context, PERMISSIONS.SETTINGS_MANAGE)) {
        throw new Error('forbidden');
      }
      await upsertOrgInvoicingSettings(context, {
        mode: mode === 'external_provider' ? 'external_provider' : 'manual',
        paymentDocumentPolicy,
        receiptIssuance: receiptIssuance === 'manual' ? 'manual' : 'automatic',
      });
    });

    revalidatePath('/settings/integrations');
    revalidatePath('/billing');
    return { ok: true };
  } catch (error) {
    if (error instanceof Error && error.message === 'forbidden') {
      return { error: tErrors('forbidden') };
    }
    return { error: tErrors('saveFailed') };
  }
}
