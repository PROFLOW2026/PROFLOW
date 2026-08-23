'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  acceptSalesQuoteVersion,
  convertWonOpportunity,
  createEstimate,
  createLead,
  createOpportunity,
  createOpportunityNote,
  createProspect,
  createProspectContact,
  createSalesQuote,
  issueSalesQuoteVersion,
  updateLead,
  updateOpportunity,
} from '@/modules/crm';
import { withOrgContext } from '@/shared/auth/session';
import { mapServerActionError } from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';

export interface CrmFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null) return undefined;
  const s = String(value);
  return s === '' ? undefined : s;
}

/** Present empty field → null (clear). Omitted field → undefined (leave unchanged). */
function formValueOrNull(formData: FormData, key: string): string | null | undefined {
  const value = formData.get(key);
  if (value === null) return undefined;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function mapError(error: unknown, tErrors: Awaited<ReturnType<typeof getTranslations>>): CrmFormState {
  return mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
  });
}

export async function createProspectAction(
  _prev: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const tErrors = await getTranslations('errors');
  const locale = await getLocale();
  try {
    const prospect = await withOrgContext((context) =>
      createProspect(context, {
        name: formValue(formData, 'name') ?? '',
        companyName: formValue(formData, 'companyName'),
        email: formValue(formData, 'email'),
        phone: formValue(formData, 'phone'),
        notes: formValue(formData, 'notes'),
      }),
    );
    revalidatePath('/crm');
    redirect({ href: `/crm/prospects/${prospect.id}`, locale });
  } catch (error) {
    return mapError(error, tErrors);
  }
}

export async function createProspectContactAction(
  _prev: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const tErrors = await getTranslations('errors');
  try {
    await withOrgContext((context) =>
      createProspectContact(context, {
        prospectId: formValue(formData, 'prospectId') ?? '',
        name: formValue(formData, 'name') ?? '',
        email: formValue(formData, 'email'),
        phone: formValue(formData, 'phone'),
        role: formValue(formData, 'role'),
      }),
    );
    revalidatePath('/crm');
    return {};
  } catch (error) {
    return mapError(error, tErrors);
  }
}

export async function createLeadAction(
  _prev: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const tErrors = await getTranslations('errors');
  const locale = await getLocale();
  try {
    const lead = await withOrgContext((context) =>
      createLead(context, {
        title: formValue(formData, 'title') ?? '',
        source: formValue(formData, 'source'),
        email: formValue(formData, 'email'),
        phone: formValue(formData, 'phone'),
        notes: formValue(formData, 'notes'),
        prospectId: formValue(formData, 'prospectId'),
      }),
    );
    revalidatePath('/crm');
    redirect({ href: `/crm/leads/${lead.id}`, locale });
  } catch (error) {
    return mapError(error, tErrors);
  }
}

export async function createOpportunityAction(
  _prev: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const tErrors = await getTranslations('errors');
  const locale = await getLocale();
  try {
    const opportunity = await withOrgContext((context) =>
      createOpportunity(context, {
        name: formValue(formData, 'name') ?? '',
        prospectId: formValue(formData, 'prospectId'),
        leadId: formValue(formData, 'leadId'),
        expectedValueAmount: formValue(formData, 'expectedValueAmount'),
        currency: formValue(formData, 'currency'),
        expectedStartDate: formValue(formData, 'expectedStartDate'),
        referralSource: formValue(formData, 'referralSource'),
        notes: formValue(formData, 'notes'),
        nextActionAt: formValue(formData, 'nextActionAt'),
        nextActionText: formValue(formData, 'nextActionText'),
      }),
    );
    revalidatePath('/crm');
    redirect({ href: `/crm/opportunities/${opportunity.id}`, locale });
  } catch (error) {
    return mapError(error, tErrors);
  }
}

export async function updateLeadStatusAction(
  _prev: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const tErrors = await getTranslations('errors');
  const leadId = formValue(formData, 'leadId') ?? '';
  try {
    await withOrgContext((context) =>
      updateLead(context, {
        leadId,
        status: formValue(formData, 'status') as
          | 'new'
          | 'contacted'
          | 'qualified'
          | 'disqualified'
          | 'converted'
          | undefined,
      }),
    );
    revalidatePath('/crm');
    revalidatePath(`/crm/leads/${leadId}`);
    return {};
  } catch (error) {
    return mapError(error, tErrors);
  }
}

export async function createOpportunityNoteAction(
  _prev: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const tErrors = await getTranslations('errors');
  try {
    const opportunityId = formValue(formData, 'opportunityId') ?? '';
    await withOrgContext((context) =>
      createOpportunityNote(context, {
        opportunityId,
        body: formValue(formData, 'body') ?? '',
      }),
    );
    revalidatePath(`/crm/opportunities/${opportunityId}`);
    return {};
  } catch (error) {
    return mapError(error, tErrors);
  }
}

