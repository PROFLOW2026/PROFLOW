import { resolveIntlLocale } from '@/shared/i18n/intl-locale';
import type { NamespaceTranslator } from '@/shared/i18n/namespace-translator';

export interface EmployeeCredentialsShareInput {
  readonly employeeName: string;
  readonly organizationName: string;
  readonly username: string;
  readonly temporaryPin: string;
  readonly temporaryPinExpiresAt: Date;
  readonly loginUrl: string;
}

export type CredentialsShareTranslator = NamespaceTranslator;

export function formatCredentialExpiry(date: Date, locale = 'he-IL'): string {
  return date.toLocaleString(resolveIntlLocale(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function buildEmployeeLoginUrl(
  appOrigin: string,
  locale: string,
  username?: string,
): string {
  const base = appOrigin.replace(/\/$/, '');
  const path = `${base}/${locale}/employee/login`;
  const trimmed = username?.trim();
  if (!trimmed) return path;
  return `${path}?u=${encodeURIComponent(trimmed)}`;
}

export function buildCredentialsShareMessage(
  input: EmployeeCredentialsShareInput,
  t: CredentialsShareTranslator,
): string {
  return [
    t('admin.credentialsShare.greeting', { name: input.employeeName }),
    '',
    t('admin.credentialsShare.invitedBy', { organization: input.organizationName }),
    '',
    t('admin.credentialsShare.loginLinkLabel'),
    input.loginUrl,
    '',
    t('admin.credentialsShare.usernameLabel'),
    input.username,
    '',
    t('admin.credentialsShare.tempPinLabel'),
    input.temporaryPin,
    '',
    t('admin.credentialsShare.firstLoginHint'),
  ].join('\n');
}

export function buildCredentialsEmailSubject(
  organizationName: string,
  t: CredentialsShareTranslator,
): string {
  return t('admin.credentialsShare.emailSubject', { organization: organizationName });
}

export function normalizeWhatsAppPhone(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return null;
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  if (digits.length === 9) return `972${digits}`;
  return digits.length >= 10 ? digits : null;
}

export function buildWhatsAppShareUrl(phone: string | null, message: string): string {
  const text = encodeURIComponent(message);
  if (phone) return `https://wa.me/${phone}?text=${text}`;
  return `https://wa.me/?text=${text}`;
}

export function buildMailtoUrl(
  email: string | null | undefined,
  subject: string,
  body: string,
): string {
  // encodeURIComponent (%20 for spaces) — not URLSearchParams (+ for spaces), which Outlook mishandles.
  const query = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const recipient = email?.trim();
  if (recipient) return `mailto:${recipient}?${query}`;
  return `mailto:?${query}`;
}
