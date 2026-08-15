'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  createInvitation,
  revokeInvitation,
  setModuleVisibility,
  saveWorkMix,
  isOptionalModuleKey,
  isWorkMix,
  parseModuleVisibilityMode,
  applyOrganizationProfessionPreset,
  applyOrganizationBusinessProfile,
  createServiceDomain,
  createDocumentType,
  renameCatalogItem,
  archiveCatalogItem,
  upsertOrgProjectTemplate,
  deleteOrgProjectTemplate,
  upsertOrgPhasePack,
  deleteOrgPhasePack,
  upsertOrgWorkPackagePack,
  deleteOrgWorkPackagePack,
  saveLaborCostDefaults,
  saveDocumentNumberSettings,
  DOCUMENT_NUMBER_KINDS,
  isDocumentNumberKind,
  updateOrganizationLegalIdentity,
} from '@/modules/tenancy';
import { setRolePermissionToggle } from '@/modules/rbac';
import { updateProfile } from '@/modules/identity';
import { createOrgTaxRule, updateOrgTaxRule } from '@/modules/tax';
import { getEmailPort } from '@/shared/ports/email';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, serializeError } from '@/shared/errors';
import { isPermissionKey } from '@/shared/permissions/catalog';
import { removeMemberAccess, updateOrganizationProfile } from '@/modules/tenancy';
import {
  archiveCostCategory,
  createCostCategory,
  renameCostCategory,
  setCostCategoryPolicy,
} from './_lib/cost-categories';

export interface SettingsActionState {
  ok?: boolean;
  error?: string;
  invitationLink?: string;
  invitationEmail?: string;
  invitationExpires?: string;
}

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

function formBool(formData: FormData, key: string): boolean {
  return formData.get(key) === 'on' || formData.get(key) === 'true';
}

function deriveTaxRuleKey(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (slug.length >= 2) return `org_${slug}`.slice(0, 64);
  return `org_rule_${Date.now().toString(36)}`;
}

function formNullableBool(formData: FormData, key: string): boolean | null {
  const value = formData.get(key);
  return parseModuleVisibilityMode(value == null ? null : String(value));
}