export async function createEstimateAction(
  _prev: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const tErrors = await getTranslations('errors');
  try {
    const opportunityId = formValue(formData, 'opportunityId') ?? '';
    await withOrgContext((context) =>
      createEstimate(context, {
        opportunityId,
        name: formValue(formData, 'name') ?? '',
        internalAmount: formValue(formData, 'internalAmount'),
        currency: formValue(formData, 'currency'),
        notes: formValue(formData, 'notes'),
      }),
    );
    revalidatePath(`/crm/opportunities/${opportunityId}`);
    return {};
  } catch (error) {
    return mapError(error, tErrors);
  }
}

export async function createSalesQuoteAction(
  _prev: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const tErrors = await getTranslations('errors');
  try {
    const opportunityId = formValue(formData, 'opportunityId') ?? '';
    const quantity = formValue(formData, 'quantity') ?? '1';
    const lineTotal = formValue(formData, 'lineTotal') ?? formValue(formData, 'unitAmount') ?? '0';
    const unitAmount = formValue(formData, 'unitAmount') ?? lineTotal;
    await withOrgContext((context) =>
      createSalesQuote(context, {
        opportunityId,
        title: formValue(formData, 'title') ?? '',
        currency: formValue(formData, 'currency'),
        taxAmount: formValue(formData, 'taxAmount'),
        lines: [
          {
            description: formValue(formData, 'lineDescription') ?? '',
            quantity,
            unitAmount,
            lineTotal,
          },
        ],
      }),
    );
    revalidatePath(`/crm/opportunities/${opportunityId}`);
    return {};
  } catch (error) {
    return mapError(error, tErrors);
  }
}

export async function issueSalesQuoteVersionAction(
  _prev: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const tErrors = await getTranslations('errors');
  try {
    await withOrgContext((context) =>
      issueSalesQuoteVersion(context, { versionId: formValue(formData, 'versionId') ?? '' }),
    );
    revalidatePath('/crm');
    return {};
  } catch (error) {
    return mapError(error, tErrors);
  }
}

export async function acceptSalesQuoteVersionAction(
  _prev: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const tErrors = await getTranslations('errors');
  try {
    await withOrgContext((context) =>
      acceptSalesQuoteVersion(context, { versionId: formValue(formData, 'versionId') ?? '' }),
    );
    revalidatePath('/crm');
    return {};
  } catch (error) {
    return mapError(error, tErrors);
  }
}

export async function markOpportunityLostAction(
  _prev: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const tErrors = await getTranslations('errors');
  try {
    const opportunityId = formValue(formData, 'opportunityId') ?? '';
    await withOrgContext((context) =>
      updateOpportunity(context, {
        opportunityId,
        status: 'lost',
        stage: 'lost',
        lostReason: formValue(formData, 'lostReason'),
      }),
    );
    revalidatePath(`/crm/opportunities/${opportunityId}`);
    return {};
  } catch (error) {
    return mapError(error, tErrors);
  }
}

export async function updateOpportunityAction(
  _prev: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const tErrors = await getTranslations('errors');
  try {
    const opportunityId = formValue(formData, 'opportunityId') ?? '';
    await withOrgContext((context) =>
      updateOpportunity(context, {
        opportunityId,
        name: formValue(formData, 'name'),
        stage: formValue(formData, 'stage') as
          | 'qualify'
          | 'estimate'
          | 'quote'
          | 'negotiation'
          | 'won'
          | 'lost'
          | undefined,
        status: formValue(formData, 'status') as 'open' | 'won' | 'lost' | 'cancelled' | undefined,
        expectedValueAmount: formValue(formData, 'expectedValueAmount'),
        currency: formValue(formData, 'currency'),
        expectedStartDate: formValue(formData, 'expectedStartDate'),
        lostReason: formValue(formData, 'lostReason'),
        notes: formValue(formData, 'notes'),
        nextActionAt: formValueOrNull(formData, 'nextActionAt'),
        nextActionText: formValueOrNull(formData, 'nextActionText'),
      }),
    );
    revalidatePath(`/crm/opportunities/${opportunityId}`);
    revalidatePath('/crm');
    return {};
  } catch (error) {
    return mapError(error, tErrors);
  }
}

export async function convertWonOpportunityAction(
  _prev: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const tErrors = await getTranslations('errors');
  const locale = await getLocale();
  try {
    const result = await withOrgContext((context) =>
      convertWonOpportunity(context, {
        opportunityId: formValue(formData, 'opportunityId') ?? '',
        projectName: formValue(formData, 'projectName'),
        salesQuoteVersionId: formValue(formData, 'salesQuoteVersionId'),
      }),
    );
    revalidatePath('/crm');
    revalidatePath('/projects');
    redirect({ href: `/projects/${result.projectId}`, locale });
  } catch (error) {
    return mapError(error, tErrors);
  }
}
