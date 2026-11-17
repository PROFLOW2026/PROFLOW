/** Result of attempting to remove a demo session organization row. */
export type DeleteDemoSessionOrganizationResult =
  | { readonly removedOrganization: true; readonly softAbandoned: false }
  | { readonly removedOrganization: false; readonly softAbandoned: true }
  | { readonly removedOrganization: false; readonly softAbandoned: false };

export function deleteDemoSessionOrganizationSucceeded(
  result: DeleteDemoSessionOrganizationResult,
): boolean {
  return result.removedOrganization;
}

/** Active session rows may be hard-deleted; abandoned rows require a durable marker. */
export function mayHardDeleteDemoSessionOrg(input: {
  readonly demoKind: string | null | undefined;
  readonly hasSessionRow: boolean;
  readonly demoAbandonedAt: Date | string | null | undefined;
}): boolean {
  if (input.demoKind !== 'session') return false;
  if (input.hasSessionRow) return true;
  return input.demoAbandonedAt != null;
}

/** Nightly sweeper: never select orgs that still have an active demo_sessions row. */
export function isAbandonedDemoSessionOrgForSweeper(input: {
  readonly demoKind: string | null | undefined;
  readonly hasSessionRow: boolean;
  readonly demoAbandonedAt: Date | string | null | undefined;
}): boolean {
  return (
    input.demoKind === 'session' &&
    !input.hasSessionRow &&
    input.demoAbandonedAt != null
  );
}