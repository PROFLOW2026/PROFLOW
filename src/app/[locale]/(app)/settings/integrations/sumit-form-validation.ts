/** Client-side CompanyID gate before SUMIT test connect (numeric only). */
export function isValidSumitCompanyIdInput(value: string): boolean {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return false;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0;
}
