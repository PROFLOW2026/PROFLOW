/**
 * Contractor usernames. Globally unique (a contractor may work for several organizations with one
 * account). Supabase Auth needs an email, so each username maps to a synthetic address that is never
 * mailed and never shown to the contractor.
 */

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export const CONTRACTOR_AUTH_EMAIL_DOMAIN = 'contractors.pf.internal';

export function normalizeContractorUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateContractorUsername(
  raw: string,
): { valid: true; normalized: string } | { valid: false } {
  const normalized = normalizeContractorUsername(raw);
  if (!USERNAME_PATTERN.test(normalized)) return { valid: false };
  return { valid: true, normalized };
}

export function contractorAuthEmail(usernameNormalized: string): string {
  return `${usernameNormalized}@${CONTRACTOR_AUTH_EMAIL_DOMAIN}`;
}

export function isContractorAuthEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.toLowerCase().endsWith(`@${CONTRACTOR_AUTH_EMAIL_DOMAIN}`);
}

/** Readable suggestion from the person + company names, e.g. "dana.cohen-elec". */
export function suggestContractorUsername(displayName: string, vendorName: string | null): string {
  const slug = (value: string) =>
    value
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .replace(/\.{2,}/g, '.');
  const person = slug(displayName).slice(0, 18);
  const company = vendorName ? slug(vendorName).split('.')[0]!.slice(0, 10) : '';
  const base = [person, company].filter(Boolean).join('-') || 'contractor';
  const candidate = /^[a-z0-9]/.test(base) ? base : `c${base}`;
  const padded = candidate.length < 3 ? `${candidate}${'0'.repeat(3 - candidate.length)}` : candidate;
  return padded.slice(0, 32);
}
