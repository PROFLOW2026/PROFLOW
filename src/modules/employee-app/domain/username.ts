const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,32}$/;
const SUFFIX_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(raw: string): { valid: true; normalized: string } | { valid: false } {
  const normalized = normalizeUsername(raw);
  if (!USERNAME_PATTERN.test(normalized)) return { valid: false };
  return { valid: true, normalized };
}

const EMPLOYEE_AUTH_EMAIL_SUFFIX = '@employees.pf.internal';

/** Synthetic Supabase email — globally unique, never shown to employees. */
export function buildEmployeeAuthEmail(organizationId: string, usernameNormalized: string): string {
  return `${organizationId}.${usernameNormalized}${EMPLOYEE_AUTH_EMAIL_SUFFIX}`;
}

/**
 * Owner-facing username parsed from the synthetic auth email.
 * Does not change how the address is stored. Organization ids have no dots,
 * so the username is everything after the first dot in the local part.
 */
export function employeeUsernameFromAuthEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at <= 0) return null;
  if (email.slice(at).toLowerCase() !== EMPLOYEE_AUTH_EMAIL_SUFFIX) return null;
  const local = email.slice(0, at);
  const dot = local.indexOf('.');
  if (dot <= 0 || dot >= local.length - 1) return null;
  return local.slice(dot + 1);
}

export function generateDefaultUsername(employeeName: string, employeeNumber: string | null): string {
  const base = (employeeNumber ?? employeeName)
    .replace(/\s+/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 12)
    .toUpperCase();
  const suffix = Math.floor(100 + Math.random() * 900);
  return `${base || 'EMP'}${suffix}`;
}

/** Ordered owner-visible username candidates — first globally free wins at activation. */
export function buildUsernameCandidates(
  employeeNumber: string | null,
  employeeName: string,
): readonly string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string) => {
    const check = validateUsername(raw);
    if (!check.valid || seen.has(check.normalized)) return;
    seen.add(check.normalized);
    candidates.push(raw.toUpperCase());
  };

  if (employeeNumber) {
    const digits = employeeNumber.replace(/\s+/g, '').replace(/[^A-Za-z0-9]/g, '');
    if (digits) {
      push(digits.toUpperCase());
      if (digits.length < 3) {
        push(digits.padStart(3, '0').toUpperCase());
      }
      for (const letter of SUFFIX_LETTERS) {
        push(`${digits}${letter}`.toUpperCase());
        if (digits.length < 3) {
          push(`${digits.padStart(3, '0')}${letter}`.toUpperCase());
        }
      }
    }
  }

  push(generateDefaultUsername(employeeName, employeeNumber));
  for (let attempt = 0; attempt < 12; attempt += 1) {
    push(generateDefaultUsername(employeeName, `${employeeNumber ?? ''}${attempt}`));
  }

  return candidates;
}
