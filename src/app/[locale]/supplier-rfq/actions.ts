'use server';

import { getTranslations } from 'next-intl/server';
import {
  SupplierRfqAccessLinkError,
  submitSupplierQuoteViaAccessToken,
} from '@/modules/procurement/application/supplier-rfq-access-links';
import { permitScopedAuthAttempt } from '@/shared/auth/consume-auth-rate-limit';
import { mapServerActionError } from '@/shared/errors';
import { hashSupplierRfqAccessToken } from '@/modules/procurement/domain/supplier-rfq-access-token';

export interface SupplierRfqFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
}

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

function requiredFormValue(formData: FormData, key: string): string {
  return formValue(formData, key) ?? '';
}

function parseLines(formData: FormData) {
  const raw = formData.get('lines');
  if (!raw || typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((line) => {
      const row = line as Record<string, unknown>;
      return {
        description: String(row.description ?? ''),
        quantity: String(row.quantity ?? '1'),
        unitAmount: String(row.unitAmount ?? ''),
        lineTotal: String(row.lineTotal ?? ''),
        currency: String(row.currency ?? ''),
      };
    });
  } catch {
    return [];
  }
}

async function mapAppError(error: unknown): Promise<SupplierRfqFormState> {
  const tErrors = await getTranslations('errors');
  const tProcurement = await getTranslations('procurement');
  if (error instanceof SupplierRfqAccessLinkError) {
    return {
      error: tProcurement(
        `supplierRfqLink.errors.${error.publicReason}` as 'supplierRfqLink.errors.invalid',
      ),
    };
  }
  return mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
    namespaces: {
      procurement: (key) => tProcurement(key as 'errors.notDraft'),
    },
  });
}

export async function submitSupplierRfqQuoteAction(
  _prev: SupplierRfqFormState,
  formData: FormData,
): Promise<SupplierRfqFormState> {
  const t = await getTranslations('procurement');
  const token = requiredFormValue(formData, 'token');
  const lines = parseLines(formData);

  if (!token) return { error: t('supplierRfqLink.errors.invalid') };
  if (lines.length === 0) return { error: t('errors.linesRequired') };

  const throttleKey = hashSupplierRfqAccessToken(token);
  if (!(await permitScopedAuthAttempt('supplier_rfq_submit', throttleKey))) {
    return { error: t('supplierRfqLink.errors.rateLimited') };
  }

  try {
    await submitSupplierQuoteViaAccessToken(token, {
      currency: requiredFormValue(formData, 'currency'),
      receivedOn: formValue(formData, 'receivedOn'),
      notes: formValue(formData, 'notes'),
      lines,
    });
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}
