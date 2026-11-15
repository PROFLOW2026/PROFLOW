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

/** Delete only a demo-minted user. Any membership outside this reset's session orgs blocks deletion. No remaining membership is safe: the org row is already gone, and the caller passes only ids saved before that delete. */
export function mayDeleteDemoIdentity(input: {
  readonly email: string;
  readonly membershipOrganizationIds: readonly string[];
  readonly deletingOrganizationIds: ReadonlySet<string>;
}): boolean {
  if (!isDemoMintedEmail(input.email)) return false;
  return input.membershipOrganizationIds.every((id) => input.deletingOrganizationIds.has(id));
}
