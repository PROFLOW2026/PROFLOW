export function isDemoMintedEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at <= 0) return false;
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (domain === 'demo.pf.internal') return true;
  if (domain === 'employees.pf.internal' || domain === 'contractors.pf.internal') {
    return local.startsWith('demo.');
  }
  return false;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const MINTED_PATTERNS = [
  new RegExp(`^(${UUID})\\.(owner|manager|finance|worker)@demo\\.pf\\.internal$`),
  new RegExp(`^demo\\.(${UUID})\\.employee@employees\\.pf\\.internal$`),
  new RegExp(`^demo\\.(${UUID})\\.contractor@contractors\\.pf\\.internal$`),
];

/** The session organization a demo actor email was minted for, or null when it is not an exact demo actor address. */
export function demoMintedOrganizationId(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  for (const pattern of MINTED_PATTERNS) {
    const match = pattern.exec(normalized);
    if (match) return match[1] ?? null;
  }
  return null;
}

/** Delete only a demo-minted user. Any membership outside this reset's session orgs blocks deletion. No remaining membership is safe: the org row is already gone, and the caller passes only ids saved before that delete. */
export function mayDeleteDemoIdentity(input: {
  readonly email: string;
  readonly membershipOrganizationIds: readonly string[];
  readonly deletingOrganizationIds: ReadonlySet<string>;
}): boolean {
  if (!isDemoMintedEmail(input.email)) return false;
  return input.membershipOrganizationIds.every((id) => input.deletingOrganizationIds.has(id));
}
