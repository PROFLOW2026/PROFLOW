'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  archiveClient,
  createClient,
  createClientContact,
  markClientContactAsPrimary,
  removeClientContact,
  removeClientPartyIdentifier,
  restoreClient,
  updateClient,
  updateClientContact,
  upsertClientPartyIdentifier,
} from '@/modules/clients';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, ValidationError } from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';

export interface ClientFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Set on successful contact/client mutations that keep the user on-page. */
  ok?: boolean;
}

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null) return undefined;
  return String(value);
}

function requiredFormValue(formData: FormData, key: string): string {
  return formValue(formData, key) ?? '';
}

function mapValidationError(error: ValidationError): ClientFormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    if (issue.path) fieldErrors[issue.path] = issue.message;
  }
  return { error: error.message, fieldErrors };
}

export async function createClientAction(
  _prev: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const tErrors = await getTranslations('errors');
  const locale = await getLocale();

  try {
    const primaryContactRoleRaw = formValue(formData, 'primaryContactRole');
    const primaryContactRole =
      primaryContactRoleRaw === 'primary' ||
      primaryContactRoleRaw === 'billing' ||
      primaryContactRoleRaw === 'site' ||
      primaryContactRoleRaw === 'other'
        ? primaryContactRoleRaw
        : undefined;

    const client = await withOrgContext(async (context) =>
      createClient(context, {
        name: requiredFormValue(formData, 'name'),
        legalName: formValue(formData, 'legalName'),
        email: formValue(formData, 'email'),
        phone: formValue(formData, 'phone'),
        website: formValue(formData, 'website'),
        addressLine1: formValue(formData, 'addressLine1'),
        addressLine2: formValue(formData, 'addressLine2'),
        city: formValue(formData, 'city'),
        region: formValue(formData, 'region'),
        postalCode: formValue(formData, 'postalCode'),
        countryCode: formValue(formData, 'countryCode'),
        notes: formValue(formData, 'notes'),
        primaryContactName: formValue(formData, 'primaryContactName'),
        primaryContactPhone: formValue(formData, 'primaryContactPhone'),
        primaryContactEmail: formValue(formData, 'primaryContactEmail'),
        primaryContactRole,
      }),
    );

    revalidatePath('/clients');
    redirect({ href: `/clients/${client.id}`, locale });
  } catch (error) {
    if (error instanceof ValidationError) return mapValidationError(error);
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }

  return {};
}

export async function updateClientAction(
  _prev: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await updateClient(context, {
        clientId: String(formData.get('clientId')),
        name: formValue(formData, 'name'),
        legalName: formValue(formData, 'legalName'),
        email: formValue(formData, 'email'),
        phone: formValue(formData, 'phone'),
        website: formValue(formData, 'website'),
        addressLine1: formValue(formData, 'addressLine1'),
        addressLine2: formValue(formData, 'addressLine2'),
        city: formValue(formData, 'city'),
        region: formValue(formData, 'region'),
        postalCode: formValue(formData, 'postalCode'),
        countryCode: formValue(formData, 'countryCode'),
        notes: formValue(formData, 'notes'),
        clientTypeId: formValue(formData, 'clientTypeId') || null,
        defaultPaymentTermId: formValue(formData, 'defaultPaymentTermId') || null,
      });
    });

    revalidatePath(`/clients/${String(formData.get('clientId'))}`);
    return {};
  } catch (error) {
    if (error instanceof ValidationError) return mapValidationError(error);
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function archiveClientAction(clientId: string): Promise<{ error?: string }> {
  const tErrors = await getTranslations('errors');
  const locale = await getLocale();

  try {
    await withOrgContext(async (context) => {
      await archiveClient(context, { clientId });
    });
    revalidatePath('/clients');
    redirect({ href: '/clients', locale });
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }

  return {};
}

export async function restoreClientAction(clientId: string): Promise<{ error?: string }> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await restoreClient(context, { clientId });
    });
    revalidatePath('/clients');
    revalidatePath(`/clients/${clientId}`);
    return {};
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function addClientContactAction(
  _prev: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await createClientContact(context, {
        clientId: String(formData.get('clientId')),
        name: String(formData.get('name')),
        role: (formData.get('role') as 'primary' | 'billing' | 'site' | 'other') || undefined,
        email: formValue(formData, 'email'),
        phone: formValue(formData, 'phone'),
        notes: formValue(formData, 'notes'),
      });
    });

    revalidatePath(`/clients/${String(formData.get('clientId'))}`);
    return {};
  } catch (error) {
    if (error instanceof ValidationError) return mapValidationError(error);
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function upsertIdentifierAction(
  _prev: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await upsertClientPartyIdentifier(context, {
        clientId: String(formData.get('clientId')),
        type: formData.get('type') as 'tax_id' | 'company_number' | 'vat_number' | 'license_number' | 'other',
        value: String(formData.get('value')),
      });
    });

    revalidatePath(`/clients/${String(formData.get('clientId'))}`);
    return {};
  } catch (error) {
    if (error instanceof ValidationError) return mapValidationError(error);
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function deleteContactAction(contactId: string, clientId: string): Promise<void> {
  await withOrgContext(async (context) => {
    await removeClientContact(context, { contactId });
  });
  revalidatePath(`/clients/${clientId}`);
}

export async function updateClientContactAction(
  _prev: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const tErrors = await getTranslations('errors');
  const clientId = String(formData.get('clientId') ?? '');

  try {
    await withOrgContext(async (context) => {
      await updateClientContact(context, {
        contactId: String(formData.get('contactId')),
        name: formValue(formData, 'name'),
        role: (formData.get('role') as 'primary' | 'billing' | 'site' | 'other') || undefined,
        email: formValue(formData, 'email'),
        phone: formValue(formData, 'phone'),
        notes: formValue(formData, 'notes'),
      });
    });

    revalidatePath(`/clients/${clientId}`);
    return { ok: true };
  } catch (error) {
    if (error instanceof ValidationError) return mapValidationError(error);
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function markClientContactPrimaryAction(
  contactId: string,
  clientId: string,
): Promise<{ error?: string }> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      // Client-wide practical primary only - does not mutate projects.primary_contact_id.
      await markClientContactAsPrimary(context, { contactId });
    });
    revalidatePath(`/clients/${clientId}`);
    return {};
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function deleteIdentifierAction(identifierId: string, clientId: string): Promise<void> {
  await withOrgContext(async (context) => {
    await removeClientPartyIdentifier(context, { identifierId });
  });
  revalidatePath(`/clients/${clientId}`);
}
