/** Synthetic Supabase auth addresses — never show in owner UI. */
export function isEmployeeAppInternalEmail(email: string | null | undefined): boolean {
  return Boolean(email?.endsWith('@employees.pf.internal'));
}

export function formatOrgMemberLabel(
  member: {
    readonly displayName: string | null;
    readonly email: string;
  },
  options?: { readonly anonymousAppUserLabel?: string },
): string {
  if (isEmployeeAppInternalEmail(member.email)) {
    const name = member.displayName?.trim();
    if (name && name.length > 0) return name;
    return options?.anonymousAppUserLabel ?? '';
  }
  const name = member.displayName?.trim();
  return name && name.length > 0 ? `${name} · ${member.email}` : member.email;
}