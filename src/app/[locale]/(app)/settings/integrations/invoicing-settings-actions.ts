'use server';

import { upsertOrgInvoicingSettings } from '@/modules/invoicing-integration/data/org-invoicing-settings.repository';
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
  try {
    const session = await requireSession();
    if (!session.activeOrganizationId) {
      return { error: 'No active organization' };
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
        throw new Error('Forbidden');
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
    return { error: error instanceof Error ? error.message : 'Save failed' };
  }
}