export async function applyProfessionPresetAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');
  const preset = formValue(formData, 'professionPreset');
  if (!preset) return { error: tErrors('validationFailed') };

  try {
    await withOrgContext((context) =>
      applyOrganizationProfessionPreset(context, { professionPreset: preset }),
    );
    revalidatePath('/settings/business');
    revalidatePath('/settings/cost-categories');
    revalidatePath('/settings/features');
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function applyBusinessProfileAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');
  const profile = formValue(formData, 'businessProfile');
  if (!profile) return { error: tErrors('validationFailed') };

  try {
    await withOrgContext((context) =>
      applyOrganizationBusinessProfile(context, { businessProfile: profile }),
    );
    revalidatePath('/settings/business');
    revalidatePath('/settings/cost-categories');
    revalidatePath('/settings/features');
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function updateBusinessProfileAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext((context) =>
      updateOrganizationProfile(context, {
        name: formValue(formData, 'name'),
        countryCode: formValue(formData, 'countryCode'),
        baseCurrency: formValue(formData, 'baseCurrency'),
        timezone: formValue(formData, 'timezone'),
        defaultLocale: formValue(formData, 'defaultLocale'),
      }),
    );
    revalidatePath('/settings/business');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function saveOrganizationLegalIdentityAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext((context) =>
      updateOrganizationLegalIdentity(context, {
        taxId: formValue(formData, 'taxId') ?? null,
        companyNumber: formValue(formData, 'companyNumber') ?? null,
      }),
    );
    revalidatePath('/settings/business');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function inviteMemberAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');
  const locale = await getLocale();

  const email = formValue(formData, 'email');
  const roleKey = formValue(formData, 'roleKey');
  if (!email || !roleKey) return { error: tErrors('validationFailed') };

  try {
    const result = await withOrgContext((context) =>
      createInvitation(context, { email, roleKey }),
    );

    const emailPort = getEmailPort();
    const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/${locale}/accept-invite?token=${result.token}`;

    if (emailPort.configured) {
      await emailPort.send({
        to: result.email,
        subject: 'ProjectFlow invitation',
        text: `You have been invited to join an organization on ProjectFlow.\n\nAccept: ${acceptUrl}`,
      });
      revalidatePath('/settings/people');
      return { ok: true };
    }

    revalidatePath('/settings/people');
    return {
      ok: true,
      invitationLink: acceptUrl,
      invitationEmail: result.email,
      invitationExpires: result.expiresAt.toISOString(),
    };
  } catch (error) {
    if (error instanceof AppError) {
      const key = serializeError(error).messageKey.replace('errors.', '');
      return { error: tErrors(key as 'validationFailed') };
    }
    throw error;
  }
}

export async function revokeInvitationAction(invitationId: string): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext((context) => revokeInvitation(context, invitationId));
    revalidatePath('/settings/people');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function removeMemberAction(membershipId: string): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext((context) => removeMemberAccess(context, membershipId));
    revalidatePath('/settings/people');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('notAllowed') };
    throw error;
  }
}

export async function setRoleToggleAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');
  const roleKey = formValue(formData, 'roleKey');
  const permission = formValue(formData, 'permission');
  const enabled = formBool(formData, 'enabled');

  if (!roleKey || !permission || !isPermissionKey(permission)) {
    return { error: tErrors('validationFailed') };
  }

  try {
    await withOrgContext((context) =>
      setRolePermissionToggle(context, { roleKey, permission, enabled }),
    );
    revalidatePath('/settings/roles');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function setModuleVisibilityAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');
  const moduleKey = formValue(formData, 'moduleKey');
  if (!moduleKey || !isOptionalModuleKey(moduleKey)) {
    return { error: tErrors('validationFailed') };
  }

  const enabled = formNullableBool(formData, 'enabled');

  try {
    await withOrgContext((context) =>
      setModuleVisibility(context, { moduleKey, enabled }),
    );
    revalidatePath('/settings/features');
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function setWorkMixAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');
  const workMix = formValue(formData, 'workMix');
  if (!workMix || !isWorkMix(workMix)) {
    return { error: tErrors('validationFailed') };
  }

  try {
    await withOrgContext((context) => saveWorkMix(context, workMix));
    revalidatePath('/settings/features');
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function createCostCategoryAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');

  try {
    const methodRaw = formValue(formData, 'defaultAllocationMethod');
    const periodRaw = formValue(formData, 'defaultPeriodBehavior');
    await withOrgContext((context) =>
      createCostCategory(context, {
        name: formValue(formData, 'name'),
        family: formValue(formData, 'family'),
        defaultAllocationMethod: methodRaw === '__none__' ? null : (methodRaw ?? null),
        defaultPeriodBehavior: periodRaw === '__none__' ? null : (periodRaw ?? null),
      }),
    );
    revalidatePath('/settings/cost-categories');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function renameCostCategoryAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext((context) =>
      renameCostCategory(context, {
        categoryId: formValue(formData, 'categoryId'),
        name: formValue(formData, 'name'),
      }),
    );
    revalidatePath('/settings/cost-categories');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function archiveCostCategoryAction(categoryId: string): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext((context) => archiveCostCategory(context, categoryId));
    revalidatePath('/settings/cost-categories');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function setCostCategoryPolicyAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');

  try {
    const methodRaw = formValue(formData, 'defaultAllocationMethod');
    const periodRaw = formValue(formData, 'defaultPeriodBehavior');
    await withOrgContext((context) =>
      setCostCategoryPolicy(context, {
        categoryId: formValue(formData, 'categoryId'),
        defaultAllocationMethod: methodRaw === '__none__' || !methodRaw ? null : methodRaw,
        defaultPeriodBehavior: periodRaw === '__none__' || !periodRaw ? null : periodRaw,
      }),
    );
    revalidatePath('/settings/cost-categories');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function createTaxRuleAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');

  const name = formValue(formData, 'name');
  const validFrom = formValue(formData, 'validFrom');
  const key = formValue(formData, 'key') ?? (name ? deriveTaxRuleKey(name) : undefined);
  if (!key || !name || !validFrom) return { error: tErrors('validationFailed') };

  try {
    await withOrgContext((context) =>
      createOrgTaxRule(context, {
        key,
        name,
        method: 'percentage',
        ratePercent: formValue(formData, 'ratePercent'),
        validFrom,
        validTo: formValue(formData, 'validTo') ?? null,
        isDefault: formBool(formData, 'isDefault'),
      }),
    );
    revalidatePath('/settings/tax');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function updateTaxRuleAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext((context) =>
      updateOrgTaxRule(context, {
        ruleId: formValue(formData, 'ruleId')!,
        name: formValue(formData, 'name'),
        ratePercent: formValue(formData, 'ratePercent'),
        validFrom: formValue(formData, 'validFrom'),
        validTo: formValue(formData, 'validTo') ?? null,
      }),
    );
    revalidatePath('/settings/tax');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function updateProfileAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await updateProfile(context.db, context.userId, {
        displayName: formValue(formData, 'displayName') ?? null,
        localePreference: formValue(formData, 'localePreference') ?? null,
      });
    });
    revalidatePath('/settings/profile');
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function createServiceDomainAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');
  const name = formValue(formData, 'name');
  if (!name) return { error: tErrors('validationFailed') };

  try {
    await withOrgContext((context) => createServiceDomain(context, { name }));
    revalidatePath('/settings/catalog');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: error.message || tErrors('unexpected') };
    throw error;
  }
}

export async function createDocumentTypeAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');
  const name = formValue(formData, 'name');
  if (!name) return { error: tErrors('validationFailed') };

  try {
    await withOrgContext((context) => createDocumentType(context, { name }));
    revalidatePath('/settings/catalog');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: error.message || tErrors('unexpected') };
    throw error;
  }
}

export async function renameCatalogItemAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');
  const id = formValue(formData, 'id');
  const name = formValue(formData, 'name');
  if (!id || !name) return { error: tErrors('validationFailed') };

  try {
    await withOrgContext((context) => renameCatalogItem(context, { id, name }));
    revalidatePath('/settings/catalog');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: error.message || tErrors('unexpected') };
    throw error;
  }
}

export async function archiveCatalogItemAction(id: string): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');
  if (!id) return { error: tErrors('validationFailed') };

  try {
    await withOrgContext((context) => archiveCatalogItem(context, id));
    revalidatePath('/settings/catalog');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: error.message || tErrors('unexpected') };
    throw error;
  }
}

function parseLaborComponentsText(raw: string | undefined): Array<{
  key: string;
  basis: 'percent' | 'fixed';
  percent: string | null;
  amount: string | null;
}> {
  if (!raw?.trim()) return [];
  const components: Array<{
    key: string;
    basis: 'percent' | 'fixed';
    percent: string | null;
    amount: string | null;
  }> = [];

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = /^([^=]+)=(percent|fixed):(.+)$/i.exec(trimmed);
    if (!match) continue;
    const key = match[1]!.trim();
    const basis = match[2]!.toLowerCase() as 'percent' | 'fixed';
    const value = match[3]!.trim();
    components.push({
      key,
      basis,
      percent: basis === 'percent' ? value || null : null,
      amount: basis === 'fixed' ? value || null : null,
    });
  }
  return components;
}

export async function saveLaborCostDefaultsAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');
  const burdenRaw = formValue(formData, 'burdenPercent');
  const components = parseLaborComponentsText(formValue(formData, 'componentsText') ?? undefined);

  try {
    await withOrgContext((context) =>
      saveLaborCostDefaults(context, {
        burdenPercent: burdenRaw ?? null,
        components,
      }),
    );
    revalidatePath('/settings/catalog');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: error.message || tErrors('unexpected') };
    throw error;
  }
}

export async function upsertOrgProjectTemplateAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');
  try {
    await withOrgContext((context) =>
      upsertOrgProjectTemplate(context, {
        name: formValue(formData, 'name'),
        description: formValue(formData, 'description') ?? null,
        workPackagesText: formValue(formData, 'workPackagesText'),
        milestonesText: formValue(formData, 'milestonesText'),
      }),
    );
    revalidatePath('/settings/templates');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function deleteOrgProjectTemplateAction(
  templateId: string,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');
  try {
    await withOrgContext((context) => deleteOrgProjectTemplate(context, templateId));
    revalidatePath('/settings/templates');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function upsertOrgPhasePackAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');
  try {
    await withOrgContext((context) =>
      upsertOrgPhasePack(context, {
        name: formValue(formData, 'name'),
        phasesText: formValue(formData, 'phasesText'),
      }),
    );
    revalidatePath('/settings/templates');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function deleteOrgPhasePackAction(packId: string): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');
  try {
    await withOrgContext((context) => deleteOrgPhasePack(context, packId));
    revalidatePath('/settings/templates');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function upsertOrgWorkPackagePackAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');
  try {
    await withOrgContext((context) =>
      upsertOrgWorkPackagePack(context, {
        name: formValue(formData, 'name'),
        workPackagesText: formValue(formData, 'workPackagesText'),
      }),
    );
    revalidatePath('/settings/templates');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function deleteOrgWorkPackagePackAction(packId: string): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');
  try {
    await withOrgContext((context) => deleteOrgWorkPackagePack(context, packId));
    revalidatePath('/settings/templates');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function saveDocumentNumberSettingsAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');
  const sequences: Array<{
    documentKind: (typeof DOCUMENT_NUMBER_KINDS)[number];
    prefix: string;
    padding: number;
    nextNumber: number;
  }> = [];

  for (const kind of DOCUMENT_NUMBER_KINDS) {
    const marked = formValue(formData, `kind.${kind}`);
    if (marked && !isDocumentNumberKind(marked)) {
      return { error: tErrors('validationFailed') };
    }
    if (!formData.has(`padding.${kind}`)) continue;
    sequences.push({
      documentKind: kind,
      prefix: formValue(formData, `prefix.${kind}`) ?? '',
      padding: Number(formData.get(`padding.${kind}`)),
      nextNumber: Number(formData.get(`nextNumber.${kind}`)),
    });
  }

  if (sequences.length === 0) return { error: tErrors('validationFailed') };

  try {
    await withOrgContext((context) => saveDocumentNumberSettings(context, { sequences }));
    revalidatePath('/settings/numbering');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}
