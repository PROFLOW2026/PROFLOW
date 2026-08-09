'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  archiveComplianceArtifact,
  createComplianceArtifact,
  updateComplianceArtifact,
  type CreateComplianceArtifactInput,
  type UpdateComplianceArtifactInput,
} from '@/modules/compliance';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, ValidationError } from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';

export interface ComplianceFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null) return undefined;
  return String(value);
}

function mapValidationError(error: ValidationError): ComplianceFormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    if (issue.path) fieldErrors[issue.path] = issue.message;
  }
  return { error: error.message, fieldErrors };
}

export async function createComplianceArtifactAction(
  _prev: ComplianceFormState,
  formData: FormData,
): Promise<ComplianceFormState> {
  const tErrors = await getTranslations('errors');
  const locale = await getLocale();

  const input: CreateComplianceArtifactInput = {
    name: formValue(formData, 'name') ?? '',
    artifactKind: formValue(formData, 'artifactKind') as CreateComplianceArtifactInput['artifactKind'],
    referenceNumber: formValue(formData, 'referenceNumber'),
    issuer: formValue(formData, 'issuer'),
    issuedOn: formValue(formData, 'issuedOn'),
    expiresOn: formValue(formData, 'expiresOn'),
    statusMode: formValue(formData, 'statusMode') as CreateComplianceArtifactInput['statusMode'],
    subjectType: formValue(formData, 'subjectType') as CreateComplianceArtifactInput['subjectType'],
    subjectId: formValue(formData, 'subjectId'),
    notes: formValue(formData, 'notes'),
  };

  try {
    const artifact = await withOrgContext((context) => createComplianceArtifact(context, input));
    revalidatePath('/compliance');
    redirect({ href: `/compliance/${artifact.id}`, locale });
  } catch (error) {
    if (error instanceof ValidationError) return mapValidationError(error);
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }

  return {};
}

export async function updateComplianceArtifactAction(
  _prev: ComplianceFormState,
  formData: FormData,
): Promise<ComplianceFormState> {
  const tErrors = await getTranslations('errors');

  const input: UpdateComplianceArtifactInput = {
    artifactId: formValue(formData, 'artifactId') ?? '',
    name: formValue(formData, 'name'),
    artifactKind: formValue(formData, 'artifactKind') as UpdateComplianceArtifactInput['artifactKind'],
    referenceNumber: formValue(formData, 'referenceNumber'),
    issuer: formValue(formData, 'issuer'),
    issuedOn: formValue(formData, 'issuedOn'),
    expiresOn: formValue(formData, 'expiresOn'),
    statusMode: formValue(formData, 'statusMode') as UpdateComplianceArtifactInput['statusMode'],
    subjectType: formValue(formData, 'subjectType') as UpdateComplianceArtifactInput['subjectType'],
    subjectId: formValue(formData, 'subjectId'),
    notes: formValue(formData, 'notes'),
  };

  try {
    await withOrgContext((context) => updateComplianceArtifact(context, input));
    revalidatePath('/compliance');
    revalidatePath(`/compliance/${input.artifactId}`);
    return {};
  } catch (error) {
    if (error instanceof ValidationError) return mapValidationError(error);
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function archiveComplianceArtifactAction(
  artifactId: string,
): Promise<ComplianceFormState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext((context) => archiveComplianceArtifact(context, { artifactId }));
    revalidatePath('/compliance');
    return {};
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}
