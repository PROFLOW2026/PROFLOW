const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,32}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(raw: string): { valid: true; normalized: string } | { valid: false } {
  const normalized = normalizeUsername(raw);
  if (!USERNAME_PATTERN.test(normalized)) return { valid: false };
  return { valid: true, normalized };
}

/** Synthetic Supabase email — globally unique, never shown to employees. */
export function buildEmployeeAuthEmail(organizationId: string, usernameNormalized: string): string {
  return `${organizationId}.${usernameNormalized}@employees.pf.internal`;
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
