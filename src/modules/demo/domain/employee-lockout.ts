/**
 * A failed employee login may update lockout only after the PIN was checked,
 * and never for a real organization while a demo session cookie is present.
 */
export function shouldRecordEmployeeLockout(input: {
  readonly pinVerified: boolean;
  readonly demoSessionPresent: boolean;
  readonly accountOrganizationIsDemo: boolean;
}): boolean {
  if (!input.pinVerified) return false;
  if (input.demoSessionPresent && !input.accountOrganizationIsDemo) return false;
  return true;
}
