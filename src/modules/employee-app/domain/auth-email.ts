/** Synthetic Supabase auth addresses — never show in owner UI. */
export function isEmployeeAppInternalEmail(email: string | null | undefined): boolean {
  return Boolean(email?.endsWith('@employees.pf.internal'));
}

export function formatOrgMemberLabel(member: {
  readonly displayName: string | null;
  readonly email: string;
}): string {
  if (isEmployeeAppInternalEmail(member.email)) {
    const name = member.displayName?.trim();
    return name && name.length > 0 ? name : 'משתמש אפליקציית עובדים';
  }
  const name = member.displayName?.trim();
  return name && name.length > 0 ? `${name} · ${member.email}` : member.email;
}