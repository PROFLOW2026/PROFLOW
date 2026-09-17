/** Detect real hire/end date changes on employee update (not merely present in payload). */
export function resolveEmployeeHireEndDateChanges(
  existing: { readonly hireDate: string | null; readonly endDate: string | null },
  input: { readonly hireDate?: string | null; readonly endDate?: string | null },
): { readonly hireDateChanged: boolean; readonly endDateChanged: boolean } {
  const hireDateChanged =
    input.hireDate !== undefined && (input.hireDate ?? null) !== (existing.hireDate ?? null);
  const endDateChanged =
    input.endDate !== undefined && (input.endDate ?? null) !== (existing.endDate ?? null);
  return { hireDateChanged, endDateChanged };
}
