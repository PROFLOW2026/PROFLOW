import { LOCALES, type Locale } from '@/shared/i18n/config';
import { resolveIntlLocale } from '@/shared/i18n/intl-locale';
import type { NamespaceTranslator } from '@/shared/i18n/namespace-translator';

export type ContractorShareKind = 'invite' | 'reset';

export interface ContractorCredentialsShareInput {
  readonly kind: ContractorShareKind;
  readonly displayName: string;
  readonly organizationName: string;
  readonly username: string;
  readonly linkPath: string;
  readonly linkUrl: string;
  readonly expiresAt: Date;
}

export type ContractorShareTranslator = NamespaceTranslator;

export function isContractorShareLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** Replace the locale segment in a contractor token path (`/{locale}/contractor/...`). */
export function contractorLinkPathForLocale(path: string, locale: Locale): string {
  const parts = path.split('/').filter(Boolean);
  if (parts.length < 2) return path;
  parts[0] = locale;
  return `/${parts.join('/')}`;
}

export function buildContractorLinkUrl(origin: string, path: string): string {
  const base = origin.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function formatContractorShareExpiry(date: Date, locale: string): string {
  return date.toLocaleString(resolveIntlLocale(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function buildContractorCredentialsShareMessage(
  input: ContractorCredentialsShareInput,
  t: ContractorShareTranslator,
  messageLocale: string,
): string {
  const introKey =
    input.kind === 'invite' ? 'manage.credentialsShare.inviteIntro' : 'manage.credentialsShare.resetIntro';
  const stepsKey =
    input.kind === 'invite' ? 'manage.credentialsShare.inviteSteps' : 'manage.credentialsShare.resetSteps';

  return [
    t('manage.credentialsShare.greeting', { name: input.displayName }),
    '',
    t(introKey, { organization: input.organizationName }),
    '',
    t('manage.credentialsShare.linkLabel'),
    input.linkUrl,
    '',
    t('manage.credentialsShare.usernameLabel'),
    input.username,
    '',
    t('manage.credentialsShare.expiresLabel'),
    formatContractorShareExpiry(input.expiresAt, messageLocale),
    '',
    t(stepsKey),
  ].join('\n');
}

export function buildContractorShareEmailSubject(
  kind: ContractorShareKind,
  organizationName: string,
  t: ContractorShareTranslator,
): string {
  const key =
    kind === 'invite' ? 'manage.credentialsShare.emailSubjectInvite' : 'manage.credentialsShare.emailSubjectReset';
  return t(key, { organization: organizationName });
}
