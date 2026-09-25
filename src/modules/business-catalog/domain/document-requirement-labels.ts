/**
 * Locale labels for system document requirement types.
 * DB `label` / `document_type_key` stay canonical; UI overlays by stable identity.
 */

import type { Locale } from '@/shared/i18n/config';
import { resolveLabelLocale } from '@/shared/i18n/intl-locale';

/** Canonical label keys for seeded / system document requirements. */
export type SystemDocumentRequirementLabelKey =
  | 'insurance'
  | 'license'
  | 'electrician_license'
  | 'contract'
  | 'signed_contract';

const SYSTEM_LABEL_KEYS = new Set<string>([
  'insurance',
  'license',
  'electrician_license',
  'contract',
  'signed_contract',
]);

const LABELS_EN: Readonly<Record<SystemDocumentRequirementLabelKey, string>> = {
  insurance: 'Insurance',
  license: 'License',
  electrician_license: 'Electrician license',
  contract: 'Contract',
  signed_contract: 'Signed contract',
};

const LABELS_HE: Readonly<Record<SystemDocumentRequirementLabelKey, string>> = {
  insurance: 'ביטוח',
  license: 'רישיון',
  electrician_license: 'רישיון חשמלאי',
  contract: 'חוזה',
  signed_contract: 'חוזה חתום',
};

const LABELS_AR: Readonly<Record<SystemDocumentRequirementLabelKey, string>> = {
  insurance: 'تأمين',
  license: 'رخصة',
  electrician_license: 'رخصة كهربائي',
  contract: 'عقد',
  signed_contract: 'عقد موقّع',
};

const LABELS_RU: Readonly<Record<SystemDocumentRequirementLabelKey, string>> = {
  insurance: 'Страхование',
  license: 'Лицензия',
  electrician_license: 'Лицензия электрика',
  contract: 'Договор',
  signed_contract: 'Подписанный договор',
};

const LABELS_BY_LOCALE: Readonly<
  Record<Locale, Readonly<Record<SystemDocumentRequirementLabelKey, string>>>
> = {
  en: LABELS_EN,
  'he-IL': LABELS_HE,
  ar: LABELS_AR,
  ru: LABELS_RU,
};

/** Stored DB labels (any locale) that identify a system requirement variant. */
const STORED_LABEL_TO_KEY: Readonly<Record<string, SystemDocumentRequirementLabelKey>> = {
  Insurance: 'insurance',
  'ביטוח': 'insurance',
  License: 'license',
  'רישיון': 'license',
  'Electrician license': 'electrician_license',
  'רישיון חשמלאי': 'electrician_license',
  Contract: 'contract',
  'חוזה': 'contract',
  'Signed contract': 'signed_contract',
  'חוזה חתום': 'signed_contract',
};

const DOCUMENT_TYPE_KEY_ALIASES: Readonly<
  Partial<Record<string, SystemDocumentRequirementLabelKey>>
> = {
  insurance: 'insurance',
  license: 'license',
  electrician_license: 'electrician_license',
  contract: 'contract',
  signed_contract: 'signed_contract',
};

function normalizeStoredLabel(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

export function resolveSystemDocumentRequirementLabelKey(
  documentTypeKey: string,
  storedLabel: string | null | undefined,
): SystemDocumentRequirementLabelKey | null {
  const key = documentTypeKey.trim();
  const label = normalizeStoredLabel(storedLabel);

  if (key === 'electrician_license') return 'electrician_license';

  const alias = DOCUMENT_TYPE_KEY_ALIASES[key];
  if (alias && alias !== 'license') return alias;

  if (label) {
    const byLabel = STORED_LABEL_TO_KEY[label];
    if (byLabel) return byLabel;
  }

  if (key === 'license') {
    if (!label || label === 'License' || label === 'רישיון') return 'license';
    if (label === 'Electrician license' || label === 'רישיון חשמלאי') {
      return 'electrician_license';
    }
    return null;
  }

  if (alias) return alias;
  return null;
}

export function isSystemDocumentRequirement(
  documentTypeKey: string,
  storedLabel: string | null | undefined,
): boolean {
  return resolveSystemDocumentRequirementLabelKey(documentTypeKey, storedLabel) != null;
}

export function localizeDocumentRequirementName(
  documentTypeKey: string,
  storedLabel: string | null | undefined,
  locale: string,
): string {
  const labelKey = resolveSystemDocumentRequirementLabelKey(documentTypeKey, storedLabel);
  if (!labelKey) return normalizeStoredLabel(storedLabel) || documentTypeKey;
  const labels = LABELS_BY_LOCALE[resolveLabelLocale(locale)];
  return labels[labelKey];
}

export function documentRequirementGroupKey(
  documentTypeKey: string,
  storedLabel: string | null | undefined,
): string {
  const systemKey = resolveSystemDocumentRequirementLabelKey(documentTypeKey, storedLabel);
  if (systemKey) return `system:${systemKey}`;
  const label = normalizeStoredLabel(storedLabel);
  return `custom:${documentTypeKey}:${label.toLowerCase()}`;
}

export function isKnownSystemDocumentRequirementLabelKey(
  value: string,
): value is SystemDocumentRequirementLabelKey {
  return SYSTEM_LABEL_KEYS.has(value);
}
